import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createWorld, WORLD_RADIUS } from './world.js';
import { createCharacter } from './character.js';
import { createYards } from './yards.js';

const $ = (sel) => document.querySelector(sel);
const socket = io();

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
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
const world = createWorld(scene);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- 상태 ----------
const SPEED = 5.5;
let me = null; // { sid, name, char, x, z, ry }
const others = new Map(); // sid -> { name, color, char, x, z, ry, tx, tz, tr, moving }
export const state = {
  inventory: { coins: 0, items: [] },
  catalog: {}, // 접속 시 서버에서 채운다
  myDecor: [],
  mode: 'play', // 'play' | 'edit'
  focus: null, // 꾸미기 중 카메라가 바라볼 지점 { x, z }
};
export const yards = createYards(scene, state.catalog);

function spawn(p, isMe = false) {
  const char = createCharacter({ ...p, isMe });
  char.root.position.set(p.x, 0, p.z);
  char.root.rotation.y = p.ry;
  scene.add(char.root);
  return { ...p, char, tx: p.x, tz: p.z, tr: p.ry, moving: false };
}

function addOther(p) {
  removeOther(p.sid);
  others.set(p.sid, spawn(p));
  renderOnline();
}

function removeOther(sid) {
  const o = others.get(sid);
  if (!o) return;
  scene.remove(o.char.root);
  others.delete(sid);
  renderOnline();
}

export const findPlayer = (sid) => (me?.sid === sid ? me : others.get(sid));
export const getMe = () => me;
export const getOthers = () => others;

// ---------- UI ----------
export function toast(text, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function appendChat({ system, name, text }) {
  const log = $('#chat-log');
  const line = document.createElement('div');
  if (system) {
    line.className = 'sys';
    line.textContent = `· ${text}`;
  } else {
    line.innerHTML = `<b>${escapeHtml(name)}</b> ${escapeHtml(text)}`;
  }
  log.appendChild(line);
  while (log.children.length > 80) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

export function setInventory(inv) {
  state.inventory = inv;
  $('#coins').textContent = `🪙 ${inv.coins}`;
  $('#items').replaceChildren(
    ...inv.items.map((it) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.title = it.name;
      el.textContent = it.emoji;
      return el;
    }),
  );
  document.dispatchEvent(new CustomEvent('inventory', { detail: inv }));
}

function setMyDecor(list) {
  state.myDecor = list;
  document.dispatchEvent(new CustomEvent('decor-mine', { detail: list }));
}

function renderOnline() {
  if (!me) return;
  const all = [me, ...others.values()];
  $('#online-count').textContent = `${all.length}명`;
  $('#online-list').replaceChildren(
    ...all.map((p) => {
      const li = document.createElement('li');
      li.dataset.sid = p.sid;
      li.className = p === me ? 'me' : 'other';
      li.innerHTML = `<span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)}${p === me ? ' <span class="muted">(나)</span>' : ''}`;
      return li;
    }),
  );
}

// ---------- 로그인 ----------
const COLORS = ['#ffb3c7', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#f5ebe0', '#c9ada7'];
const saved = JSON.parse(localStorage.getItem('mongle:profile') ?? '{}');
let pick = { animal: saved.animal ?? 'cat', color: saved.color ?? COLORS[0] };
$('#name').value = saved.name ?? '';

$('#colors').replaceChildren(
  ...COLORS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.dataset.color = c;
    return b;
  }),
);
function syncPicker() {
  for (const b of document.querySelectorAll('#animals button')) b.classList.toggle('selected', b.dataset.animal === pick.animal);
  for (const b of document.querySelectorAll('#colors button')) b.classList.toggle('selected', b.dataset.color === pick.color);
}
$('#animals').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) (pick.animal = b.dataset.animal), syncPicker();
});
$('#colors').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) (pick.color = b.dataset.color), syncPicker();
});
syncPicker();

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#name').value.trim();
  const submit = $('#login-form .primary');
  submit.disabled = true;
  socket.emit('join', { name, ...pick }, (res) => {
    submit.disabled = false;
    if (!res.ok) return void ($('#login-error').textContent = res.error);
    localStorage.setItem('mongle:profile', JSON.stringify({ name, ...pick }));
    enterWorld(res);
  });
});

function enterWorld(res) {
  $('#login').hidden = true;
  $('#hud').hidden = false;
  me = spawn(res.me, true);
  res.players.forEach(addOther);
  setInventory(res.inventory);
  Object.assign(state.catalog, res.catalog);
  res.yards.forEach((y) => yards.setOwner(y.plot, y));
  res.decor.forEach((d) => yards.addDecor(d));
  setMyDecor(res.myDecor);
  renderOnline();
  document.dispatchEvent(new CustomEvent('entered', { detail: res }));
  toast(res.isNew ? '환영해요! 선물로 코인과 아이템을 받았어요 🎁' : `다시 왔네요, ${res.me.name}!`);
}

