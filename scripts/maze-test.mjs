// 미로 생성기 검증 + '자동 플레이 봇'으로 실제 물리 엔진에서 출구까지 갈 수 있는지 확인한다.
// 사용법: npm run test:maze  (브라우저·서버 없이 Node만으로 돈다)
import { generateMaze, cellCenter, cellAt, edgeKey, spikeUp, LEVEL_H, MAX_LEVEL } from '../public/js/maze/generate.js';
import { buildBoxes, movePlatforms, createPlayer, stepPlayer, launch, padPositions, onPad, PAD_V, JUMP_V, GRAVITY, STEP } from '../public/js/maze/physics.js';
import { CELL } from '../public/js/maze/generate.js';

const SEEDS = [20261030, 20261031, 20261101, 1, 2, 3, 7, 42, 99, 1234, 31337, 777777, 4242, 9001, 123456, 654321, 2024, 8, 16, 32];
let failures = 0;
const fail = (seed, msg) => {
  failures++;
  console.log(`  ✘ [${seed}] ${msg}`);
};

// ---------- 1. 구조 검사 ----------
function checkStructure(m) {
  const N = m.size;
  if (m.edges.length !== N * N - 1) fail(m.seed, `간선 수 ${m.edges.length} (트리면 ${N * N - 1})`);
  const byKey = new Map(m.edges.map((e) => [edgeKey(e.a, e.b), e]));
  for (const c of m.cells) if (c.h < 0 || c.h > MAX_LEVEL) fail(m.seed, `높이 범위 밖 #${c.i}`);
  for (const e of m.edges) {
    const diff = Math.abs(m.cells[e.a].h - m.cells[e.b].h);
    const expect = diff === 0 ? ['flat', 'platform'] : diff === 1 ? ['stairs', 'ledge'] : diff === 2 ? ['pad'] : [];
    if (!expect.includes(e.type)) fail(m.seed, `높이차 ${diff}인데 ${e.type}`);
    if (e.type === 'pad') {
      const low = m.cells[e.a].h < m.cells[e.b].h ? e.a : e.b;
      if (!m.pads.some((p) => p.cell === low)) fail(m.seed, `발판 없는 2단 간선 ${e.a}-${e.b}`);
    }
  }
  // 열쇠는 자기 문을 지나지 않고 (앞선 문은 열린 상태로) 닿아야 한다
  m.doors.forEach((d, i) => {
    const blocked = new Set(m.doors.slice(i).map((x) => edgeKey(x.a, x.b)));
    const seen = new Set([m.start]);
    const q = [m.start];
    while (q.length) {
      const c = q.pop();
      for (const n of m.cells[c].links) if (!seen.has(n) && !blocked.has(edgeKey(c, n))) seen.add(n), q.push(n);
    }
    if (!seen.has(m.keys[i].cell)) fail(m.seed, `${d.color} 열쇠가 문 너머에 있음`);
    if (byKey.get(edgeKey(d.a, d.b))?.type !== 'flat') fail(m.seed, '문이 평지가 아님');
  });
  if (m.stars.length !== 3) fail(m.seed, `별 ${m.stars.length}개`);

  // 가시 칸은 멈추지 않고 걸어서 지나갈 수 있어야 한다 (점프·발판·구덩이와 겹치면 사실상 통과 불가)
  const spiked = new Set(m.spikes.map((s) => s.cell));
  for (const c of spiked) {
    const bad = m.cells[c].links.find((n) => byKey.get(edgeKey(c, n)).type !== 'flat' || spiked.has(n));
    if (bad !== undefined) fail(m.seed, `가시 칸 #${c}의 이웃 #${bad}: 평지가 아니거나 가시가 연속됨`);
  }

  // 어떤 칸에서도 벽·기둥·문 위로 뛰어오를 수 없어야 한다 (벽 위를 걸어 지름길로 가는 것 방지)
  const apex = (v) => (v * v) / (2 * GRAVITY);
  const padCells = new Set(m.pads.map((p) => p.cell));
  const stairCells = new Set(m.stairs.map((s) => s.cell));
  const reach = (c) => m.cells[c].h * LEVEL_H + (padCells.has(c) ? apex(PAD_V) : apex(JUMP_V) + (stairCells.has(c) ? 0.8 : 0));
  const off = ((m.size - 1) * CELL) / 2;
  const R = 0.42;
  for (const b of buildBoxes(m)) {
    if (b.kind !== 'wall' && b.kind !== 'door') continue;
    for (const c of m.cells) {
      const x = c.x * CELL - off;
      const z = c.z * CELL - off;
      const touches = b.maxX > x - 2 - R && b.minX < x + 2 + R && b.maxZ > z - 2 - R && b.minZ < z + 2 + R;
      if (touches && b.maxY - reach(c.i) <= STEP) {
        fail(m.seed, `칸 #${c.i}에서 ${b.pillar ? '기둥' : b.kind} 위로 올라갈 수 있음`);
        return;
      }
    }
  }
}

