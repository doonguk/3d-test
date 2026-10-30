import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { loginUser, getInventory, claimPlot } from './db.js';
import { setupTrade } from './trade.js';
import { setupGifts } from './gifts.js';
import { setupYards, PLOT_COUNT } from './yards.js';

const PORT = Number(process.env.PORT ?? 3000);
const WORLD_RADIUS = 37;
const ANIMALS = ['cat', 'bear', 'bunny'];

const app = express();
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
const http = createServer(app);
const io = new Server(http);

/** socket.id -> 접속 중인 플레이어 */
const players = new Map();

const bindTrade = setupTrade(io, players);
const gifts = setupGifts(io, players);
const yards = setupYards(io, players);

const publicPlayer = (p) => ({
  sid: p.sid,
  name: p.name,
  animal: p.animal,
  color: p.color,
  x: p.x,
  z: p.z,
  ry: p.ry,
  plot: p.plot,
});
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

io.on('connection', (socket) => {
  bindTrade(socket);
  gifts.bind(socket);
  yards.bind(socket);

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function' || players.has(socket.id)) return;
    const name = String(data?.name ?? '').trim().slice(0, 12);
    const animal = ANIMALS.includes(data?.animal) ? data.animal : 'cat';
    const color = /^#[0-9a-f]{6}$/i.test(data?.color) ? data.color : '#ffb3c7';
    if (!name) return ack({ ok: false, error: '닉네임을 입력해 주세요' });
    if ([...players.values()].some((p) => p.name === name)) {
      return ack({ ok: false, error: '이미 접속 중인 닉네임이에요' });
    }

    const user = loginUser(name, animal, color);
    const plot = claimPlot(user, PLOT_COUNT);
    const angle = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 4;
    const p = { sid: socket.id, userId: user.id, name, animal, color, x: Math.cos(angle) * r, z: Math.sin(angle) * r, ry: 0, plot };
    players.set(socket.id, p);

    ack({
      ok: true,
      isNew: user.isNew,
      me: publicPlayer(p),
      players: [...players.values()].filter((o) => o !== p).map(publicPlayer),
      inventory: getInventory(user.id),
      gifts: gifts.list(),
      ...yards.snapshot(user.id),
    });
    if (plot != null) io.emit('yard:update', { plot, name, color });
    socket.broadcast.emit('player:join', publicPlayer(p));
    io.emit('chat', { system: true, text: `${name} 님이 마을에 놀러 왔어요!` });
  });

  socket.on('move', (d) => {
    const p = players.get(socket.id);
    if (!p || !d) return;
    let x = num(d.x, p.x);
    let z = num(d.z, p.z);
    const dist = Math.hypot(x, z);
    if (dist > WORLD_RADIUS) {
      x *= WORLD_RADIUS / dist;
      z *= WORLD_RADIUS / dist;
    }
    p.x = x;
    p.z = z;
    p.ry = num(d.ry, p.ry);
    socket.broadcast.volatile.emit('player:move', { sid: p.sid, x, z, ry: p.ry, moving: !!d.moving });
  });

  socket.on('jump', () => {
    if (players.has(socket.id)) socket.broadcast.emit('player:jump', { sid: socket.id });
  });

  socket.on('chat', (raw) => {
    const p = players.get(socket.id);
    const text = String(raw ?? '').trim().slice(0, 200);
    if (!p || !text) return;
    io.emit('chat', { sid: p.sid, name: p.name, text });
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (!p) return;
    players.delete(socket.id);
    io.emit('player:leave', { sid: p.sid });
    io.emit('chat', { system: true, text: `${p.name} 님이 집에 갔어요.` });
  });
});

http.listen(PORT, () => console.log(`🌸 몽글몽글 마을: http://localhost:${PORT}`));
