// 임시 DB로 서버를 띄우고 두 명이 접속 → 채팅 → 거래까지 끝까지 돌려본다.
// 사용법: npm test
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';

const PORT = 3999;
const dir = mkdtempSync(join(tmpdir(), 'mongle-'));
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, 'test.db') },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve) => server.stdout.once('data', resolve));

const url = `http://localhost:${PORT}`;
const wait = (s, ev, match = () => true) =>
  new Promise((resolve) => {
    const on = (data) => match(data) && (s.off(ev, on), resolve(data));
    s.on(ev, on);
  });
const join_ = (s, name) => new Promise((resolve) => s.emit('join', { name, animal: 'cat', color: '#ffb3c7' }, resolve));
const check = (cond, msg) => {
  if (!cond) throw new Error(`실패: ${msg}`);
  console.log(`✔ ${msg}`);
};

const a = io(url);
const b = io(url);
try {
  const ra = await join_(a, '앨리스');
  const rb = await join_(b, '보리');
  check(ra.ok && rb.ok, '두 명 입장');
  check(ra.inventory.coins === 100 && ra.inventory.items.length === 3, '시작 코인/아이템 지급');
  check((await join_(io(url), '앨리스')).ok === false, '중복 닉네임 거부');

  // 가까이 붙이기
  a.emit('move', { x: 0, z: 3, ry: 0 });
  b.emit('move', { x: 1, z: 3, ry: 0 });

  const chat = wait(b, 'chat');
  a.emit('chat', '안녕!');
  check((await chat).text === '안녕!', '채팅 전달');

  const incoming = wait(b, 'trade:incoming');
  a.emit('trade:request', { to: b.id });
  const req = await incoming;
  check(req.name === '앨리스', '거래 요청 수신');

  const opened = wait(a, 'trade:open');
  b.emit('trade:respond', { from: req.from, accept: true });
  await opened;
  check(true, '거래 창 열림');

  const giveItem = ra.inventory.items[0].id;
  const offered = wait(b, 'trade:update', (u) => u.offers[a.id].coins === 30);
  a.emit('trade:offer', { items: [giveItem, 99999], coins: 30 });
  const st = await offered;
  check(st.offers[a.id].items.length === 1 && st.offers[a.id].coins === 30, '남의 아이템은 제안에서 걸러짐');

  const bOffered = wait(a, 'trade:update', (u) => u.offers[b.id].coins === 5);
  b.emit('trade:offer', { items: [], coins: 5 });
  await bOffered;
  const aReady = wait(b, 'trade:update', (u) => u.ready[a.id]);
  a.emit('trade:ready');
  await aReady;
  const invA = wait(a, 'inventory');
  const invB = wait(b, 'inventory');
  b.emit('trade:ready');
  const [ia, ib] = await Promise.all([invA, invB]);
  check(ia.coins === 75 && ib.coins === 125, `코인 이동 (앨리스 ${ia.coins}, 보리 ${ib.coins})`);
  check(ia.items.length === 2 && ib.items.some((it) => it.id === giveItem), '아이템 소유권 이동');

  console.log('\n모든 스모크 테스트 통과 🎉');
} finally {
  a.close();
  b.close();
  server.kill();
  rmSync(dir, { recursive: true, force: true });
  setTimeout(() => process.exit(process.exitCode ?? 0), 100);
}
