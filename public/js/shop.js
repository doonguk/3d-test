import * as THREE from 'three';
import { socket, state, toast, getMe, yards, rayAt, cam, canvas, scene } from './main.js';
import { buildGhost, decorThumbnail } from './decor.js';
import { PLOT_RADIUS } from './yards.js';

const $ = (sel) => document.querySelector(sel);
const MAX_PLACED = 40;
const myPlot = () => getMe()?.plot ?? null;

function needYard() {
  if (myPlot() != null) return true;
  toast('마당이 모두 찼어요 🥲 (데모는 8개)');
  return false;
}

// ---------- 내 마당 패널 ----------
function goToYard() {
  if (!needYard()) return;
  const me = getMe();
  const { x, z, plot } = yards.entrance(me.plot);
  Object.assign(me, { x, z, ry: Math.atan2(-plot.toCenter.x, -plot.toCenter.y) });
  cam.yaw = Math.atan2(plot.toCenter.x, plot.toCenter.y);
  // 높게 내려다봐서 마당 바깥 나무에 카메라가 묻히지 않게
  cam.pitch = 0.75;
  cam.dist = 9;
}

function renderYardCount() {
  const placed = state.myDecor.filter((d) => d.placed).length;
  const stored = state.myDecor.length - placed;
  $('#yard-count').textContent = `놓임 ${placed} · 보관 ${stored}`;
}

$('#go-yard').addEventListener('click', (e) => (e.currentTarget.blur(), goToYard()));
$('#open-shop').addEventListener('click', (e) => (e.currentTarget.blur(), openShop()));
$('#edit-yard').addEventListener('click', (e) => (e.currentTarget.blur(), enterEdit()));
$('#add-coins').addEventListener('click', (e) => (e.currentTarget.blur(), socket.emit('demo:coins')));

// ---------- 상점 ----------
function openShop() {
  renderShop();
  $('#shop').hidden = false;
}

function renderShop() {
  const coins = state.inventory.coins;
  $('#shop-coins').textContent = `🪙 ${coins}`;
  const owned = (kind) => state.myDecor.filter((d) => d.kind === kind).length;
  $('#shop-list').replaceChildren(
    ...Object.entries(state.catalog).map(([kind, item]) => {
      const card = document.createElement('div');
      card.className = 'shop-item';
      card.innerHTML = `
        <img alt="" src="${decorThumbnail(kind)}">
        <div class="shop-name"></div>
        <div class="muted small">보유 ${owned(kind)}</div>
        <button class="primary small" data-kind="${kind}">🪙 ${item.price}</button>`;
      card.querySelector('.shop-name').textContent = item.name;
      card.querySelector('button').disabled = coins < item.price;
      return card;
    }),
  );
}

$('#shop-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (!b) return;
  const { kind } = b.dataset;
  b.disabled = true;
  socket.emit('shop:buy', { kind }, (res) => {
    toast(res.ok ? `${state.catalog[kind].name} 구매 완료! 꾸미기에서 놓아 보세요 ✨` : res.error);
  });
});
$('#shop-close').addEventListener('click', () => ($('#shop').hidden = true));
$('#shop-to-edit').addEventListener('click', () => {
  $('#shop').hidden = true;
  enterEdit();
});

// ---------- 꾸미기 모드 ----------
let selected = null; // 선택한 kind
let ghost = null;
let ring = null;
let rot = 0;
let hover = null; // { x, z, valid } 마당 기준 좌표

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

function enterEdit() {
  if (!needYard()) return;
  $('#shop').hidden = true;
  state.mode = 'edit';
  state.focus = yards.center(myPlot());
  cam.pitch = 1.0;
  cam.dist = 15;
  $('#hud').classList.add('editing');
  $('#edit-tray').hidden = false;
  renderTray();
}

function exitEdit() {
  select(null);
  state.mode = 'play';
  state.focus = null;
  cam.pitch = 0.55;
  cam.dist = 11;
  $('#hud').classList.remove('editing');
  $('#edit-tray').hidden = true;
}

