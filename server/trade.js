import { executeTrade, getInventory } from './db.js';

const TRADE_DISTANCE = 8;

/**
 * 1:1 거래 흐름: request → respond(수락) → offer(여러 번) → ready(양쪽) → 체결.
 * 제안이 바뀌면 양쪽 '준비'가 풀려서, 상대가 몰래 바꾼 조건으로 체결되지 않는다.
 */
export function setupTrade(io, players) {
  const trades = new Map(); // sid -> trade (참가자 둘 다 같은 객체를 가리킴)
  const pending = new Map(); // 받은 사람 sid -> Set(보낸 사람 sid)

  const emptyOffer = () => ({ items: [], coins: 0 });

  function emitState(trade) {
    for (const sid of trade.sids) {
      io.to(sid).emit('trade:update', { offers: trade.offers, ready: trade.ready });
    }
  }

  function close(trade, reason) {
    for (const sid of trade.sids) {
      trades.delete(sid);
      if (reason) io.to(sid).emit('trade:closed', { reason });
    }
  }

  return function bind(socket) {
    const me = () => players.get(socket.id);

    socket.on('trade:request', ({ to } = {}) => {
      const from = me();
      const target = players.get(to);
      if (!from || !target || to === socket.id) return;
      if (trades.has(socket.id)) return socket.emit('trade:error', '이미 거래 중이에요');
      if (trades.has(to)) return socket.emit('trade:error', `${target.name} 님은 다른 친구와 거래 중이에요`);
      if (Math.hypot(from.x - target.x, from.z - target.z) > TRADE_DISTANCE) {
        return socket.emit('trade:error', '조금 더 가까이 가서 요청해 주세요');
      }
      if (!pending.has(to)) pending.set(to, new Set());
      pending.get(to).add(socket.id);
      io.to(to).emit('trade:incoming', { from: socket.id, name: from.name });
      socket.emit('trade:sent', { name: target.name });
    });

    socket.on('trade:respond', ({ from, accept } = {}) => {
      const reqs = pending.get(socket.id);
      if (!reqs?.has(from)) return;
      reqs.delete(from);
      const requester = players.get(from);
      const self = me();
      if (!requester || !self) return;
      if (!accept) return void io.to(from).emit('trade:error', `${self.name} 님이 거래를 거절했어요`);
      if (trades.has(from) || trades.has(socket.id)) {
        return socket.emit('trade:error', '둘 중 한 명이 이미 거래 중이에요');
      }

      const trade = {
        sids: [from, socket.id],
        offers: { [from]: emptyOffer(), [socket.id]: emptyOffer() },
        ready: { [from]: false, [socket.id]: false },
      };
      trades.set(from, trade);
      trades.set(socket.id, trade);
      io.to(from).emit('trade:open', { partner: { sid: socket.id, name: self.name } });
      socket.emit('trade:open', { partner: { sid: from, name: requester.name } });
      emitState(trade);
    });

    socket.on('trade:offer', ({ items, coins } = {}) => {
      const trade = trades.get(socket.id);
      const self = me();
      if (!trade || !self) return;
      const inv = getInventory(self.userId);
      const owned = new Map(inv.items.map((it) => [it.id, it]));
      const ids = [...new Set(Array.isArray(items) ? items : [])].filter((id) => owned.has(id)).slice(0, 20);
      const amount = Math.max(0, Math.min(inv.coins, Math.floor(Number(coins) || 0)));

      trade.offers[socket.id] = { items: ids.map((id) => owned.get(id)), coins: amount };
      for (const sid of trade.sids) trade.ready[sid] = false;
      emitState(trade);
    });

    socket.on('trade:ready', () => {
      const trade = trades.get(socket.id);
      if (!trade) return;
      trade.ready[socket.id] = true;
      if (!trade.sids.every((sid) => trade.ready[sid])) return emitState(trade);

      const [a, b] = trade.sids.map((sid) => ({
        sid,
        player: players.get(sid),
        offer: trade.offers[sid],
      }));
      try {
        executeTrade(
          { userId: a.player.userId, items: a.offer.items.map((it) => it.id), coins: a.offer.coins },
          { userId: b.player.userId, items: b.offer.items.map((it) => it.id), coins: b.offer.coins },
        );
      } catch (err) {
        for (const sid of trade.sids) trade.ready[sid] = false;
        for (const sid of trade.sids) io.to(sid).emit('trade:error', `거래 실패: ${err.message}`);
        return emitState(trade);
      }

      close(trade);
      for (const side of [a, b]) {
        io.to(side.sid).emit('inventory', getInventory(side.player.userId));
        io.to(side.sid).emit('trade:done');
      }
      io.emit('chat', { system: true, text: `${a.player.name} 님과 ${b.player.name} 님이 거래했어요 🤝` });
    });

    socket.on('trade:cancel', () => {
      const trade = trades.get(socket.id);
      if (trade) close(trade, `${me()?.name ?? '상대'} 님이 거래를 취소했어요`);
    });

    socket.on('disconnect', () => {
      pending.delete(socket.id);
      const trade = trades.get(socket.id);
      if (trade) close(trade, '상대가 마을을 떠나서 거래가 취소됐어요');
    });
  };
}
