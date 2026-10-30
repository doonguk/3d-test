import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createCharacter } from '../character.js';
import { generateMaze, cellCenter, cellAt, edgeKey, spikeUp } from './generate.js';
import { buildBoxes, movePlatforms, createPlayer, stepPlayer, launch, onPad, PAD_V } from './physics.js';
import { buildMazeScene, KEY_COLORS } from './build.js';

// 1인 미로. 서버·소켓 없이 브라우저 안에서만 돈다 (기록과 고스트는 localStorage).

const $ = (sel) => document.querySelector(sel);

// ---------- 시드: 기본은 '오늘의 미로' (모두 같은 미로) ----------
const now = new Date();
const dailySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
const seed = Number(new URLSearchParams(location.search).get('seed')) || dailySeed;
const title = seed === dailySeed ? `오늘의 미로 (${now.getMonth() + 1}월 ${now.getDate()}일)` : `미로 #${seed}`;
$('#maze-title').textContent = title;
$('#intro-title').textContent = title;

const maze = generateMaze(seed);
const boxes = buildBoxes(maze);

// ---------- 렌더러 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#app').appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
$('#app').appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2d2a55');
scene.fog = new THREE.Fog('#2d2a55', 14, 36); // 시야를 좁혀 난이도를 올린다
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight('#d6d0ff', '#3b3566', 1.3));
const moon = new THREE.DirectionalLight('#e8e4ff', 1.2);
moon.position.set(-20, 40, 15);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 100 });
scene.add(moon);
const lantern = new THREE.PointLight('#ffe2b0', 3, 9);
scene.add(lantern);

const world = buildMazeScene(scene, maze, boxes);

// ---------- 캐릭터 ----------
const profile = JSON.parse(localStorage.getItem('mongle:profile') ?? '{}');
const me = createCharacter({ name: profile.name || '나', animal: profile.animal || 'cat', color: profile.color || '#ffb3c7', isMe: true });
scene.add(me.root);

const spawnAt = (cell) => ({ x: cellCenter(maze, cell).x, y: world.floorTop(cell), z: cellCenter(maze, cell).z });
let checkpoint = spawnAt(maze.start);
const player = createPlayer(checkpoint.x, checkpoint.y, checkpoint.z);
let facing = 0;

// ---------- 기록 & 고스트 ----------
const BEST_KEY = `mongle:maze:${seed}`;
const loadBest = () => {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY));
  } catch {
    return null;
  }
};
let best = loadBest();
let ghost = null;
if (best?.frames?.length) {
  ghost = createCharacter({ name: '👻 내 최고기록', animal: profile.animal || 'cat', color: '#ffffff' });
  ghost.root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.35;
    o.castShadow = false;
  });
  scene.add(ghost.root);
}
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
$('#intro-best').textContent = best ? `내 최고기록 ${fmt(best.time)} · 별 ${best.stars}/3 — 반투명 고스트가 같이 달려요` : '';

// ---------- 게임 상태 ----------
const S = {
  started: false,
  finished: false,
  time: 0,
  deaths: 0,
  keys: new Set(),
  stars: new Set(),
  visited: new Set([maze.start]),
  frames: [],
  recordTimer: 0,
  safeUntil: 0,
};

$('#key-slots').innerHTML = maze.keys.map((k) => `<span class="key-slot" data-color="${k.color}" style="color:${KEY_COLORS[k.color]}"></span>`).join('');

function toast(text, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function die(reason) {
  if (performance.now() < S.safeUntil || S.finished) return;
  S.deaths++;
  Object.assign(player, { ...checkpoint, vy: 0, grounded: true, support: null });
  S.safeUntil = performance.now() + 1200;
  $('#flash').classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => $('#flash').classList.remove('on')));
  toast(`${reason} → 🚩 체크포인트로`);
}

