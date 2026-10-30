import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ITEM_KINDS = {
  apple: { name: '사과', emoji: '🍎' },
  mushroom: { name: '버섯', emoji: '🍄' },
  star: { name: '별사탕', emoji: '⭐' },
  fish: { name: '물고기', emoji: '🐟' },
  flower: { name: '벚꽃', emoji: '🌸' },
  gem: { name: '보석', emoji: '💎' },
  cake: { name: '케이크', emoji: '🍰' },
  ribbon: { name: '리본', emoji: '🎀' },
};
const KIND_KEYS = Object.keys(ITEM_KINDS);
export const randomKind = () => KIND_KEYS[Math.floor(Math.random() * KIND_KEYS.length)];

const STARTER_COINS = 100;
const STARTER_ITEMS = 3;

const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../data/app.db', import.meta.url));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    animal     TEXT    NOT NULL,
    color      TEXT    NOT NULL,
    coins      INTEGER NOT NULL DEFAULT ${STARTER_COINS} CHECK (coins >= 0),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    last_seen  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users(id),
    kind       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_items_owner ON items(owner_id);

  CREATE TABLE IF NOT EXISTS trades (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    a_id       INTEGER NOT NULL REFERENCES users(id),
    b_id       INTEGER NOT NULL REFERENCES users(id),
    a_items    TEXT    NOT NULL, -- JSON 배열: a가 b에게 준 item id
    b_items    TEXT    NOT NULL,
    a_coins    INTEGER NOT NULL,
    b_coins    INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE name = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (name, animal, color) VALUES (?, ?, ?)'),
  updateLook: db.prepare("UPDATE users SET animal = ?, color = ?, last_seen = datetime('now') WHERE id = ?"),
  insertItem: db.prepare('INSERT INTO items (owner_id, kind) VALUES (?, ?)'),
  itemsOf: db.prepare('SELECT id, kind FROM items WHERE owner_id = ? ORDER BY id'),
  coinsOf: db.prepare('SELECT coins FROM users WHERE id = ?'),
  itemOwner: db.prepare('SELECT owner_id FROM items WHERE id = ?'),
  moveItem: db.prepare('UPDATE items SET owner_id = ? WHERE id = ?'),
  addCoins: db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?'),
  logTrade: db.prepare('INSERT INTO trades (a_id, b_id, a_items, b_items, a_coins, b_coins) VALUES (?, ?, ?, ?, ?, ?)'),
};

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** 닉네임으로 로그인. 처음 오는 유저면 코인과 시작 아이템을 준다. */
export function loginUser(name, animal, color) {
  return tx(() => {
    const existing = q.userByName.get(name);
    if (existing) {
      q.updateLook.run(animal, color, existing.id);
      return { ...existing, animal, color, isNew: false };
    }
    const id = Number(q.insertUser.run(name, animal, color).lastInsertRowid);
    for (let i = 0; i < STARTER_ITEMS; i++) q.insertItem.run(id, randomKind());
    return { ...q.userById.get(id), isNew: true };
  });
}

export function getInventory(userId) {
  return {
    coins: q.coinsOf.get(userId)?.coins ?? 0,
    items: q.itemsOf.all(userId).map((it) => ({ id: it.id, kind: it.kind, ...ITEM_KINDS[it.kind] })),
  };
}

/**
 * 두 유저의 제안을 한 트랜잭션으로 맞바꾼다.
 * a, b: { userId, items: number[], coins: number } — 각자 상대에게 주는 것.
 * 소유권이나 잔액이 그새 바뀌었으면 에러를 던지고 아무것도 바뀌지 않는다.
 */
export function executeTrade(a, b) {
  return tx(() => {
    for (const side of [a, b]) {
      for (const itemId of side.items) {
        if (q.itemOwner.get(itemId)?.owner_id !== side.userId) throw new Error('아이템이 더 이상 가방에 없어요');
      }
      if ((q.coinsOf.get(side.userId)?.coins ?? 0) < side.coins) throw new Error('코인이 부족해요');
    }
    for (const [from, to] of [[a, b], [b, a]]) {
      for (const itemId of from.items) q.moveItem.run(to.userId, itemId);
      q.addCoins.run(-from.coins, from.userId);
      q.addCoins.run(from.coins, to.userId);
    }
    q.logTrade.run(a.userId, b.userId, JSON.stringify(a.items), JSON.stringify(b.items), a.coins, b.coins);
  });
}

export function giveItem(userId, kind) {
  q.insertItem.run(userId, kind);
}

export function addCoins(userId, amount) {
  q.addCoins.run(amount, userId);
}
