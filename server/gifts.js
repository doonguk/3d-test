import { ITEM_KINDS, giveItem, addCoins, getInventory } from './db.js';

const MAX_GIFTS = 14;
const SPAWN_EVERY_MS = 5000;
const PICKUP_DISTANCE = 2.5;
const COIN_CHANCE = 0.3;
const COIN_AMOUNT = 15;

/** 마을 곳곳에 선물상자를 뿌리고, 가까이 간 사람이 주우면 아이템이나 코인을 준다. */
export function setupGifts(io, players) {
  const gifts = new Map();
  let nextId = 1;
  const kinds = Object.keys(ITEM_KINDS);

  function spawn() {
    if (gifts.size >= MAX_GIFTS) return;
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 26;
    const coin = Math.random() < COIN_CHANCE;
    const gift = {
      id: nextId++,
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      kind: coin ? 'coin' : kinds[Math.floor(Math.random() * kinds.length)],
    };
    gifts.set(gift.id, gift);
    io.emit('gift:spawn', gift);
  }
  for (let i = 0; i < MAX_GIFTS / 2; i++) spawn();
  setInterval(spawn, SPAWN_EVERY_MS);

  return {
    list: () => [...gifts.values()],
    bind(socket) {
      socket.on('gift:pickup', (id) => {
        const p = players.get(socket.id);
        const gift = gifts.get(id);
        if (!p || !gift || Math.hypot(p.x - gift.x, p.z - gift.z) > PICKUP_DISTANCE) return;
        gifts.delete(id);
        io.emit('gift:remove', { id });

        if (gift.kind === 'coin') {
          addCoins(p.userId, COIN_AMOUNT);
          socket.emit('gift:got', { text: `🪙 코인 ${COIN_AMOUNT}개를 주웠어요!` });
        } else {
          giveItem(p.userId, gift.kind);
          const { emoji, name } = ITEM_KINDS[gift.kind];
          socket.emit('gift:got', { text: `${emoji} ${name}을(를) 주웠어요!` });
        }
        socket.emit('inventory', getInventory(p.userId));
      });
    },
  };
}
