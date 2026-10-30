import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const ball = new THREE.SphereGeometry(1, 24, 16);
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra });
const DARK = toon('#3a2e39');
const WHITE = toon('#ffffff');
const BLUSH = toon('#ff8fab', { transparent: true, opacity: 0.75 });
const INNER_EAR = toon('#ffc2d4');

function blob(mat, [sx, sy, sz], [x, y, z]) {
  const m = new THREE.Mesh(ball, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function addEars(head, animal, main) {
  if (animal === 'cat') {
    const cone = new THREE.ConeGeometry(0.2, 0.38, 4);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(cone, main);
      ear.position.set(0.32 * s, 0.48, 0);
      ear.rotation.set(0, Math.PI / 4, -0.35 * s);
      ear.castShadow = true;
      head.add(ear);
    }
  } else if (animal === 'bear') {
    for (const s of [-1, 1]) {
      head.add(blob(main, [0.18, 0.18, 0.1], [0.4 * s, 0.4, 0]));
      head.add(blob(INNER_EAR, [0.1, 0.1, 0.05], [0.4 * s, 0.4, 0.07]));
    }
  } else {
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(0.2 * s, 0.45, 0);
      ear.rotation.z = -0.15 * s;
      ear.add(blob(main, [0.12, 0.4, 0.09], [0, 0.32, 0]));
      ear.add(blob(INNER_EAR, [0.06, 0.3, 0.05], [0, 0.32, 0.06]));
      head.add(ear);
    }
  }
}

/** 둥글둥글한 동물 캐릭터. root는 씬에 넣고, update(dt, moving)으로 애니메이션한다. */
export function createCharacter({ name, animal, color, isMe = false }) {
  const main = toon(color);
  const light = toon(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.6));

  const root = new THREE.Group();
  const body = new THREE.Group(); // 통통 튀는 부분
  root.add(body);

  body.add(blob(main, [0.5, 0.48, 0.46], [0, 0.62, 0]));
  body.add(blob(light, [0.34, 0.32, 0.2], [0, 0.56, 0.32]));

  const arms = [-1, 1].map((s) => {
    const arm = blob(main, [0.13, 0.2, 0.13], [0.48 * s, 0.68, 0.05]);
    body.add(arm);
    return arm;
  });

  const tail =
    animal === 'bunny'
      ? blob(WHITE, [0.17, 0.17, 0.17], [0, 0.45, -0.46])
      : animal === 'cat'
        ? blob(main, [0.08, 0.32, 0.08], [0, 0.6, -0.5])
        : blob(main, [0.11, 0.11, 0.11], [0, 0.45, -0.45]);
  if (animal === 'cat') tail.rotation.x = -0.6;
  body.add(tail);

  const head = new THREE.Group();
  head.position.y = 1.38;
  body.add(head);
  head.add(blob(main, [0.62, 0.54, 0.56], [0, 0, 0]));
  head.add(blob(light, [0.25, 0.17, 0.14], [0, -0.14, 0.47]));
  head.add(blob(DARK, [0.06, 0.045, 0.04], [0, -0.07, 0.6]));
  for (const s of [-1, 1]) {
    head.add(blob(DARK, [0.07, 0.09, 0.05], [0.22 * s, 0.04, 0.49]));
    head.add(blob(WHITE, [0.025, 0.025, 0.02], [0.24 * s, 0.08, 0.535]));
    head.add(blob(BLUSH, [0.1, 0.055, 0.04], [0.37 * s, -0.11, 0.42]));
  }
  addEars(head, animal, main);

  const feet = [-1, 1].map((s) => {
    const foot = blob(main, [0.16, 0.1, 0.2], [0.2 * s, 0.1, 0.04]);
    root.add(foot);
    return foot;
  });

  // 이름표와 말풍선
  const tagEl = document.createElement('div');
  tagEl.className = isMe ? 'nametag me' : 'nametag';
  tagEl.textContent = name;
  const tag = new CSS2DObject(tagEl);
  tag.position.set(0, 2.25, 0);
  root.add(tag);

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';
  const bubble = new CSS2DObject(bubbleEl);
  bubble.position.set(0, 2.75, 0);
  root.add(bubble);

  // 클릭 판정용: 모든 메시가 이 캐릭터를 가리키게
  root.traverse((o) => (o.userData.character = root));

  let walk = 0;
  let idle = Math.random() * 10;
  let bubbleTimer = 0;
  let jumpV = 0;
  let jumpY = 0;

  return {
    root,
    say(text) {
      bubbleEl.textContent = text;
      bubbleEl.classList.add('show');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), 5000);
    },
    jump() {
      if (jumpY === 0) jumpV = 6;
    },
    update(dt, moving) {
      idle += dt;
      if (jumpV !== 0 || jumpY > 0) {
        jumpV -= 20 * dt;
        jumpY = Math.max(0, jumpY + jumpV * dt);
        if (jumpY === 0) jumpV = 0;
      }
      walk = moving ? walk + dt * 12 : walk * 0.85;
      const swing = Math.sin(walk);
      const hop = moving ? Math.abs(Math.sin(walk)) * 0.12 : Math.sin(idle * 2) * 0.02;
      body.position.y = hop + jumpY;
      body.scale.set(1, 1 + (moving ? 0 : Math.sin(idle * 2) * 0.015), 1);
      feet[0].position.z = 0.04 + swing * 0.18;
      feet[1].position.z = 0.04 - swing * 0.18;
      feet[0].position.y = feet[1].position.y = 0.1 + jumpY;
      arms[0].rotation.x = swing * 0.6;
      arms[1].rotation.x = -swing * 0.6;
      head.rotation.z = moving ? swing * 0.05 : Math.sin(idle * 1.3) * 0.06;
      tail.rotation.y = Math.sin(idle * 3) * 0.4;
    },
  };
}
