// 미로 생성기 검증 + '자동 플레이 봇'으로 실제 물리 엔진에서 출구까지 갈 수 있는지 확인한다.
// 사용법: npm run test:maze  (브라우저·서버 없이 Node만으로 돈다)
import { generateMaze, cellCenter, cellAt, edgeKey, LEVEL_H, MAX_LEVEL } from '../public/js/maze/generate.js';
import { buildBoxes, movePlatforms, createPlayer, stepPlayer, launch, padPositions, onPad, PAD_V, JUMP_V, GRAVITY, STEP } from '../public/js/maze/physics.js';
import { CELL } from '../public/js/maze/generate.js';

const SEEDS = [20261030, 1, 2, 3, 7, 42, 99, 1234, 31337, 777777];
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
// 정답 경로를 따라 실제 물리로 걷는다. 턱은 점프, 2단은 발판, 구덩이는 발판 타이밍을 기다린다.
function autopilot(m) {
  const boxes = buildBoxes(m).filter((b) => b.kind !== 'door'); // 문은 열쇠 검사로 따로 보장
  const pads = padPositions(m);
  const s = cellCenter(m, m.start);
  const p = createPlayer(s.x, m.cells[m.start].h * LEVEL_H, s.z);
  const dt = 1 / 60;
  let t = 0;
  const step = (tx, tz, jump = false) => {
    movePlatforms(boxes, t);
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const move = d > 0.08 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 };
    stepPlayer(p, boxes, move, jump, dt);
    for (const pad of pads) if (onPad(p, pad)) launch(p, PAD_V);
    t += dt;
  };
  const platformOf = (cell) => boxes.find((b) => b.kind === 'platform' && b.cell === cell);
  const platOffset = (b) => (b.axis === 'x' ? (b.minX + b.maxX) / 2 - b.home.x : (b.minZ + b.maxZ) / 2 - b.home.z);

  for (let k = 0; k + 1 < m.path.length; k++) {
    const a = m.path[k];
    const b = m.path[k + 1];
    const A = cellCenter(m, a);
    const B = cellCenter(m, b);
    const dir = [Math.sign(B.x - A.x), Math.sign(B.z - A.z)];
    const ha = m.cells[a].h;
    const hb = m.cells[b].h;
    const segStart = t;
    const timeout = () => t - segStart > 25;

    if (m.cells[b].pit) {
      // 구덩이 칸으로: 발판이 내 쪽으로 오면 올라탄다
      const plat = platformOf(b);
      const side = plat.axis === 'x' ? dir[0] : dir[1]; // 발판이 움직이는 축 위에서 내가 있는 쪽의 반대
      const edge = { x: A.x + dir[0] * 1.4, z: A.z + dir[1] * 1.4 };
      while (Math.hypot(p.x - edge.x, p.z - edge.z) > 0.15 && !timeout()) step(edge.x, edge.z);
      while (!(platOffset(plat) * -side > 1.0) && !timeout()) step(edge.x, edge.z);
      while (!(p.grounded && p.support === plat) && !timeout()) step((plat.minX + plat.maxX) / 2, (plat.minZ + plat.maxZ) / 2);
      continue;
    }
    if (m.cells[a].pit) {
      // 발판 위: 건너편에 닿을 때까지 기다렸다가 내린다
      const plat = platformOf(a);
      const side = plat.axis === 'x' ? dir[0] : dir[1];
      while (!(platOffset(plat) * side > 1.0) && !timeout()) step((plat.minX + plat.maxX) / 2, (plat.minZ + plat.maxZ) / 2);
      while (cellAt(m, p.x, p.z) !== b && !timeout()) step(B.x, B.z);
      if (p.y < -1) return { ok: false, at: k, why: '구덩이 추락' };
      continue;
    }
    if (hb - ha === 2) {
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
      while (!(cellAt(m, p.x, p.z) === b && p.grounded && Math.hypot(p.x - B.x, p.z - B.z) < 1.2) && !timeout()) step(B.x, B.z);
    }
    if (timeout()) return { ok: false, at: k, why: `${a}→${b} (h ${ha}→${hb}) 통과 못 함`, t };
    if (p.y < -1) return { ok: false, at: k, why: '추락' };
  }
  return { ok: true, t };
}

for (const seed of SEEDS) {
  const m = generateMaze(seed);
  const before = failures;
  checkStructure(m);
  const run = autopilot(m);
  if (!run.ok) fail(seed, `봇 실패: 경로 ${run.at}/${m.path.length - 1}칸에서 ${run.why}`);
  if (failures === before) {
    console.log(`✔ [${seed}] 경로 ${m.path.length}칸 · 발판 ${m.pads.length} · 구덩이 ${m.platforms.length} · 봇 클리어 ${run.t.toFixed(0)}초`);
  }
}
console.log(failures ? `\n${failures}건 실패` : '\n모든 미로 검증 통과 🎉');
process.exit(failures ? 1 : 0);
