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

  -- 마당 꾸미기 아이템. placed = 0이면 보관함, 1이면 마당 중심 기준 (x, z)에 rot 각도로 놓임
  CREATE TABLE IF NOT EXISTS decor (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users(id),
    kind       TEXT    NOT NULL,
    placed     INTEGER NOT NULL DEFAULT 0,
    x          REAL    NOT NULL DEFAULT 0,
    z          REAL    NOT NULL DEFAULT 0,
    rot        REAL    NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_decor_owner ON decor(owner_id);
`);

// 예전 DB에 마당 번호 컬럼이 없으면 추가
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'plot')) {
  db.exec('ALTER TABLE users ADD COLUMN plot INTEGER');
}

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
  takenPlots: db.prepare('SELECT plot FROM users WHERE plot IS NOT NULL'),
  setPlot: db.prepare('UPDATE users SET plot = ? WHERE id = ?'),
  yards: db.prepare('SELECT plot, name, color FROM users WHERE plot IS NOT NULL'),
  insertDecor: db.prepare('INSERT INTO decor (owner_id, kind) VALUES (?, ?)'),
  decorOf: db.prepare('SELECT id, kind, placed FROM decor WHERE owner_id = ? ORDER BY id'),
  decorById: db.prepare('SELECT * FROM decor WHERE id = ?'),
  placedCount: db.prepare('SELECT COUNT(*) AS n FROM decor WHERE owner_id = ? AND placed = 1'),
  placeDecor: db.prepare('UPDATE decor SET placed = 1, x = ?, z = ?, rot = ? WHERE id = ?'),
  storeDecor: db.prepare('UPDATE decor SET placed = 0 WHERE id = ?'),
  placedDecor: db.prepare(`
    SELECT d.id, d.kind, d.x, d.z, d.rot, u.plot
    FROM decor d JOIN users u ON u.id = d.owner_id
    WHERE d.placed = 1 AND u.plot IS NOT NULL`),
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

/** 유저의 마당 번호. 없으면 비어 있는 첫 마당을 영구 배정한다 (꽉 찼으면 null). */
export function claimPlot(user, plotCount) {
  if (user.plot != null) return user.plot;
  return tx(() => {
    const taken = new Set(q.takenPlots.all().map((r) => r.plot));
    for (let i = 0; i < plotCount; i++) {
      if (!taken.has(i)) {
        q.setPlot.run(i, user.id);
        return i;
      }
    }
    return null;
  });
}

export const listYards = () => q.yards.all().map((r) => ({ ...r }));
export const listPlacedDecor = () => q.placedDecor.all().map((r) => ({ ...r }));
export const decorOf = (userId) => q.decorOf.all(userId).map((r) => ({ ...r, placed: !!r.placed }));

/** 코인을 내고 꾸미기 아이템을 보관함에 넣는다. */
export function buyDecor(userId, kind, price) {
  return tx(() => {
    if ((q.coinsOf.get(userId)?.coins ?? 0) < price) throw new Error('코인이 부족해요');
    q.addCoins.run(-price, userId);
    return Number(q.insertDecor.run(userId, kind).lastInsertRowid);
  });
}

export function placeDecor(userId, id, x, z, rot, maxPlaced) {
  const row = q.decorById.get(id);
  if (row?.owner_id !== userId) throw new Error('내 아이템이 아니에요');
  if (!row.placed && q.placedCount.get(userId).n >= maxPlaced) throw new Error(`마당에는 ${maxPlaced}개까지 놓을 수 있어요`);
  q.placeDecor.run(x, z, rot, id);
  return { id, kind: row.kind, x, z, rot };
}

export function storeDecor(userId, id) {
  const row = q.decorById.get(id);
  if (row?.owner_id !== userId || !row.placed) throw new Error('되돌릴 수 없는 아이템이에요');
  q.storeDecor.run(id);
}