function select(kind) {
  ghost?.removeFromParent();
  ring?.removeFromParent();
  ghost = ring = null;
  selected = kind;
  if (kind) {
    ghost = buildGhost(kind);
    ghost.visible = false;
    const r = state.catalog[kind]?.r ?? 0.5;
    ring = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.08, 40),
      new THREE.MeshBasicMaterial({ color: '#4cd17a', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ghost.add(ring);
    scene.add(ghost);
  }
  renderTray();
}

function renderTray() {
  if (state.mode !== 'edit') return;
  const stored = new Map();
  for (const d of state.myDecor) if (!d.placed) stored.set(d.kind, (stored.get(d.kind) ?? 0) + 1);
  if (selected && !stored.has(selected)) return select(null);

  const placed = state.myDecor.length - [...stored.values()].reduce((a, b) => a + b, 0);
  $('#edit-count').textContent = `${placed}/${MAX_PLACED}`;
  $('#edit-items').replaceChildren(
    ...[...stored].map(([kind, n]) => {
      const b = document.createElement('button');
      b.className = 'edit-item' + (kind === selected ? ' selected' : '');
      b.dataset.kind = kind;
      b.title = state.catalog[kind]?.name ?? kind;
      b.innerHTML = `<img alt="" src="${decorThumbnail(kind)}"><span>${n}</span>`;
      return b;
    }),
  );
  $('#edit-hint').textContent = selected
    ? '클릭해서 놓기 · Q/E 회전 · Esc 선택 해제'
    : stored.size
      ? '아래에서 놓을 아이템을 고르거나, 놓인 아이템을 클릭해 보관함으로 되돌려요'
      : '보관함이 비었어요. 상점에서 사 오거나, 놓인 아이템을 클릭해 되돌려요';
}

function rotate(dir) {
  rot += (dir * Math.PI) / 4;
  if (ghost) ghost.rotation.y = rot;
}

$('#edit-items').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (b) select(b.dataset.kind === selected ? null : b.dataset.kind);
});
$('#edit-rotate').addEventListener('click', () => rotate(1));
$('#edit-shop').addEventListener('click', openShop);
$('#edit-done').addEventListener('click', exitEdit);

addEventListener('keydown', (e) => {
  if (state.mode !== 'edit' || document.activeElement?.tagName === 'INPUT') return;
  if (e.code === 'KeyQ') rotate(-1);
  if (e.code === 'KeyE') rotate(1);
  if (e.code === 'Escape') selected ? select(null) : exitEdit();
});

canvas.addEventListener('pointermove', (e) => {
  if (!ghost) return;
  if (!rayAt(e.clientX, e.clientY).ray.intersectPlane(plane, hit)) return;
  const center = yards.center(myPlot());
  const x = hit.x - center.x;
  const z = hit.z - center.z;
  const r = state.catalog[selected]?.r ?? 0.5;
  const valid = Math.hypot(x, z) + r <= PLOT_RADIUS - 0.2;
  hover = { x, z, valid };
  ghost.visible = true;
  ghost.position.set(hit.x, 0, hit.z);
  ghost.rotation.y = rot;
  ring.material.color.set(valid ? '#4cd17a' : '#ff5c7a');
});

document.addEventListener('world-click', ({ detail: { x, y } }) => {
  if (state.mode !== 'edit') return;

  if (selected) {
    if (!hover?.valid) return toast('마당 울타리 안에 놓아 주세요');
    const item = state.myDecor.find((d) => d.kind === selected && !d.placed);
    if (!item) return select(null);
    item.placed = true; // 응답 전에 같은 아이템을 두 번 놓지 않게
    socket.emit('decor:place', { id: item.id, x: hover.x, z: hover.z, rot }, (res) => {
      if (!res.ok) {
        item.placed = false;
        toast(res.error);
      }
    });
    return;
  }

  const target = rayAt(x, y).intersectObjects(yards.decorMeshes(myPlot()), true)[0];
  const id = target?.object.userData.decorId;
  if (id == null) return;
  socket.emit('decor:store', { id }, (res) => toast(res.ok ? '보관함으로 옮겼어요 📦' : res.error));
});

document.addEventListener('decor-mine', () => {
  renderYardCount();
  renderTray();
  if (!$('#shop').hidden) renderShop();
});
document.addEventListener('inventory', () => {
  if (!$('#shop').hidden) renderShop();
});
