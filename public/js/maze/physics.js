// 상자(AABB)들로 이뤄진 세계에서 원기둥 캐릭터를 움직이는 작은 물리 엔진. Three.js 없이 숫자만 다룬다.
// - 발밑보다 STEP 이상 높은 상자 = 벽 (옆으로 밀어냄)
// - STEP 이하로 높은 상자 = 걸어서 올라섬 (계단)
// - 그 외에는 중력으로 떨어지고, 바닥을 뚫고 지나가지 않도록 착지 높이를 맞춘다

import { CELL, LEVEL_H, WALL_H, PAD_WALL_H, DIRS, edgeKey, cellCenter } from './generate.js';

export const GRAVITY = 24;
export const SPEED = 5.2;
export const STEP = 0.45;
export const JUMP_V = Math.sqrt(2 * GRAVITY * 1.75); // 1.75 높이까지: 한 단(1.2) 턱은 넘고 벽(2.4)은 못 넘는다
export const PAD_V = Math.sqrt(2 * GRAVITY * 3.6); // 발판: 두 단(2.4) 위까지
const RADIUS = 0.42;
const HEIGHT = 1.5;
const BOTTOM = -6;
const T = 0.4; // 벽 두께

const box = (minX, maxX, minZ, maxZ, minY, maxY, extra = {}) => ({ minX, maxX, minZ, maxZ, minY, maxY, ...extra });

/** 미로 레이아웃 → 충돌 상자 목록 */
export function buildBoxes(maze) {
  const boxes = [];
  const half = CELL / 2;
  const floorY = (c) => maze.cells[c].h * LEVEL_H;
  const padCells = new Set(maze.pads.map((p) => p.cell));
  const stairCells = new Set(maze.stairs.map((s) => s.cell));
  const linked = new Set(maze.cells.flatMap((c) => c.links.map((n) => edgeKey(c.i, n))));
  const doorEdges = new Map(maze.doors.map((d) => [edgeKey(d.a, d.b), d]));

  // 그 칸에서 뛰어서 닿을 수 있는 최고 높이 + 여유. 벽·기둥은 맞닿은 모든 칸에 대해 이보다 높아야 한다
  const wallTopFor = (c) =>
    c < 0 ? 0 : padCells.has(c) ? floorY(c) + PAD_WALL_H : stairCells.has(c) ? floorY(c) + 0.8 + WALL_H : floorY(c) + WALL_H;
  const cellIndex = (x, z) => (x < 0 || z < 0 || x >= maze.size || z >= maze.size ? -1 : z * maze.size + x);

  for (const cell of maze.cells) {
    const { x: cx, z: cz } = cellCenter(maze, cell.i);
    if (!cell.pit) boxes.push(box(cx - half, cx + half, cz - half, cz + half, BOTTOM, floorY(cell.i), { kind: 'floor', cell: cell.i }));

    // 각 칸은 +x, +z 쪽 벽만 맡고, 맨 왼쪽·위쪽 테두리는 따로 세운다.
    // 벽은 모서리 기둥 사이 길이만큼만 세워 대각선 칸으로 끝이 삐져나가지 않게 한다 (벽 위로 올라타는 지름길 방지)
    for (const [dx, dz] of DIRS) {
      const n = cellIndex(cell.x + dx, cell.z + dz);
      if (n >= 0 && (dx < 0 || dz < 0)) continue;
      const key = n >= 0 ? edgeKey(cell.i, n) : null;
      const door = key && doorEdges.get(key);
      if (key && linked.has(key) && !door) continue;

      // 벽 양 끝에 맞닿은 칸(대각선 이웃)도 캐릭터 반경만큼은 벽에 닿으니 함께 따진다
      const ends = dx !== 0 ? [[0, -1], [0, 1], [dx, -1], [dx, 1]] : [[-1, 0], [1, 0], [-1, dz], [1, dz]];
      const top = Math.max(wallTopFor(cell.i), wallTopFor(n), ...ends.map(([ox, oz]) => wallTopFor(cellIndex(cell.x + ox, cell.z + oz))));
      const ex = cx + dx * half;
      const ez = cz + dz * half;
      const span = half - T / 2;
      const b =
        dx !== 0
          ? box(ex - T / 2, ex + T / 2, cz - span, cz + span, BOTTOM, top)
          : box(cx - span, cx + span, ez - T / 2, ez + T / 2, BOTTOM, top);
      Object.assign(b, door ? { kind: 'door', color: door.color, edge: key } : { kind: 'wall' });
      boxes.push(b);
    }
  }

  // 모서리 기둥: 꼭짓점을 둘러싼 네 칸 모두에서 못 넘을 높이
  const off = ((maze.size - 1) * CELL) / 2;
  for (let vz = 0; vz <= maze.size; vz++) {
    for (let vx = 0; vx <= maze.size; vx++) {
      const around = [cellIndex(vx - 1, vz - 1), cellIndex(vx, vz - 1), cellIndex(vx - 1, vz), cellIndex(vx, vz)];
      const top = Math.max(...around.map(wallTopFor));
      const x = vx * CELL - off - half;
      const z = vz * CELL - off - half;
      boxes.push(box(x - T / 2, x + T / 2, z - T / 2, z + T / 2, BOTTOM, top, { kind: 'wall', pillar: true }));
    }
  }

  // 계단: 낮은 칸에서 높은 칸 쪽 벽에 붙여 두 단
  for (const { cell, dir } of maze.stairs) {
    const { x: cx, z: cz } = cellCenter(maze, cell);
    const y = floorY(cell);
    for (const [from, to, rise] of [
      [half - 0.7, half, 0.8],
      [half - 1.4, half - 0.7, 0.4],
    ]) {
      const [a, b] = [from, to];
      const across = [-half + T / 2, half - T / 2];
      const b2 =
        dir[0] !== 0
          ? box(cx + dir[0] * (dir[0] > 0 ? a : b), cx + dir[0] * (dir[0] > 0 ? b : a), cz + across[0], cz + across[1], BOTTOM, y + rise)
          : box(cx + across[0], cx + across[1], cz + dir[1] * (dir[1] > 0 ? a : b), cz + dir[1] * (dir[1] > 0 ? b : a), BOTTOM, y + rise);
      boxes.push({ ...b2, kind: 'step', cell, dir });
    }
  }

  // 움직이는 발판 (위치는 매 프레임 movePlatforms에서 갱신)
  for (const p of maze.platforms) {
    const { x, z } = cellCenter(maze, p.cell);
    const y = floorY(p.cell);
    boxes.push({ ...box(x - 0.8, x + 0.8, z - 0.8, z + 0.8, y - 0.4, y), kind: 'platform', ...p, home: { x, z }, dx: 0, dz: 0 });
  }
  return boxes;
}

