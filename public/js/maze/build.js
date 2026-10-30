import * as THREE from 'three';
import { CELL, LEVEL_H, cellCenter } from './generate.js';
import { padPositions } from './physics.js';

// 충돌 상자와 레이아웃을 받아 3D 장면을 만든다. 정적인 바닥·벽은 InstancedMesh로 그려 draw call을 줄인다.

const toon = (color, extra) => new THREE.MeshToonMaterial({ color, ...extra });
const LEVEL_COLORS = ['#b8e0c0', '#9ad3b0', '#ffe39f', '#ffc3a0', '#f7a8c4'];
export const KEY_COLORS = { red: '#ff6b81', blue: '#5b9dff' };
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function instanced(list, material, colorOf) {
  const mesh = new THREE.InstancedMesh(unitBox, material, list.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  list.forEach((b, i) => {
    m.compose(
      new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2),
      new THREE.Quaternion(),
      new THREE.Vector3(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ),
    );
    mesh.setMatrixAt(i, m);
    if (colorOf) mesh.setColorAt(i, c.set(colorOf(b)));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeKey(color) {
  const g = new THREE.Group();
  const mat = toon(color, { emissive: color, emissiveIntensity: 0.35 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 24), mat);
  ring.position.y = 0.3;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), mat);
  shaft.position.y = -0.15;
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.06), mat);
  tooth.position.set(0.1, -0.35, 0);
  g.add(ring, shaft, tooth, new THREE.PointLight(color, 3, 5));
  return g;
}

function makeStar() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.17 : 0.4;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 });
  geo.center();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, toon('#ffd166', { emissive: '#ffb703', emissiveIntensity: 0.4 })), new THREE.PointLight('#ffd166', 2.5, 4));
  return g;
}

function makePad() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 24), toon('#5a4e6b'));
  base.position.y = 0.06;
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), toon('#c9c3d6'));
  spring.rotation.x = Math.PI / 2;
  spring.position.y = 0.18;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 24), toon('#ffd166', { emissive: '#ff9e00', emissiveIntensity: 0.5 }));
  top.position.y = 0.28;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 4), toon('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }));
  arrow.position.y = 0.75;
  g.add(base, spring, top, arrow);
  g.userData = { top, arrow };
  return g;
}

function makeSpikes() {
  const g = new THREE.Group();
  // 칸 안쪽 전체를 덮는다: 보이는 범위 = 찔리는 범위
  const plate = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 3.6), toon('#6d5f7a'));
  plate.position.y = 0.03;
  const blades = new THREE.Group();
  const cone = new THREE.ConeGeometry(0.15, 0.6, 6);
  const mat = toon('#e9e4f2');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const s = new THREE.Mesh(cone, mat);
    s.position.set((i - 1.5) * 0.85, 0.3, (j - 1.5) * 0.85);
    s.castShadow = true;
    blades.add(s);
  }
  g.add(plate, blades);
  g.userData.blades = blades;
  return g;
}

function makeFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8), toon('#fffaf2'));
  pole.position.y = 0.9;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.03), toon('#b5adbf'));
  flag.position.set(0.37, 1.55, 0);
  g.add(pole, flag);
  g.userData.flag = flag;
  return g;
}

function makeGoal() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 12, 40), toon('#ffd166', { emissive: '#ffb703', emissiveIntensity: 0.6 }));
  ring.position.y = 1.4;
  const portal = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 32),
    new THREE.MeshBasicMaterial({ color: '#c8b6ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  portal.position.y = 1.4;
  // 안개 속에서도 보이는 빛기둥 (방향 잡기용)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffe8a3', transparent: true, opacity: 0.18, depthWrite: false, fog: false }),
  );
  beam.position.y = 20;
  g.add(ring, portal, beam, new THREE.PointLight('#ffd166', 6, 9));
  g.userData = { ring, portal };
  return g;
}

export function buildMazeScene(scene, maze, boxes) {
  const root = new THREE.Group();
  scene.add(root);
  const floorTop = (c) => maze.cells[c].h * LEVEL_H;
  const at = (c, y = floorTop(c)) => {
    const { x, z } = cellCenter(maze, c);
    return new THREE.Vector3(x, y, z);
  };

  // 정적 지형
  root.add(instanced(boxes.filter((b) => b.kind === 'floor'), toon('#ffffff'), (b) => LEVEL_COLORS[maze.cells[b.cell].h]));
  root.add(instanced(boxes.filter((b) => b.kind === 'wall'), toon('#6fae7a')));
  root.add(instanced(boxes.filter((b) => b.kind === 'step'), toon('#ffffff'), (b) => new THREE.Color(LEVEL_COLORS[maze.cells[b.cell].h]).lerp(new THREE.Color('#ffffff'), 0.4)));

  const abyss = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), toon('#2b2d5e'));
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.y = -5.5;
  root.add(abyss);

  // 문 (열리면 땅으로 꺼진다)
  const doors = boxes
    .filter((b) => b.kind === 'door')
    .map((b) => {
      const mesh = new THREE.Mesh(unitBox, toon(KEY_COLORS[b.color], { emissive: KEY_COLORS[b.color], emissiveIntensity: 0.25 }));
      mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      mesh.scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
      mesh.castShadow = true;
      root.add(mesh);
      return { box: b, mesh, open: false, sink: 0 };
    });

  const platforms = boxes
    .filter((b) => b.kind === 'platform')
    .map((b) => {
      const mesh = new THREE.Mesh(unitBox, toon('#bdb2ff'));
      mesh.scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      return { box: b, mesh };
    });

  const place = (obj, pos) => {
    obj.position.copy(pos);
    root.add(obj);
    return obj;
  };
  const pads = padPositions(maze).map((pad) => ({ ...pad, mesh: place(makePad(), new THREE.Vector3(pad.x, pad.y, pad.z)), squash: 0 }));
  const spikes = maze.spikes.map((s) => ({ ...s, mesh: place(makeSpikes(), at(s.cell)) }));
  const keys = maze.keys.map((k) => ({ ...k, mesh: place(makeKey(KEY_COLORS[k.color]), at(k.cell).setY(floorTop(k.cell) + 1)), taken: false }));
  const stars = maze.stars.map((cell) => ({ cell, mesh: place(makeStar(), at(cell).setY(floorTop(cell) + 1)), taken: false }));
  const checkpoints = maze.checkpoints.map((cell) => ({ cell, mesh: place(makeFlag(), at(cell).add(new THREE.Vector3(1.2, 0, 1.2))), active: false }));
  const goal = { cell: maze.goal, mesh: place(makeGoal(), at(maze.goal)) };

  return { root, doors, platforms, pads, spikes, keys, stars, checkpoints, goal, at, floorTop };
}

export { CELL };