function finish() {
  S.finished = true;
  const record = { time: S.time, stars: S.stars.size, deaths: S.deaths, frames: S.frames };
  const isBest = !best || S.time < best.time;
  if (isBest) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(record));
    } catch {
      /* 저장 공간이 없어도 결과는 보여준다 */
    }
  }
  $('#result-title').textContent = isBest ? '🏆 탈출 성공! 최고기록!' : '🏆 탈출 성공!';
  $('#result-time').textContent = fmt(S.time);
  $('#result-stars').textContent = `${S.stars.size}/3`;
  $('#result-deaths').textContent = S.deaths;
  $('#result-best').textContent = best && !isBest ? `최고기록 ${fmt(best.time)}까지 ${(S.time - best.time).toFixed(1)}초 모자라요` : '다음 도전부터 이 기록이 고스트로 같이 달려요 👻';
  $('#result').hidden = false;
}

// ---------- 입력 ----------
const keys = new Set();
let jumpQueued = false;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') {
    if (!e.repeat) jumpQueued = true;
    e.preventDefault();
  }
  if (e.code === 'KeyM') $('#minimap').classList.toggle('hidden');
  if (e.code === 'KeyR' && S.started && !S.finished) die('스스로 돌아가기');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// 벽에 가려지지 않게 높은 각도에서 내려다본다. 처음엔 시작 칸의 출구 쪽을 바라본다
const firstStep = cellCenter(maze, maze.path[1]);
const cam = { yaw: Math.atan2(-(firstStep.x - checkpoint.x), -(firstStep.z - checkpoint.z)), pitch: 1.2, dist: 13 };
let drag = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * 0.004, 0.75, 1.45);
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('wheel', (e) => (cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 7, 22)), { passive: true });

$('#btn-start').addEventListener('click', () => {
  $('#intro').hidden = true;
  S.started = true;
});
const newMaze = () => (location.search = `?seed=${Math.floor(Math.random() * 1e6) + 1}`);
$('#btn-new').addEventListener('click', newMaze);
$('#btn-new2').addEventListener('click', newMaze);
$('#btn-retry').addEventListener('click', () => location.reload());
$('#btn-map').addEventListener('click', (e) => (e.currentTarget.blur(), $('#minimap').classList.toggle('hidden')));
$('#btn-respawn').addEventListener('click', (e) => (e.currentTarget.blur(), S.started && die('스스로 돌아가기')));

// ---------- 미니맵: 지나간 칸만 보인다 ----------
const mapCtx = $('#minimap').getContext('2d');
const MAP_COLORS = ['#b8e0c0', '#9ad3b0', '#ffe39f', '#ffc3a0', '#f7a8c4'];
function drawMap() {
  const W = 220;
  const pad = 10;
  const s = (W - pad * 2) / maze.size;
  mapCtx.clearRect(0, 0, W, W);
  const pos = (c) => [pad + maze.cells[c].x * s, pad + maze.cells[c].z * s];
  for (const c of S.visited) {
    const [x, y] = pos(c);
    mapCtx.fillStyle = maze.cells[c].pit ? '#4b4580' : MAP_COLORS[maze.cells[c].h];
    mapCtx.fillRect(x, y, s, s);
  }
  mapCtx.strokeStyle = '#2b2d5e';
  mapCtx.lineWidth = 1.5;
  for (const c of S.visited) {
    const cell = maze.cells[c];
    const [x, y] = pos(c);
    for (const [dx, dz, x1, y1, x2, y2] of [
      [1, 0, x + s, y, x + s, y + s],
      [-1, 0, x, y, x, y + s],
      [0, 1, x, y + s, x + s, y + s],
      [0, -1, x, y, x + s, y],
    ]) {
      const n = (cell.z + dz) * maze.size + (cell.x + dx);
      const linked = cell.x + dx >= 0 && cell.x + dx < maze.size && cell.links.includes(n);
      const door = linked && maze.doors.find((d) => edgeKey(d.a, d.b) === edgeKey(c, n) && !world.doors.find((w) => w.box.edge === edgeKey(c, n))?.open);
      if (linked && !door) continue;
      mapCtx.strokeStyle = door ? KEY_COLORS[door.color] : '#2b2d5e';
      mapCtx.lineWidth = door ? 3 : 1.5;
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x2, y2);
      mapCtx.stroke();
    }
  }
  const dot = (c, color, r) => {
    const [x, y] = pos(c);
    mapCtx.fillStyle = color;
    mapCtx.beginPath();
    mapCtx.arc(x + s / 2, y + s / 2, r, 0, Math.PI * 2);
    mapCtx.fill();
  };
  for (const k of world.keys) if (!k.taken && S.visited.has(k.cell)) dot(k.cell, KEY_COLORS[k.color], 3);
  for (const st of world.stars) if (!st.taken && S.visited.has(st.cell)) dot(st.cell, '#ffd166', 3);
  dot(maze.goal, '#ffd166', 4.5); // 출구는 항상 보인다 (빛기둥과 같은 방향 힌트)
  const px = pad + ((player.x + ((maze.size - 1) * 4) / 2) / 4 + 0.5) * s;
  const py = pad + ((player.z + ((maze.size - 1) * 4) / 2) / 4 + 0.5) * s;
  mapCtx.fillStyle = '#ff8fab';
  mapCtx.beginPath();
  mapCtx.arc(px, py, 4, 0, Math.PI * 2);
  mapCtx.fill();
}

