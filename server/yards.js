import {
  addCoins,
  buyDecor,
  decorOf,
  getInventory,
  listPlacedDecor,
  listYards,
  placeDecor,
  storeDecor,
} from './db.js';

// public/js/yards.js와 맞춘다
export const PLOT_COUNT = 8;
const PLOT_RADIUS = 5.5;
const MAX_PLACED = 40;
const DEMO_COINS = 100;

/**
 * 상점 카탈로그. r = 바닥 차지 반경(마당 밖으로 못 나가게 하는 데 씀).
 * 사내 상점과 붙일 땐 이 목록을 사내 상품 테이블에서 읽어 오면 된다.
 */
export const CATALOG = {
  pink_tree: { name: '벚꽃나무', price: 40, r: 0.9 },
  round_tree: { name: '동글나무', price: 30, r: 0.9 },
  flower_bed: { name: '꽃밭', price: 15, r: 0.8 },
  bench: { name: '벤치', price: 25, r: 0.8 },
  lamp: { name: '가로등', price: 20, r: 0.3 },
  mushroom_house: { name: '버섯집', price: 90, r: 1.4 },
  pond: { name: '연못', price: 45, r: 1.2 },
  balloon: { name: '풍선', price: 10, r: 0.3 },
  tent: { name: '텐트', price: 60, r: 1.2 },
  snowman: { name: '눈사람', price: 30, r: 0.5 },
  stones: { name: '징검돌', price: 10, r: 0.7 },
  mailbox: { name: '우체통', price: 15, r: 0.3 },
};

const num = (v) => (Number.isFinite(v) ? v : NaN);

export function setupYards(io, players) {
  const sendMine = (socket, userId) => socket.emit('decor:mine', decorOf(userId));

  return {
    /** 접속 직후 클라이언트에 줄 마당 정보 */
    snapshot: (userId) => ({
      catalog: CATALOG,
      yards: listYards(),
      decor: listPlacedDecor(),
      myDecor: decorOf(userId),
    }),

    bind(socket) {
      const me = () => players.get(socket.id);
      // ack가 없는 이벤트도 서버가 죽지 않게
      const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

      socket.on('shop:buy', ({ kind } = {}, ack) => {
        const p = me();
        const item = CATALOG[kind];
        if (!p || !item) return reply(ack, { ok: false, error: '없는 상품이에요' });
        try {
          buyDecor(p.userId, kind, item.price);
        } catch (err) {
          return reply(ack, { ok: false, error: err.message });
        }
        socket.emit('inventory', getInventory(p.userId));
        sendMine(socket, p.userId);
        reply(ack, { ok: true });
      });

      socket.on('decor:place', ({ id, x, z, rot } = {}, ack) => {
        const p = me();
        if (!p) return;
        if (p.plot == null) return reply(ack, { ok: false, error: '마당이 없어요' });
        [x, z, rot] = [num(x), num(z), num(rot)];
        if ([x, z, rot].some(Number.isNaN)) return reply(ack, { ok: false, error: '잘못된 위치예요' });

        const kind = decorOf(p.userId).find((d) => d.id === id)?.kind;
        const r = CATALOG[kind]?.r ?? 0.5;
        if (Math.hypot(x, z) + r > PLOT_RADIUS - 0.2) return reply(ack, { ok: false, error: '마당 안에만 놓을 수 있어요' });

        let placed;
        try {
          placed = placeDecor(p.userId, id, x, z, rot, MAX_PLACED);
        } catch (err) {
          return reply(ack, { ok: false, error: err.message });
        }
        io.emit('decor:placed', { ...placed, plot: p.plot });
        sendMine(socket, p.userId);
        reply(ack, { ok: true });
      });

      socket.on('decor:store', ({ id } = {}, ack) => {
        const p = me();
        if (!p) return;
        try {
          storeDecor(p.userId, id);
        } catch (err) {
          return reply(ack, { ok: false, error: err.message });
        }
        io.emit('decor:removed', { id });
        sendMine(socket, p.userId);
        reply(ack, { ok: true });
      });

      // 데모 전용: 상점 테스트용 코인 충전
      socket.on('demo:coins', () => {
        const p = me();
        if (!p) return;
        addCoins(p.userId, DEMO_COINS);
        socket.emit('inventory', getInventory(p.userId));
      });
    },
  };
}
