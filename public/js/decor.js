import * as THREE from 'three';

// 상점에서 파는 마당 꾸미기 아이템. 전부 기본 도형을 조합한 오리지널 모델이다.

const toon = (color, extra) => new THREE.MeshToonMaterial({ color, ...extra });
const ball = new THREE.SphereGeometry(1, 20, 14);
const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);

function part(geo, mat, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const BUILDERS = {
  pink_tree() {
    const g = new THREE.Group();
    g.add(part(cyl(0.18, 0.26, 1.4, 10), toon('#a47551'), [0, 0.7, 0]));
    for (const [x, y, z, s, c] of [
      [0, 1.9, 0, 0.95, '#ffb7c5'], [0.45, 2.3, 0.15, 0.65, '#ffd1dc'], [-0.4, 2.25, -0.15, 0.6, '#ffd1dc'], [0, 2.7, 0, 0.55, '#ffb7c5'],
    ]) g.add(part(ball, toon(c), [x, y, z], [s, s, s]));
    return g;
  },
  round_tree() {
    const g = new THREE.Group();
    g.add(part(cyl(0.16, 0.24, 1.2, 10), toon('#8d6748'), [0, 0.6, 0]));
    g.add(part(ball, toon('#8fd694'), [0, 1.8, 0], [0.9, 0.9, 0.9]));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(part(ball, toon('#ff6b6b'), [Math.cos(a) * 0.7, 1.7 + (i % 2) * 0.3, Math.sin(a) * 0.7], [0.1, 0.1, 0.1]));
    }
    return g;
  },
  flower_bed() {
    const g = new THREE.Group();
    g.add(part(cyl(0.8, 0.85, 0.15, 24), toon('#9c7356'), [0, 0.07, 0]));
    const colors = ['#ff8fab', '#ffd166', '#bdb2ff', '#ffffff', '#ff9e7a'];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const r = 0.15 + (i % 3) * 0.22;
      g.add(part(cyl(0.02, 0.02, 0.3, 4), toon('#5cae5c'), [Math.cos(a) * r, 0.3, Math.sin(a) * r]));
      g.add(part(ball, toon(colors[i % colors.length]), [Math.cos(a) * r, 0.47, Math.sin(a) * r], [0.1, 0.08, 0.1]));
    }
    return g;
  },
  bench() {
    const g = new THREE.Group();
    const wood = toon('#c98b5a');
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    g.add(part(box(1.5, 0.1, 0.45), wood, [0, 0.45, 0]));
    g.add(part(box(1.5, 0.35, 0.08), wood, [0, 0.75, -0.2]));
    for (const x of [-0.6, 0.6]) for (const z of [-0.15, 0.15]) g.add(part(box(0.08, 0.45, 0.08), toon('#6b4a35'), [x, 0.22, z]));
    return g;
  },
  lamp() {
    const g = new THREE.Group();
    g.add(part(cyl(0.08, 0.12, 2, 10), toon('#4a3b47'), [0, 1, 0]));
    g.add(part(ball, toon('#fff4b8', { emissive: '#ffd166', emissiveIntensity: 0.8 }), [0, 2.15, 0], [0.25, 0.25, 0.25]));
    g.add(part(new THREE.ConeGeometry(0.3, 0.2, 12), toon('#4a3b47'), [0, 2.4, 0]));
    const light = new THREE.PointLight('#ffd98a', 2, 6);
    light.position.y = 2.1;
    g.add(light);
    return g;
  },
  mushroom_house() {
    const g = new THREE.Group();
    g.add(part(cyl(0.75, 0.9, 1.4, 20), toon('#fff3e0'), [0, 0.7, 0]));
    g.add(part(ball, toon('#ff6b6b'), [0, 1.55, 0], [1.4, 0.8, 1.4]));
    for (const [x, y, z] of [[0.6, 2.0, 0.6], [-0.7, 1.85, 0.3], [0, 2.25, -0.3], [0.2, 1.9, -0.9]]) {
      g.add(part(ball, toon('#ffffff'), [x, y, z], [0.18, 0.1, 0.18]));
    }
    g.add(part(new THREE.BoxGeometry(0.4, 0.65, 0.05), toon('#a47551'), [0, 0.33, 0.88]));
    g.add(part(new THREE.CircleGeometry(0.15, 16), toon('#9bf6ff'), [0.45, 0.95, 0.72]));
    g.children.at(-1).rotation.y = 0.5;
    return g;
  },
  pond() {
    const g = new THREE.Group();
    const water = part(new THREE.CircleGeometry(1.05, 32), toon('#8fd3ff'), [0, 0.04, 0]);
    water.rotation.x = -Math.PI / 2;
    g.add(water);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(part(ball, toon('#c9c3d6'), [Math.cos(a) * 1.1, 0.06, Math.sin(a) * 1.1], [0.2, 0.12, 0.2]));
    }
    const pad = part(new THREE.CircleGeometry(0.2, 16), toon('#7ac74c'), [0.35, 0.06, -0.2]);
    pad.rotation.x = -Math.PI / 2;
    g.add(pad, part(ball, toon('#ffb7c5'), [0.35, 0.12, -0.2], [0.07, 0.06, 0.07]));
    return g;
  },
  balloon() {
    const g = new THREE.Group();
    const colors = ['#ff8fab', '#a0c4ff', '#ffd166'];
    colors.forEach((c, i) => {
      const x = (i - 1) * 0.3;
      g.add(part(cyl(0.008, 0.008, 1.6, 4), toon('#ffffff'), [x * 0.5, 0.8, 0]));
      const b = part(ball, toon(c), [x, 1.75 + (i % 2) * 0.2, 0], [0.25, 0.3, 0.25]);
      b.userData.float = i;
      g.add(b);
    });
    g.add(part(ball, toon('#c9c3d6'), [0, 0.06, 0], [0.12, 0.06, 0.12]));
    return g;
  },
  tent() {
    const g = new THREE.Group();
    const cone = part(new THREE.ConeGeometry(1.1, 1.6, 6), toon('#ffd6a5'), [0, 0.8, 0]);
    g.add(cone);
    g.add(part(new THREE.ConeGeometry(0.4, 0.75, 3), toon('#6b4a35'), [0, 0.37, 0.75]));
    g.add(part(cyl(0.02, 0.02, 0.5, 4), toon('#6b4a35'), [0, 1.8, 0]));
    const flag = part(new THREE.BoxGeometry(0.3, 0.18, 0.01), toon('#ff8fab'), [0.15, 1.95, 0]);
    g.add(flag);
    return g;
  },
  snowman() {
    const g = new THREE.Group();
    const snow = toon('#ffffff');
    g.add(part(ball, snow, [0, 0.45, 0], [0.5, 0.45, 0.5]));
    g.add(part(ball, snow, [0, 1.1, 0], [0.35, 0.33, 0.35]));
    for (const s of [-1, 1]) g.add(part(ball, toon('#3a2e39'), [0.12 * s, 1.18, 0.3], [0.04, 0.04, 0.04]));
    g.add(part(new THREE.ConeGeometry(0.06, 0.3, 8), toon('#ff9e5e'), [0, 1.1, 0.42], [1, 1, 1]));
    g.children.at(-1).rotation.x = Math.PI / 2;
    g.add(part(cyl(0.38, 0.38, 0.1, 16), toon('#ff8fab'), [0, 0.85, 0]));
    g.add(part(cyl(0.2, 0.22, 0.3, 16), toon('#4a3b47'), [0, 1.5, 0]));
    return g;
  },
  stones() {
    const g = new THREE.Group();
    for (const [x, z, s] of [[-0.45, -0.3, 0.3], [0.05, 0.1, 0.26], [0.45, -0.2, 0.28], [-0.1, 0.5, 0.22]]) {
      g.add(part(ball, toon('#d9d4e3'), [x, 0.04, z], [s, 0.06, s * 0.85]));
    }
    return g;
  },
  mailbox() {
    const g = new THREE.Group();
    g.add(part(cyl(0.05, 0.05, 0.9, 8), toon('#8d6748'), [0, 0.45, 0]));
    g.add(part(new THREE.BoxGeometry(0.3, 0.3, 0.45), toon('#ff6b6b'), [0, 1.05, 0]));
    g.add(part(cyl(0.15, 0.15, 0.45, 16, 1), toon('#ff6b6b'), [0, 1.2, 0]));
    g.children.at(-1).rotation.x = Math.PI / 2;
    g.add(part(new THREE.BoxGeometry(0.04, 0.2, 0.1), toon('#ffd166'), [0.17, 1.25, 0.1]));
    return g;
  },
};

