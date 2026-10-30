import * as THREE from 'three';

export const WORLD_RADIUS = 37;
const ISLAND_RADIUS = 40;

// 모든 클라이언트가 같은 마을을 보도록 고정 시드 난수 사용
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra });
const ball = new THREE.SphereGeometry(1, 20, 14);

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeTree(rand) {
  const tree = new THREE.Group();
  const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 10), toon('#a47551')));
  trunk.position.y = 0.8;
  tree.add(trunk);
  const palettes = [['#8fd694', '#a8e6a1'], ['#ffb7c5', '#ffd1dc'], ['#7cc6a4', '#9be3c3'], ['#ffd59e', '#ffe7c2']];
  const [c1, c2] = palettes[Math.floor(rand() * palettes.length)];
  const blobs = [
    [0, 2.2, 0, 1.15, c1],
    [0.55, 2.7, 0.2, 0.8, c2],
    [-0.5, 2.6, -0.2, 0.75, c2],
    [0, 3.2, 0, 0.7, c1],
  ];
  for (const [x, y, z, s, c] of blobs) {
    const m = shadowed(new THREE.Mesh(ball, toon(c)));
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    tree.add(m);
  }
  tree.scale.setScalar(0.85 + rand() * 0.5);
  return tree;
}

function makeRock(rand) {
  const m = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), toon('#c9c3d6', { flatShading: true })));
  m.scale.set(1 + rand() * 0.6, 0.6 + rand() * 0.4, 1 + rand() * 0.6);
  m.rotation.y = rand() * Math.PI;
  m.position.y = 0.2;
  return m;
}

function makeFountain() {
  const g = new THREE.Group();
  const basin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.6, 32), toon('#f3e9ff')));
  basin.position.y = 0.3;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 0.1, 32), toon('#8fd3ff'));
  water.position.y = 0.58;
  const pillar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.4, 16), toon('#f3e9ff')));
  pillar.position.y = 1.1;
  const top = shadowed(new THREE.Mesh(ball, toon('#ffc6ff')));
  top.scale.set(0.7, 0.35, 0.7);
  top.position.y = 1.85;
  const spout = new THREE.Mesh(ball, toon('#bfe9ff', { transparent: true, opacity: 0.8 }));
  spout.scale.setScalar(0.3);
  spout.position.y = 2.25;
  g.add(basin, water, pillar, top, spout);
  g.userData.spout = spout;
  return g;
}

function makeCloud(rand) {
  const g = new THREE.Group();
  const mat = toon('#ffffff');
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(ball, mat);
    m.position.set(i * 1.4 - n * 0.7, rand() * 0.5, rand() * 0.8);
    m.scale.setScalar(1.1 + rand() * 0.8);
    g.add(m);
  }
  return g;
}

/** 섬, 나무, 꽃, 분수, 구름을 만들고 충돌체 목록을 돌려준다. */
export function createWorld(scene) {
  const rand = mulberry32(20261030);
  const colliders = [];

  scene.background = new THREE.Color('#bfe6ff');
  scene.fog = new THREE.Fog('#bfe6ff', 45, 110);

  scene.add(new THREE.HemisphereLight('#ffffff', '#b5e5a5', 1.4));
  const sun = new THREE.DirectionalLight('#fff3e0', 1.8);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 90 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // 바다 + 섬
  const sea = new THREE.Mesh(new THREE.CircleGeometry(300, 64), toon('#9ad9f5'));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.6;
  scene.add(sea);

  const sand = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS + 2.5, ISLAND_RADIUS + 4, 1, 64), toon('#ffe8b8'));
  sand.position.y = -0.85;
  sand.receiveShadow = true;
  scene.add(sand);

  const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 1, 1, 64), toon('#a8e6a1'));
  grass.position.y = -0.5;
  grass.receiveShadow = true;
  scene.add(grass);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(7, 48), toon('#f8ecd1'));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const fountain = makeFountain();
  scene.add(fountain);
  colliders.push({ x: 0, z: 0, r: 2.2 });

  // 나무와 바위: 광장을 피해 흩뿌린다
  const placed = [];
  const tryPlace = (minR, maxR, gap) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const a = rand() * Math.PI * 2;
      const r = minR + rand() * (maxR - minR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (placed.every((p) => Math.hypot(p.x - x, p.z - z) > gap)) {
        placed.push({ x, z });
        return { x, z };
      }
    }
    return null;
  };

  for (let i = 0; i < 46; i++) {
    const pos = tryPlace(11, ISLAND_RADIUS - 2, 3.2);
    if (!pos) continue;
    const tree = makeTree(rand);
    tree.position.set(pos.x, 0, pos.z);
    scene.add(tree);
    colliders.push({ x: pos.x, z: pos.z, r: 0.6 * tree.scale.x });
  }
  for (let i = 0; i < 14; i++) {
    const pos = tryPlace(9, ISLAND_RADIUS - 2, 2.5);
    if (!pos) continue;
    const rock = makeRock(rand);
    rock.position.x = pos.x;
    rock.position.z = pos.z;
    scene.add(rock);
    colliders.push({ x: pos.x, z: pos.z, r: 0.7 * rock.scale.x });
  }

  // 꽃: 인스턴싱으로 가볍게
  const flowerColors = ['#ff8fab', '#ffd166', '#bdb2ff', '#ffffff', '#ff9e7a'];
  const flowerGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const count = 380;
  const flowers = new THREE.InstancedMesh(flowerGeo, toon('#ffffff'), count);
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 7.5 + rand() * (ISLAND_RADIUS - 8.5);
    m4.makeTranslation(Math.cos(a) * r, 0.12, Math.sin(a) * r);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, c.set(flowerColors[i % flowerColors.length]));
  }
  scene.add(flowers);

  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const cloud = makeCloud(rand);
    cloud.position.set((rand() - 0.5) * 140, 16 + rand() * 8, (rand() - 0.5) * 140);
    cloud.userData.speed = 0.4 + rand() * 0.6;
    scene.add(cloud);
    clouds.push(cloud);
  }

  let t = 0;
  return {
    colliders,
    update(dt) {
      t += dt;
      fountain.userData.spout.position.y = 2.25 + Math.sin(t * 4) * 0.08;
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.speed * dt;
        if (cloud.position.x > 80) cloud.position.x = -80;
      }
    },
  };
}
