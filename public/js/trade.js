import { socket, state, toast, getMe, findPlayer, pickPlayerAt } from './main.js';

const $ = (sel) => document.querySelector(sel);

const slot = (it, tag = 'div') => {
  const el = document.createElement(tag);
  el.className = 'slot';
  el.title = it.name;
  el.textContent = it.emoji;
  el.dataset.id = it.id;
  return el;
};

// ---------- 거래 요청 보내기 ----------
let menuTarget = null;
const menu = $('#player-menu');

function requestTrade(sid) {
  menu.hidden = true;
  socket.emit('trade:request', { to: sid });
}

document.addEventListener('world-click', ({ detail: { x, y } }) => {
  if (state.mode !== 'play') return;
  const sid = getMe() && pickPlayerAt(x, y);
  if (!sid) return void (menu.hidden = true);
  menuTarget = sid;
  $('#player-menu-name').textContent = findPlayer(sid)?.name ?? '';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;
});
$('#player-menu-trade').addEventListener('click', () => requestTrade(menuTarget));
$('#online-list').addEventListener('click', (e) => {
  const li = e.target.closest('li.other');
  if (li) requestTrade(li.dataset.sid);
});

socket.on('trade:sent', ({ name }) => toast(`${name} 님에게 거래를 요청했어요 💌`));
socket.on('trade:error', (msg) => toast(msg));

// ---------- 거래 요청 받기 ----------
socket.on('trade:incoming', ({ from, name }) => {
  $(`#requests [data-from="${CSS.escape(from)}"]`)?.remove();
  const card = document.createElement('div');
  card.className = 'request';
  card.dataset.from = from;
  card.innerHTML = `<span>💌 <b></b> 님이 거래하고 싶대요</span>
    <button class="primary small" data-accept="1">수락</button>
    <button class="ghost small" data-accept="0">거절</button>`;
  card.querySelector('b').textContent = name;
  card.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    socket.emit('trade:respond', { from, accept: b.dataset.accept === '1' });
    card.remove();
  });
  $('#requests').appendChild(card);
  setTimeout(() => card.remove(), 20000);
});

// ---------- 거래 창 ----------
let partner = null;
let picked = new Set();
let latest = null;

function sendOffer() {
  socket.emit('trade:offer', { items: [...picked], coins: Number($('#trade-coins').value) || 0 });
}

function render() {
  if (!partner || !latest) return;
  const mine = latest.offers[getMe().sid];
  const theirs = latest.offers[partner.sid];
  $('#trade-my-offer').replaceChildren(...mine.items.map((it) => slot(it)));
  $('#trade-their-offer').replaceChildren(...theirs.items.map((it) => slot(it)));
  $('#trade-their-coins').textContent = theirs.coins;
  if (document.activeElement !== $('#trade-coins')) $('#trade-coins').value = mine.coins;
  $('#trade-my-ready').hidden = !latest.ready[getMe().sid];
  $('#trade-their-ready').hidden = !latest.ready[partner.sid];
  $('#trade-ready').disabled = latest.ready[getMe().sid];
  $('#trade-ready').textContent = latest.ready[getMe().sid] ? '상대를 기다리는 중…' : '준비 완료';

  $('#trade-inventory').replaceChildren(
    ...state.inventory.items.map((it) => {
      const el = slot(it, 'button');
      el.classList.toggle('picked', picked.has(it.id));
      return el;
    }),
  );
}

function closeTrade(message) {
  partner = null;
  latest = null;
  $('#trade').hidden = true;
  if (message) toast(message);
}

socket.on('trade:open', ({ partner: p }) => {
  partner = p;
  picked = new Set();
  latest = null;
  $('#trade-partner').textContent = p.name;
  $('#trade-coins').value = 0;
  $('#trade-coins').max = state.inventory.coins;
  $('#trade').hidden = false;
});
socket.on('trade:update', (s) => {
  latest = s;
  // 서버가 인정한 제안 기준으로 선택 상태를 맞춘다
  picked = new Set(s.offers[getMe().sid].items.map((it) => it.id));
  render();
});
socket.on('trade:done', () => closeTrade('거래 완료! 가방을 확인해 보세요 🎉'));
socket.on('trade:closed', ({ reason }) => closeTrade(reason));
document.addEventListener('inventory', render);

$('#trade-inventory').addEventListener('click', (e) => {
  const b = e.target.closest('button.slot');
  if (!b) return;
  const id = Number(b.dataset.id);
  picked.has(id) ? picked.delete(id) : picked.add(id);
  b.classList.toggle('picked');
  sendOffer();
});

let coinTimer = 0;
$('#trade-coins').addEventListener('input', () => {
  clearTimeout(coinTimer);
  coinTimer = setTimeout(sendOffer, 250);
});
$('#trade-coins').addEventListener('keydown', (e) => e.stopPropagation());
$('#trade-ready').addEventListener('click', () => socket.emit('trade:ready'));
$('#trade-cancel').addEventListener('click', () => {
  socket.emit('trade:cancel');
  closeTrade();
});
