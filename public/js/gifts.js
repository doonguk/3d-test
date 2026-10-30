import * as THREE from 'three';
import { socket, scene, getMe, toast } from './main.js';

const PICKUP_RADIUS = 1.3;
const toon = (color) => new THREE.MeshToonMaterial({ color });
const BOX_COLORS = ['#ff8fab', '#a0c4ff', '#caffbf', '#ffd6a5', '#bdb2ff'];
const RIBBON = toon('#ffffff');
const GOLD = toon('#ffd166');

const boxGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
const ribbonA = new THREE.BoxGeometry(0.64, 0.52, 0.12);
const ribbonB = new THREE.BoxGeometry(0.12, 0.52, 0.64);
const bowGeo = new THREE.TorusGeometry(0.1, 0.04, 8, 16);
const coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 24);

function makeGift(kind, id) {
  const g = new THREE.Group();
  if (kind === 'coin') {
    const coin = new THREE.Mesh(coinGeo, GOLD);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    g.add(coin);
  } else {
    const box = new THREE.Mesh(boxGeo, toon(BOX_COLORS[id % BOX_COLORS.length]));
    box.castShadow = true;
    g.add(box, new THREE.Mesh(ribbonA, RIBBON), new THREE.Mesh(ribbonB, RIBBON));
    for (const s of [-1, 1]) {
      const bow = new THREE.Mesh(bowGeo, RIBBON);
      bow.position.set(0.09 * s, 0.32, 0);
      bow.rotation.y = Math.PI / 2;
      g.add(bow);
    }
  }
  return g;
}

const gifts = new Map(); // id -> { mesh, x, z, pending }

function add(gift) {
  if (gifts.has(gift.id)) return;
  const mesh = makeGift(gift.kind, gift.id);
  mesh.position.set(gift.x, 0.5, gift.z);
  mesh.userData.phase = Math.random() * 10;
  scene.add(mesh);
  gifts.set(gift.id, { ...gift, mesh, pending: false });
}

function remove(id) {
  const g = gifts.get(id);
  if (!g) return;
  scene.remove(g.mesh);
  gifts.delete(id);
}

document.addEventListener('entered', ({ detail }) => detail.gifts.forEach(add));
socket.on('gift:spawn', add);
socket.on('gift:remove', ({ id }) => remove(id));
socket.on('gift:got', ({ text }) => toast(text));

const clock = new THREE.Clock();
(function loop() {
  const t = clock.getElapsedTime();
  const me = getMe();
  for (const [id, g] of gifts) {
    g.mesh.position.y = 0.5 + Math.sin(t * 2 + g.mesh.userData.phase) * 0.12;
    g.mesh.rotation.y = t * 1.2 + g.mesh.userData.phase;
    if (me && !g.pending && Math.hypot(me.x - g.x, me.z - g.z) < PICKUP_RADIUS) {
      g.pending = true;
      socket.emit('gift:pickup', id);
      setTimeout(() => (g.pending = false), 1000);
    }
  }
  requestAnimationFrame(loop);
})();
