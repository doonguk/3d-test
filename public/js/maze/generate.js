// 시드 기반 입체 미로 생성기. Three.js에 의존하지 않는 순수 함수라 Node 테스트에서도 그대로 돌린다.
//
// 1) 미로 골격: 재귀 백트래킹으로 모든 칸이 길 하나로만 이어진 '완전 미로'(트리)를 만든다.
// 2) 높이: 시작점부터 트리를 따라 내려가며 이웃 칸과의 높이 차(0/±1/±2)를 정한다.
//    차이 1 = 계단 또는 점프로 오르는 턱, 차이 2 = 낮은 칸의 점프 발판으로만 오를 수 있다.
// 3) 장치: 곧은 통로 일부는 바닥 없는 구덩이 + 움직이는 발판, 정답 경로에는 색깔 문,
//    문 앞쪽 막다른 길에는 그 문의 열쇠, 나머지 막다른 길에는 별, 곳곳에 가시 함정과 체크포인트.
// 트리 구조라 '열쇠가 항상 문보다 먼저 닿는 곳에 있다'를 계산으로 보장할 수 있다.

export const CELL = 4; // 칸 한 변 길이
export const LEVEL_H = 1.2; // 높이 한 단계
export const MAX_LEVEL = 4;
export const WALL_H = 2.4; // 이웃 중 높은 바닥 기준 벽 높이
export const PAD_WALL_H = 4.4; // 발판이 있는 칸은 높이 뛰어 벽을 넘지 못하게 더 높인다
export const SPIKE_PERIOD = 2.6; // 가시 한 주기(초)
export const SPIKE_UP = 1.0; // 그중 올라와 있는 시간
export const spikeUp = (phase, t) => (t + phase) % SPIKE_PERIOD < SPIKE_UP;
export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function generateMaze(seed, size = 13) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const N = size;
  const idx = (x, z) => z * N + x;
  const inside = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
  const cells = Array.from({ length: N * N }, (_, i) => ({ i, x: i % N, z: Math.floor(i / N), h: 0, links: [], pit: false }));
  const dirTo = (a, b) => [cells[b].x - cells[a].x, cells[b].z - cells[a].z];

  // ---------- 1. 완전 미로 (반복형 재귀 백트래킹) ----------
  const seen = new Uint8Array(N * N);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const c = stack.at(-1);
    const next = DIRS.map(([dx, dz]) => [cells[c].x + dx, cells[c].z + dz])
      .filter(([x, z]) => inside(x, z) && !seen[idx(x, z)])
      .map(([x, z]) => idx(x, z));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const n = pick(next);
    seen[n] = 1;
    cells[c].links.push(n);
    cells[n].links.push(c);
    stack.push(n);
  }

  // 시작점 기준 BFS: 부모, 깊이, 방문 순서
  const parent = new Int32Array(N * N).fill(-1);
  const depth = new Int32Array(N * N).fill(-1);
  const order = [0];
  depth[0] = 0;
  for (let k = 0; k < order.length; k++) {
    for (const n of cells[order[k]].links) {
      if (depth[n] !== -1) continue;
      depth[n] = depth[order[k]] + 1;
      parent[n] = order[k];
      order.push(n);
    }
  }
  const start = 0;
  const goal = order.reduce((best, c) => (depth[c] > depth[best] ? c : best), 0);
  const path = [];
  for (let c = goal; c !== -1; c = parent[c]) path.push(c);
  path.reverse();
  const onPath = new Set(path);

  // ---------- 2. 구덩이 (곧은 통로 칸) ----------
  const isStraight = (c) => {
    const l = cells[c].links;
    if (l.length !== 2) return false;
    const [a, b] = l.map((n) => dirTo(c, n));
    return a[0] === -b[0] && a[1] === -b[1];
  };
  for (const c of order) {
    if (c === start || c === goal || !isStraight(c)) continue;
    if (cells[c].links.some((n) => cells[n].pit || n === start || n === goal)) continue;
    if (rand() < 0.14) cells[c].pit = true;
  }

  // ---------- 3. 높이 ----------
  const edges = new Map(); // edgeKey -> { a, b, type: 'flat' | 'stairs' | 'ledge' | 'pad' | 'platform' }
  const stairs = [];
  const pads = [];
  for (const c of order) {
    if (c === start) continue;
    const p = parent[c];
    let delta = 0;
    if (!cells[c].pit && !cells[p].pit) {
      const options = [
        [0, 4],
        [1, 3],
        [-1, 2],
        [2, 1.2],
        [-2, 1],
      ].filter(([d]) => cells[p].h + d >= 0 && cells[p].h + d <= MAX_LEVEL);
      let r = rand() * options.reduce((s, [, w]) => s + w, 0);
      for (const [d, w] of options) if ((r -= w) <= 0) {
        delta = d;
        break;
      }
    }
    cells[c].h = cells[p].h + delta;

    let type = 'flat';
    if (cells[c].pit || cells[p].pit) type = 'platform';
    else if (Math.abs(delta) === 1) type = rand() < 0.5 ? 'stairs' : 'ledge';
    else if (Math.abs(delta) === 2) type = 'pad';
    edges.set(edgeKey(p, c), { a: p, b: c, type });

    const [low, high] = delta < 0 ? [c, p] : [p, c];
    if (type === 'stairs') stairs.push({ cell: low, dir: dirTo(low, high) });
    if (type === 'pad') pads.push({ cell: low, dir: dirTo(low, high) });
  }

  // ---------- 4. 문과 열쇠 ----------
  // 금지된 간선을 빼고 시작점에서 닿는 칸들
  const reach = (blocked) => {
    const out = new Set([start]);
    const q = [start];
    while (q.length) {
      const c = q.pop();
      for (const n of cells[c].links) {
        if (out.has(n) || blocked.has(edgeKey(c, n))) continue;
        out.add(n);
        q.push(n);
      }
    }
    return out;
  };
  // 경로에서 얼마나 떨어진 막다른 길인지 (멀수록 열쇠·별 자리로 좋다)
  const pathDist = new Map(path.map((c) => [c, 0]));
  {
    const q = [...path];
    while (q.length) {
      const c = q.shift();
      for (const n of cells[c].links) if (!pathDist.has(n)) pathDist.set(n, pathDist.get(c) + 1), q.push(n);
    }
  }
  const isLeaf = (c) => cells[c].links.length === 1 && c !== start && c !== goal;

  const doorAt = (fraction) => {
    for (let off = 0; off < path.length; off++) {
      for (const k of [Math.floor(path.length * fraction) + off, Math.floor(path.length * fraction) - off]) {
        const a = path[k];
        const b = path[k + 1];
        if (b === undefined || a === undefined) continue;
        if (edges.get(edgeKey(a, b)).type === 'flat') return { a, b, index: k };
      }
    }
    return null;
  };
  const doors = [];
  const keys = [];
  const used = new Set([start, goal]);
  const COLORS = ['red', 'blue'];
  const doorSpecs = [doorAt(0.35), doorAt(0.72)].filter(Boolean);
  if (doorSpecs.length === 2 && doorSpecs[0].index === doorSpecs[1].index) doorSpecs.pop();
  doorSpecs.forEach((d, i) => {
    const blocked = new Set(doorSpecs.slice(i).map((s) => edgeKey(s.a, s.b)));
    const before = i === 0 ? new Set() : reach(new Set(doorSpecs.slice(i - 1).map((s) => edgeKey(s.a, s.b))));
    const region = [...reach(blocked)].filter((c) => !used.has(c));
    // 두 번째 열쇠는 첫 번째 문 너머에 두어 순서대로 풀게 한다
    const preferred = region.filter((c) => !before.has(c));
    const pool = (preferred.length ? preferred : region).filter((c) => !cells[c].pit);
    const leaves = pool.filter(isLeaf);
    const candidates = leaves.length ? leaves : pool.filter((c) => !onPath.has(c));
    const cell = (candidates.length ? candidates : pool).reduce((best, c) => (pathDist.get(c) > pathDist.get(best) ? c : best));
    used.add(cell);
    doors.push({ a: d.a, b: d.b, color: COLORS[i], pathIndex: d.index });
    keys.push({ cell, color: COLORS[i] });
  });

  // ---------- 5. 별, 체크포인트, 가시 ----------
  const stars = order
    .filter((c) => isLeaf(c) && !used.has(c) && !cells[c].pit)
    .sort((a, b) => pathDist.get(b) - pathDist.get(a))
    .slice(0, 3);
  stars.forEach((c) => used.add(c));

  const doorCells = new Set(doors.flatMap((d) => [d.a, d.b]));
  const checkpoints = [0.22, 0.5, 0.8]
    .map((f) => path.slice(Math.floor(path.length * f)).find((c) => !cells[c].pit && !used.has(c) && !doorCells.has(c)))
    .filter((c) => c !== undefined);
  checkpoints.forEach((c) => used.add(c));

  // 가시는 멈추지 않고 걸어서 지나갈 수 있는 칸에만 둔다:
  // 드나드는 길이 모두 평지(점프·발판·구덩이 없음)이고, 가시 칸끼리는 붙지 않는다
  const busy = new Set([...stairs, ...pads].map((s) => s.cell));
  const allFlat = (c) => cells[c].links.every((n) => edges.get(edgeKey(c, n)).type === 'flat');
  const spiked = new Set();
  for (const c of order) {
    if (used.has(c) || cells[c].pit || busy.has(c) || doorCells.has(c) || depth[c] <= 3) continue;
    if (!allFlat(c) || cells[c].links.some((n) => spiked.has(n))) continue;
    if (rand() < 0.22) spiked.add(c);
  }
  const spikes = [...spiked].map((cell) => ({ cell, phase: rand() * SPIKE_PERIOD }));

  const platforms = order
    .filter((c) => cells[c].pit)
    .map((cell) => {
      const [dx] = dirTo(cell, cells[cell].links[0]);
      return { cell, axis: dx !== 0 ? 'x' : 'z', phase: rand() * Math.PI * 2 };
    });

  return {
    seed,
    size: N,
    cells: cells.map(({ i, x, z, h, links, pit }) => ({ i, x, z, h, links, pit })),
    edges: [...edges.values()],
    start,
    goal,
    path,
    doors,
    keys,
    stars,
    checkpoints,
    spikes,
    stairs,
    pads,
    platforms,
  };
}

/** 칸 중심의 월드 좌표 (미로 전체가 원점 중심에 오도록) */
export function cellCenter(maze, c) {
  const off = ((maze.size - 1) * CELL) / 2;
  return { x: maze.cells[c].x * CELL - off, z: maze.cells[c].z * CELL - off };
}

export function cellAt(maze, x, z) {
  const off = ((maze.size - 1) * CELL) / 2;
  const cx = Math.round((x + off) / CELL);
  const cz = Math.round((z + off) / CELL);
  if (cx < 0 || cz < 0 || cx >= maze.size || cz >= maze.size) return -1;
  return cz * maze.size + cx;
}