// ---------- 2. 자동 플레이 봇 ----------
// 사람처럼 플레이한다: 열쇠를 주워 같은 색 문을 열고 출구까지 간다 (실제 물리 + 같은 함정 규칙).
// 턱은 점프, 2단은 발판, 구덩이는 발판 타이밍, 가시는 내려간 박자에 맞춰 지나간다.
function treePath(m, from, to) {
  const parent = new Map([[from, -1]]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const n of m.cells[c].links) if (!parent.has(n)) parent.set(n, c), q.push(n);
  }
  const out = [];
  for (let c = to; c !== -1; c = parent.get(c)) out.push(c);
  return out.reverse();
}

function autopilot(m) {
  const boxes = buildBoxes(m);
  const pads = padPositions(m);
  const spikes = new Map(m.spikes.map((s) => [s.cell, s]));
  const keyAt = new Map(m.keys.map((k) => [k.cell, k.color]));
  const have = new Set();
  const s = cellCenter(m, m.start);
  const p = createPlayer(s.x, m.cells[m.start].h * LEVEL_H, s.z);
  const dt = 1 / 60;
  let t = 0;
  let dead = null;

  // 열쇠 → 문 순서대로 들르는 전체 경로
  const stops = [m.start, ...m.keys.map((k) => k.cell), m.goal];
  const route = [m.start];
  for (let i = 0; i + 1 < stops.length; i++) route.push(...treePath(m, stops[i], stops[i + 1]).slice(1));

  const step = (tx, tz, jump = false) => {
    movePlatforms(boxes, t);
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    stepPlayer(p, boxes, d > 0.08 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 }, jump, dt);
    for (const pad of pads) if (onPad(p, pad)) launch(p, PAD_V);
    const cell = cellAt(m, p.x, p.z);
    if (keyAt.has(cell)) have.add(keyAt.get(cell));
    for (const b of boxes) {
      if (b.kind !== 'door' || !have.has(b.color)) continue;
      const qx = Math.min(Math.max(p.x, b.minX), b.maxX);
      const qz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
      if (Math.hypot(p.x - qx, p.z - qz) < p.r + 0.25) boxes.splice(boxes.indexOf(b), 1);
    }
    const sp = spikes.get(cell);
    if (sp && spikeUp(sp.phase, t) && p.grounded && Math.abs(p.y - m.cells[cell].h * LEVEL_H) < 0.05) dead ??= `가시 #${cell}`;
    t += dt;
  };
  const platformOf = (cell) => boxes.find((b) => b.kind === 'platform' && b.cell === cell);
  const platOffset = (b) => (b.axis === 'x' ? (b.minX + b.maxX) / 2 - b.home.x : (b.minZ + b.maxZ) / 2 - b.home.z);

  for (let k = 0; k + 1 < route.length; k++) {
    const a = route[k];
    const b = route[k + 1];
    const A = cellCenter(m, a);
    const B = cellCenter(m, b);
    const dir = [Math.sign(B.x - A.x), Math.sign(B.z - A.z)];
    const ha = m.cells[a].h;
    const hb = m.cells[b].h;
    const segStart = t;
    const timeout = () => t - segStart > 25;
    const arrived = (c, C) => cellAt(m, p.x, p.z) === c && p.grounded && Math.hypot(p.x - C.x, p.z - C.z) < 1.2;

    if (spikes.has(b)) {
      // 가시가 막 내려간 순간 출발해서 가시 칸을 한 번에 지나 다음 칸까지 간다
      const sp = spikes.get(b);
      while (!spikeUp(sp.phase, t) && !timeout()) step(p.x, p.z);
      while (spikeUp(sp.phase, t) && !timeout()) step(p.x, p.z);
      const c = route[k + 2];
      const C = cellCenter(m, c);
      let entered = false;
      while (!arrived(c, C) && !timeout() && !dead) {
        entered ||= cellAt(m, p.x, p.z) === b;
        entered ? step(C.x, C.z) : step(B.x, B.z);
      }
      k++;
    } else if (m.cells[b].pit) {
      // 구덩이 칸으로: 발판이 내 쪽으로 오면 올라탄다
      const plat = platformOf(b);
      const side = plat.axis === 'x' ? dir[0] : dir[1];
      const edge = { x: A.x + dir[0] * 1.4, z: A.z + dir[1] * 1.4 };
      while (Math.hypot(p.x - edge.x, p.z - edge.z) > 0.15 && !timeout()) step(edge.x, edge.z);
      while (!(platOffset(plat) * -side > 1.0) && !timeout()) step(edge.x, edge.z);
      while (!(p.grounded && p.support === plat) && !timeout()) step((plat.minX + plat.maxX) / 2, (plat.minZ + plat.maxZ) / 2);
    } else if (m.cells[a].pit) {
      // 발판 위: 건너편에 닿을 때까지 기다렸다가 내린다
      const plat = platformOf(a);
      const side = plat.axis === 'x' ? dir[0] : dir[1];
      while (!(platOffset(plat) * side > 1.0) && !timeout()) step((plat.minX + plat.maxX) / 2, (plat.minZ + plat.maxZ) / 2);
      while (cellAt(m, p.x, p.z) !== b && !timeout()) step(B.x, B.z);
    } else if (hb - ha === 2) {
      // 발판까지 걸어가서 튀어 오른 뒤 높은 칸으로 날아간다
      const pad = pads.find((q) => q.cell === a && Math.sign(q.x - A.x) === dir[0] && Math.sign(q.z - A.z) === dir[1]);
      while (p.vy <= 0 && !timeout()) step(pad.x, pad.z);
      while (!(cellAt(m, p.x, p.z) === b && p.grounded) && !timeout()) step(B.x, B.z);
    } else if (hb - ha === 1 && m.edges.find((e) => edgeKey(e.a, e.b) === edgeKey(a, b)).type === 'ledge') {
      const near = { x: A.x + dir[0] * 1.1, z: A.z + dir[1] * 1.1 };
      while (Math.hypot(p.x - near.x, p.z - near.z) > 0.15 && !timeout()) step(near.x, near.z);
      // 사람처럼 막히면 다시 점프한다
      while (!(cellAt(m, p.x, p.z) === b && p.grounded) && !timeout()) step(B.x, B.z, p.grounded);
    } else {
      while (!arrived(b, B) && !timeout()) step(B.x, B.z);
    }
    const where = `${k}/${route.length - 1}칸 #${a}→#${b} (h ${ha}→${hb})`;
    if (dead) return { ok: false, why: `${where}에서 ${dead}에 찔림` };
    if (timeout()) return { ok: false, why: `${where} 통과 못 함` };
    if (p.y < -1) return { ok: false, why: `${where}에서 추락` };
  }
  return { ok: true, t, steps: route.length, keys: have.size };
}

for (const seed of SEEDS) {
  const m = generateMaze(seed);
  const before = failures;
  checkStructure(m);
  const run = autopilot(m);
  if (!run.ok) fail(seed, `봇 실패: ${run.why}`);
  if (failures === before) {
    console.log(`✔ [${seed}] 열쇠 ${run.keys}개 들러 ${run.steps}칸 · 가시 ${m.spikes.length} · 발판 ${m.pads.length} · 구덩이 ${m.platforms.length} · 봇 클리어 ${run.t.toFixed(0)}초`);
  }
}
console.log(failures ? `\n${failures}건 실패` : '\n모든 미로 검증 통과 🎉');
process.exit(failures ? 1 : 0);