// ---------- 루프 ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(player.x, player.y + 1, player.z);
let mapTimer = 0;
let doorHintAt = 0;

function near(a, x, y, z, r) {
  return (a.x - x) ** 2 + (a.y - y) ** 2 + (a.z - z) ** 2 < r * r;
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  movePlatforms(boxes, t);
  for (const p of world.platforms) {
    const b = p.box;
    p.mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  }
  for (const s of world.spikes) {
    s.up = spikeUp(s.phase, t);
    const target = s.up ? 0 : -0.55;
    s.mesh.userData.blades.position.y += (target - s.mesh.userData.blades.position.y) * Math.min(1, dt * 18);
  }

  let moving = false;
  if (S.started && !S.finished) {
    S.time += dt;
    let f = 0;
    let side = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) side += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) side -= 1;
    const sin = Math.sin(cam.yaw);
    const cos = Math.cos(cam.yaw);
    let mx = -sin * f + cos * side;
    let mz = -cos * f - sin * side;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      moving = true;
      facing = Math.atan2(mx, mz);
    }
    stepPlayer(player, boxes, { x: mx, z: mz }, jumpQueued, dt);
    jumpQueued = false;

    const cell = cellAt(maze, player.x, player.z);
    if (cell >= 0) S.visited.add(cell);
    const floor = cell >= 0 ? world.floorTop(cell) : 0;
    const onFloor = player.grounded && Math.abs(player.y - floor) < 0.05;

    if (player.y < -4) die('구덩이에 빠졌어요');

    for (const pad of world.pads) {
      if (onPad(player, pad)) {
        launch(player, PAD_V);
        pad.squash = 1;
      }
    }
    for (const s of world.spikes) if (s.cell === cell && s.up && onFloor && s.mesh.userData.blades.position.y > -0.2) die('가시에 찔렸어요');

    for (const k of world.keys) {
      if (k.taken || !near(player, k.mesh.position.x, k.mesh.position.y - 0.6, k.mesh.position.z, 1.3)) continue;
      k.taken = true;
      k.mesh.visible = false;
      S.keys.add(k.color);
      document.querySelector(`.key-slot[data-color="${k.color}"]`).classList.add('have');
      toast(`🔑 ${k.color === 'red' ? '빨간' : '파란'} 열쇠를 얻었어요!`);
    }
    for (const d of world.doors) {
      if (d.open) continue;
      const b = d.box;
      const qx = Math.min(Math.max(player.x, b.minX), b.maxX);
      const qz = Math.min(Math.max(player.z, b.minZ), b.maxZ);
      if (Math.hypot(player.x - qx, player.z - qz) > player.r + 0.25) continue;
      if (S.keys.has(b.color)) {
        d.open = true;
        boxes.splice(boxes.indexOf(b), 1);
        toast('🚪 문이 열렸어요!');
      } else if (t - doorHintAt > 3) {
        doorHintAt = t;
        toast(`🔒 ${b.color === 'red' ? '빨간' : '파란'} 열쇠가 필요해요`);
      }
    }
    for (const st of world.stars) {
      if (st.taken || !near(player, st.mesh.position.x, st.mesh.position.y - 0.6, st.mesh.position.z, 1.3)) continue;
      st.taken = true;
      st.mesh.visible = false;
      S.stars.add(st.cell);
      toast(`⭐ 별 ${S.stars.size}/3`);
    }
    for (const cp of world.checkpoints) {
      if (cp.active || cp.cell !== cell || !player.grounded) continue;
      cp.active = true;
      cp.mesh.userData.flag.material = cp.mesh.userData.flag.material.clone();
      cp.mesh.userData.flag.material.color.set('#7ee08f');
      checkpoint = spawnAt(cp.cell);
      toast('🚩 체크포인트!');
    }
    if (cell === maze.goal && near(player, world.goal.mesh.position.x, world.floorTop(maze.goal), world.goal.mesh.position.z, 1.6)) finish();

    S.recordTimer -= dt;
    if (S.recordTimer <= 0) {
      S.recordTimer = 0.1;
      S.frames.push([+S.time.toFixed(2), +player.x.toFixed(2), +player.y.toFixed(2), +player.z.toFixed(2), +facing.toFixed(2)]);
    }
  }

  // 고스트: 같은 경과 시간의 기록 위치를 보간해서 보여준다
  if (ghost && S.started) {
    const fr = best.frames;
    let i = fr.findIndex((f) => f[0] > S.time);
    if (i === -1) i = fr.length - 1;
    const a = fr[Math.max(0, i - 1)];
    const b = fr[i];
    const k = b[0] === a[0] ? 1 : THREE.MathUtils.clamp((S.time - a[0]) / (b[0] - a[0]), 0, 1);
    ghost.root.position.set(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
    ghost.root.rotation.y = b[4];
    ghost.update(dt, i < fr.length - 1 && Math.hypot(b[1] - a[1], b[3] - a[3]) > 0.01);
  }

  // 연출
  for (const k of world.keys) k.mesh.rotation.y = t * 2;
  for (const st of world.stars) {
    st.mesh.rotation.y = t * 1.5;
    st.mesh.children[0].position.y = Math.sin(t * 3) * 0.1;
  }
  for (const pad of world.pads) {
    pad.squash = Math.max(0, pad.squash - dt * 3);
    pad.mesh.userData.top.position.y = 0.28 - pad.squash * 0.15;
    pad.mesh.userData.arrow.position.y = 0.75 + Math.sin(t * 4) * 0.12;
  }
  for (const d of world.doors) {
    if (!d.open || !d.mesh.visible) continue;
    d.mesh.position.y -= dt * 4;
    if (d.mesh.position.y < -6) d.mesh.visible = false;
  }
  world.goal.mesh.userData.ring.rotation.y = t;

  // 캐릭터 & 카메라
  me.root.position.set(player.x, player.y, player.z);
  me.root.rotation.y += Math.atan2(Math.sin(facing - me.root.rotation.y), Math.cos(facing - me.root.rotation.y)) * Math.min(1, dt * 14);
  me.update(dt, moving && player.grounded);
  lantern.position.set(player.x, player.y + 2.2, player.z);

  camTarget.lerp(new THREE.Vector3(player.x, player.y + 1, player.z), 1 - Math.exp(-dt * 10));
  const cp = Math.cos(cam.pitch);
  camera.position.lerp(
    new THREE.Vector3(camTarget.x + Math.sin(cam.yaw) * cam.dist * cp, camTarget.y + Math.sin(cam.pitch) * cam.dist, camTarget.z + Math.cos(cam.yaw) * cam.dist * cp),
    1 - Math.exp(-dt * 8),
  );
  camera.lookAt(camTarget);

  $('#timer').textContent = fmt(S.time);
  $('#star-count').textContent = `${S.stars.size}/3`;
  $('#death-count').textContent = S.deaths;
  mapTimer -= dt;
  if (mapTimer <= 0) {
    mapTimer = 0.2;
    drawMap();
  }

  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// 개발·테스트용 핸들 (클라이언트 게임은 어차피 콘솔로 조작 가능하다 — 배울 점 참고)
window.__maze = { maze, player, S, world, boxes };