// ---------- 네트워크 ----------
socket.on('player:join', addOther);
socket.on('player:leave', ({ sid }) => removeOther(sid));
socket.on('player:move', ({ sid, x, z, ry, moving }) => {
  const o = others.get(sid);
  if (!o) return;
  Object.assign(o, { tx: x, tz: z, tr: ry, moving });
});
socket.on('player:jump', ({ sid }) => others.get(sid)?.char.jump());
socket.on('chat', (msg) => {
  appendChat(msg);
  if (!msg.system) findPlayer(msg.sid)?.char.say(msg.text);
});
socket.on('inventory', setInventory);
socket.on('yard:update', (y) => yards.setOwner(y.plot, y));
socket.on('decor:placed', (d) => yards.addDecor(d));
socket.on('decor:removed', ({ id }) => yards.removeDecor(id));
socket.on('decor:mine', setMyDecor);
socket.on('disconnect', () => toast('서버와 연결이 끊겼어요. 새로고침 해주세요 🥲', 10000));

// ---------- 입력 ----------
const keys = new Set();
const typing = () => document.activeElement?.tagName === 'INPUT';

addEventListener('keydown', (e) => {
  if (!me) return;
  if (e.key === 'Enter' && !typing()) {
    $('#chat-input').focus();
    e.preventDefault();
    return;
  }
  if (typing()) return;
  keys.add(e.code);
  if (e.code === 'Space' && !e.repeat) {
    me.char.jump();
    socket.emit('jump');
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = e.target.value.trim();
    if (text) socket.emit('chat', text);
    e.target.value = '';
    e.target.blur();
  } else if (e.key === 'Escape') {
    e.target.blur();
  }
  e.stopPropagation();
});

// 카메라: 드래그로 회전, 휠로 줌. 거의 안 움직인 클릭은 'world-click' 이벤트로 넘긴다.
const cam = { yaw: 0, pitch: 0.55, dist: 11 };
let drag = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX;
  drag.y = e.clientY;
  cam.yaw -= dx * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, 0.15, 1.25);
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && drag.moved < 6) {
    document.dispatchEvent(new CustomEvent('world-click', { detail: { x: e.clientX, y: e.clientY } }));
  }
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 5, 22);
}, { passive: true });

/** 화면 좌표에 있는 다른 플레이어의 sid (없으면 null) */
const raycaster = new THREE.Raycaster();
export function rayAt(x, y) {
  raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  return raycaster;
}
export function pickPlayerAt(x, y) {
  rayAt(x, y);
  const roots = [...others.values()].map((o) => o.char.root);
  const hit = raycaster.intersectObjects(roots, true)[0];
  if (!hit) return null;
  const root = hit.object.userData.character;
  for (const [sid, o] of others) if (o.char.root === root) return sid;
  return null;
}

// ---------- 루프 ----------
function collide(p) {
  for (const c of [...world.colliders, ...yards.colliders]) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + 0.45;
    if (d < min && d > 1e-4) {
      p.x = c.x + (dx / d) * min;
      p.z = c.z + (dz / d) * min;
    }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > WORLD_RADIUS) {
    p.x *= WORLD_RADIUS / d;
    p.z *= WORLD_RADIUS / d;
  }
}

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

let sendTimer = 0;
let lastSent = '';
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  world.update(dt);
  yards.update(dt);

  if (me) {
    let f = 0;
    let s = 0;
    if (!typing() && state.mode === 'play') {
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    }
    const sin = Math.sin(cam.yaw);
    const cos = Math.cos(cam.yaw);
    let mx = -sin * f + cos * s;
    let mz = -cos * f - sin * s;
    const len = Math.hypot(mx, mz);
    me.moving = len > 0;
    if (me.moving) {
      mx /= len;
      mz /= len;
      me.x += mx * SPEED * dt;
      me.z += mz * SPEED * dt;
      collide(me);
      me.ry = lerpAngle(me.ry, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
    }
    me.char.root.position.set(me.x, 0, me.z);
    me.char.root.rotation.y = me.ry;
    me.char.update(dt, me.moving);

    sendTimer -= dt;
    const snapshot = `${me.x.toFixed(2)},${me.z.toFixed(2)},${me.ry.toFixed(2)},${me.moving}`;
    if (sendTimer <= 0 && snapshot !== lastSent) {
      socket.emit('move', { x: me.x, z: me.z, ry: me.ry, moving: me.moving });
      lastSent = snapshot;
      sendTimer = 0.08;
    }

    const focus = state.focus ?? me;
    camTarget.lerp(new THREE.Vector3(focus.x, 1.2, focus.z), 1 - Math.exp(-dt * 10));
    const cp = Math.cos(cam.pitch);
    camera.position.lerp(
      new THREE.Vector3(camTarget.x + sin * cam.dist * cp, 1.2 + Math.sin(cam.pitch) * cam.dist, camTarget.z + cos * cam.dist * cp),
      1 - Math.exp(-dt * 10),
    );
    camera.lookAt(camTarget);
  } else {
    // 로그인 전: 마을을 천천히 빙글
    const t = clock.elapsedTime * 0.08;
    camera.position.set(Math.sin(t) * 30, 16, Math.cos(t) * 30);
    camera.lookAt(0, 0, 0);
  }

  const k = 1 - Math.exp(-dt * 12);
  for (const o of others.values()) {
    o.x += (o.tx - o.x) * k;
    o.z += (o.tz - o.z) * k;
    o.ry = lerpAngle(o.ry, o.tr, k);
    o.char.root.position.set(o.x, 0, o.z);
    o.char.root.rotation.y = o.ry;
    o.char.update(dt, o.moving || Math.hypot(o.tx - o.x, o.tz - o.z) > 0.05);
  }

  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

export { socket, scene, cam, canvas };