export const DECOR_KINDS = Object.keys(BUILDERS);

export function buildDecor(kind) {
  const g = (BUILDERS[kind] ?? BUILDERS.balloon)();
  g.userData.kind = kind;
  return g;
}

/** 배치 미리보기용 반투명 복제본 */
export function buildGhost(kind) {
  const g = buildDecor(kind);
  g.traverse((o) => {
    if (o.isLight) o.visible = false;
    if (!o.isMesh) return;
    o.castShadow = false;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.55;
    o.material.depthWrite = false;
  });
  return g;
}

/** 풍선처럼 살랑이는 아이템 애니메이션 */
export function animateDecor(group, t) {
  group.traverse((o) => {
    if (o.userData.float !== undefined) o.position.x = (o.userData.float - 1) * 0.3 + Math.sin(t * 1.5 + o.userData.float) * 0.05;
  });
}

// ---------- 상점 썸네일 ----------
let thumbRenderer = null;
const thumbs = new Map();

/** 아이템을 작은 캔버스에 한 번 렌더링해서 dataURL로 캐시한다. */
export function decorThumbnail(kind) {
  if (thumbs.has(kind)) return thumbs.get(kind);
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(160, 160);
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9e7c0', 2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const obj = buildDecor(kind);
  scene.add(obj);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  cam.position.copy(center).add(new THREE.Vector3(0.8, 0.7, 1.2).normalize().multiplyScalar(size * 1.35));
  cam.lookAt(center);

  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL();
  thumbs.set(kind, url);
  return url;
}