/** 발판 위치 갱신. 이번 프레임 이동량(dx, dz)을 남겨 위에 선 캐릭터를 함께 옮긴다. */
export function movePlatforms(boxes, t) {
  for (const b of boxes) {
    if (b.kind !== 'platform') continue;
    const off = Math.sin(t * 1.6 + b.phase) * 1.25;
    const x = b.home.x + (b.axis === 'x' ? off : 0);
    const z = b.home.z + (b.axis === 'z' ? off : 0);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    b.dx = x - cx;
    b.dz = z - cz;
    b.minX += b.dx;
    b.maxX += b.dx;
    b.minZ += b.dz;
    b.maxZ += b.dz;
  }
}

export function createPlayer(x, y, z) {
  return { x, y, z, vy: 0, grounded: true, support: null, r: RADIUS };
}

/** 원(캐릭터)과 상자의 수평 겹침을 풀어 준다 */
function pushOut(p, b) {
  const qx = Math.min(Math.max(p.x, b.minX), b.maxX);
  const qz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
  const dx = p.x - qx;
  const dz = p.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= p.r * p.r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    p.x = qx + (dx / d) * p.r;
    p.z = qz + (dz / d) * p.r;
    return;
  }
  // 중심이 상자 안: 가장 가까운 면으로 내보낸다
  const moves = [
    [b.minX - p.r - p.x, 0],
    [b.maxX + p.r - p.x, 0],
    [0, b.minZ - p.r - p.z],
    [0, b.maxZ + p.r - p.z],
  ].sort((m1, m2) => Math.abs(m1[0] + m1[1]) - Math.abs(m2[0] + m2[1]));
  p.x += moves[0][0];
  p.z += moves[0][1];
}

const overlaps = (p, b, r) => {
  const qx = Math.min(Math.max(p.x, b.minX), b.maxX);
  const qz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
  return (p.x - qx) ** 2 + (p.z - qz) ** 2 < r * r;
};

/**
 * 한 프레임 이동. move = 이번 프레임에 가고 싶은 수평 방향(길이 0~1), jump = 점프 키를 막 눌렀는지.
 * 반환값의 landed는 착지 순간 연출용.
 */
export function stepPlayer(p, boxes, move, jump, dt) {
  // 발판 위에 서 있었다면 같이 이동
  if (p.grounded && p.support?.kind === 'platform') {
    p.x += p.support.dx;
    p.z += p.support.dz;
  }

  p.x += move.x * SPEED * dt;
  p.z += move.z * SPEED * dt;
  for (let iter = 0; iter < 2; iter++) {
    for (const b of boxes) {
      if (b.maxY > p.y + STEP && b.minY < p.y + HEIGHT) pushOut(p, b);
    }
  }

  if (jump && p.grounded) {
    p.vy = JUMP_V;
    p.grounded = false;
  }

  const wasGrounded = p.grounded;
  p.vy -= GRAVITY * dt;
  const nextY = p.y + p.vy * dt;

  let ground = -Infinity;
  let support = null;
  if (p.vy <= 0) {
    for (const b of boxes) {
      if (b.maxY > p.y + STEP + 1e-3 || !overlaps(p, b, p.r * 0.75)) continue;
      if (b.maxY > ground) {
        ground = b.maxY;
        support = b;
      }
    }
  }
  if (nextY <= ground) {
    p.y = ground;
    p.vy = 0;
    p.grounded = true;
    p.support = support;
  } else {
    p.y = nextY;
    p.grounded = false;
    p.support = null;
  }
  return { landed: !wasGrounded && p.grounded };
}

export function launch(p, v) {
  p.vy = v;
  p.grounded = false;
  p.support = null;
}

// 점프 발판: 게임과 테스트 봇이 같은 규칙을 쓰도록 여기 둔다
export const PAD_OFFSET = 0.9; // 칸 중심에서 높은 칸 쪽으로 치우친 거리
export function padPositions(maze) {
  return maze.pads.map(({ cell, dir }) => {
    const c = cellCenter(maze, cell);
    return { cell, x: c.x + dir[0] * PAD_OFFSET, z: c.z + dir[1] * PAD_OFFSET, y: maze.cells[cell].h * LEVEL_H };
  });
}
export const onPad = (p, pad) => p.grounded && Math.abs(p.y - pad.y) < 0.05 && Math.hypot(p.x - pad.x, p.z - pad.z) < 0.65;
