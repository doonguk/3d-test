# 🌸 몽글몽글 마을

귀여운 동물 캐릭터로 돌아다니며 채팅하고, 선물을 줍고, 친구와 아이템을 거래하는 웹 3D 마을.
각자 **개인 마당**을 갖고, **상점**에서 산 꾸미기 아이템을 마당에 **자유롭게 배치**할 수 있다.

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
| 🏡 내 마당 › 상점 / 꾸미기 | 아이템 구매 / 마당 편집 |
| (꾸미기 모드) 클릭 · Q/E · Esc | 놓기 · 회전 · 선택 해제/종료 |
| (꾸미기 모드) 놓인 아이템 클릭 | 보관함으로 회수 |

## 마당 꾸미기

- 첫 접속 시 섬 둘레 8개 마당 중 하나를 **영구 배정** (오프라인이어도 꾸민 마당이 남음)
- 상점에서 코인으로 아이템 구매 → 보관함 → 꾸미기 모드에서 위치·회전을 정해 배치
- 서버가 검증: 내 아이템인지, 내 마당 반경 안인지, 배치 개수 상한(40)
- 배치/회수는 접속한 모두에게 실시간 반영, 나중에 들어온 유저도 그대로 봄
- 아이템 12종은 전부 기본 도형으로 만든 오리지널 모델 (`public/js/decor.js`)
- 사내 상점과 붙일 때 바꿀 곳
  - 상품 목록: `server/yards.js`의 `CATALOG` → 사내 상품 테이블
  - 결제: `buyDecor` (지금은 코인 차감) → 사내 상점 구매 API/보유 아이템 조회
  - 새 아이템 모양: `decor.js`의 `BUILDERS`에 함수 추가 (나중엔 glTF 파일로 교체 가능)

## 구조

```
server/
  index.js   Express + Socket.IO: 입장, 이동, 채팅
  db.js      SQLite (users, items, trades)
  trade.js   1:1 거래: 요청 → 수락 → 제안 → 양쪽 준비 → 트랜잭션 체결
  gifts.js   선물상자 스폰/줍기
  yards.js   마당 배정, 상점 카탈로그, 구매·배치·회수
public/
  js/world.js      섬 마을 (고정 시드라 모두 같은 지형)
  js/yards.js      마당(울타리·팻말)과 놓인 아이템 렌더링
  js/decor.js      꾸미기 아이템 3D 모델, 상점 썸네일
  js/shop.js       상점 창, 꾸미기 모드
  js/character.js  고양이·곰·토끼 캐릭터 + 애니메이션
  js/main.js       렌더 루프, 입력, 네트워크, HUD
  js/trade.js      거래 UI
  js/gifts.js      선물상자 렌더/줍기
```

## 테이블

- **users**: `id, name(UNIQUE), animal, color, coins, plot, created_at, last_seen` — 닉네임으로 로그인(비밀번호 없음), 첫 접속 시 코인 100 + 아이템 3개
- **items**: `id, owner_id → users, kind`
- **decor**: `id, owner_id → users, kind, placed, x, z, rot` — 꾸미기 아이템 (마당 중심 기준 좌표)
- **trades**: `a_id, b_id, a_items, b_items, a_coins, b_coins` — 거래 기록

## 한계 (프로토타입)

- 인증 없음: 같은 닉네임을 쓰면 그 계정으로 들어감 (동시 접속만 막음)
- 이동은 클라이언트 권한(서버는 섬 범위만 제한), 충돌은 클라이언트에서 처리
- 마당은 8개 고정: 9번째 유저부터는 마당 없음
- 아이템끼리 겹쳐 놓는 것은 막지 않음
