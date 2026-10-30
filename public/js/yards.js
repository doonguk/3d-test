import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildDecor, animateDecor } from './decor.js';

// server/yards.js의 PLOT_COUNT, PLOT_RADIUS와 맞춘다
export const PLOT_COUNT = 8;
export const PLOT_RADIUS = 5.5;
const PLOT_RING = 24;

/** 섬 둘레에 고르게 놓인 개인 마당. 입구는 섬 중앙(광장)을 향한다. */
export const PLOTS = Array.from({ length: PLOT_COUNT }, (_, i) => {
  const a = (i / PLOT_COUNT) * Math.PI * 2 + Math.PI / 8;
  const x = Math.cos(a) * PLOT_RING;
  const z = Math.sin(a) * PLOT_RING;
  return { x, z, toCenter: new THREE.Vector2(-x, -z).normalize() };
});

const toon = (color) => new THREE.MeshToonMaterial({ color });

function makeFence(plot) {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.7, 8);
  const capGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const mat = toon('#fffaf2');
  const entrance = Math.atan2(plot.toCenter.y, plot.toCenter.x);
  const posts = 28;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - entrance), Math.cos(a - entrance))) < 0.35) continue; // 입구
    const post = new THREE.Mesh(postGeo, mat);
    post.position.set(Math.cos(a) * PLOT_RADIUS, 0.35, Math.sin(a) * PLOT_RADIUS);
    post.castShadow = true;
    const cap = new THREE.Mesh(capGeo, mat);
    cap.position.set(post.position.x, 0.72, post.position.z);
    g.add(post, cap);
  }
  return g;
}

/** 마당(바닥·울타리·팻말)과 그 위에 놓인 꾸미기 아이템을 그린다. */
export function createYards(scene, catalog) {
  const slots = PLOTS.map((plot) => {
    const root = new THREE.Group();
    root.position.set(plot.x, 0, plot.z);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(PLOT_RADIUS, 48), toon('#d7f2c8'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.02;
    ground.receiveShadow = true;
    root.add(ground, makeFence(plot));

    const signEl = document.createElement('div');
    signEl.className = 'plot-sign empty';
    signEl.textContent = '🌱 빈 마당';
    const sign = new CSS2DObject(signEl);
    sign.position.set(plot.toCenter.x * (PLOT_RADIUS + 0.4), 1.1, plot.toCenter.y * (PLOT_RADIUS + 0.4));
    root.add(sign);

    scene.add(root);
    return { plot, root, ground, signEl, owner: null };
  });

  const decor = new Map(); // id -> { mesh, plot, kind, x, z }
  let colliders = [];
  const rebuildColliders = () => {
    colliders = [...decor.values()].map((d) => {
      const { plot } = slots[d.plot];
      return { x: plot.x + d.x, z: plot.z + d.z, r: catalog[d.kind]?.r ?? 0.5, walkable: ['flower_bed', 'stones'].includes(d.kind) };
    }).filter((c) => !c.walkable);
  };

  let t = 0;
  return {
    get colliders() {
      return colliders;
    },
    setOwner(index, { name, color }) {
      const slot = slots[index];
      if (!slot) return;
      slot.owner = { name, color };
      slot.signEl.textContent = `🏡 ${name}의 마당`;
      slot.signEl.classList.remove('empty');
      slot.ground.material.color.set(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6));
    },
    addDecor(d) {
      this.removeDecor(d.id);
      const slot = slots[d.plot];
      if (!slot) return;
      const mesh = buildDecor(d.kind);
      mesh.position.set(d.x, 0, d.z);
      mesh.rotation.y = d.rot;
      mesh.traverse((o) => (o.userData.decorId = d.id));
      slot.root.add(mesh);
      decor.set(d.id, { ...d, mesh });
      rebuildColliders();
    },
    removeDecor(id) {
      const d = decor.get(id);
      if (!d) return;
      d.mesh.removeFromParent();
      decor.delete(id);
      rebuildColliders();
    },
    /** 이 마당에 놓인 아이템 메시들 (클릭 판정용) */
    decorMeshes(index) {
      return [...decor.values()].filter((d) => d.plot === index).map((d) => d.mesh);
    },
    center(index) {
      return slots[index].plot;
    },
    /** 마당 입구 바로 안쪽 */
    entrance(index) {
      const { plot } = slots[index];
      return { x: plot.x + plot.toCenter.x * (PLOT_RADIUS - 1), z: plot.z + plot.toCenter.y * (PLOT_RADIUS - 1), plot };
    },
    update(dt) {
      t += dt;
      for (const d of decor.values()) if (d.kind === 'balloon') animateDecor(d.mesh, t);
    },
  };
}
