# 🌸 몽글몽글 마을

귀여운 동물 캐릭터로 돌아다니며 채팅하고, 선물을 줍고, 친구와 아이템을 거래하는 웹 3D 마을.

## 실행

```bash
npm install
npm start        # http://localhost:3000
npm test         # 입장·채팅·거래·선물 스모크 테스트
```

Node 22.13+ 필요 (내장 `node:sqlite` 사용). 브라우저 탭 두 개로 접속하면 서로 보입니다.

## 조작

| 키 | 동작 |
| --- | --- |
| WASD / 방향키 | 이동 |
| Space | 점프 |
| 마우스 드래그 / 휠 | 시점 회전 / 줌 |
| Enter | 채팅 |
| 캐릭터 클릭 · 접속자 목록 클릭 | 거래 요청 |

## 구조

```
server/
  index.js   Express + Socket.IO: 입장, 이동, 채팅
  db.js      SQLite (users, items, trades)
  trade.js   1:1 거래: 요청 → 수락 → 제안 → 양쪽 준비 → 트랜잭션 체결
  gifts.js   선물상자 스폰/줍기
public/
  js/world.js      섬 마을 (고정 시드라 모두 같은 지형)
  js/character.js  고양이·곰·토끼 캐릭터 + 애니메이션
  js/main.js       렌더 루프, 입력, 네트워크, HUD
  js/trade.js      거래 UI
  js/gifts.js      선물상자 렌더/줍기
```

## 테이블

- **users**: `id, name(UNIQUE), animal, color, coins, created_at, last_seen` — 닉네임으로 로그인(비밀번호 없음), 첫 접속 시 코인 100 + 아이템 3개
- **items**: `id, owner_id → users, kind`
- **trades**: `a_id, b_id, a_items, b_items, a_coins, b_coins` — 거래 기록

## 한계 (프로토타입)

- 인증 없음: 같은 닉네임을 쓰면 그 계정으로 들어감 (동시 접속만 막음)
- 이동은 클라이언트 권한(서버는 섬 범위만 제한), 충돌은 클라이언트에서 처리
