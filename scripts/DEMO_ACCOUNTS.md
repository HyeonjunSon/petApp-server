# PetDate demo accounts (10 virtual users)

Created by `node scripts/seed-demo.js`. **Same password for everyone.**

**Password: `Petdate123!`**

| # | Email | Owner | Pet | Area |
|---|-------|-------|-----|------|
| 1 | demo1@petdate.app | 김서준 | 초코 (포메라니안) | 서울 마포구 |
| 2 | demo2@petdate.app | 이지우 | 몽이 (말티즈) | 서울 강남구 |
| 3 | demo3@petdate.app | 박민준 | 맥스 (골든리트리버) | 서울 성동구 |
| 4 | demo4@petdate.app | 최수아 | 두부 (비숑프리제) | 서울 송파구 |
| 5 | demo5@petdate.app | 정하늘 | 하루 (시바견) | 서울 은평구 |
| 6 | demo6@petdate.app | 강예은 | 보리 (웰시코기) | 서울 서초구 |
| 7 | demo7@petdate.app | 윤도현 | 콩이 (비글) | 서울 용산구 |
| 8 | demo8@petdate.app | 임채원 | 루나 (포메라니안) | 서울 종로구 |
| 9 | demo9@petdate.app | 한지호 | 뭉치 (진돗개) | 서울 광진구 |
| 10 | demo10@petdate.app | 오서연 | 코코 (시츄) | 서울 동작구 |

## Recommended login: **demo1@petdate.app**
demo1 has relationship data so every screen shows content:
- **디스커버**: 나머지 9명이 카드로 노출
- **매치**: 몽이(demo2) · 맥스(demo3) · 두부(demo4)와 매치
- **채팅**: 몽이네(demo2)와 한국어 대화 + 산책 약속 카드
- **산책 약속**: demo2와 확정 1건, demo3에 제안 1건
- **산책 기록**: 초코의 산책 3건

> 사진: 보호자 얼굴은 randomuser.me, 펫은 **품종이 일치하는 고정 URL** —
> dog.ceo 정적 CDN + Wikimedia Commons(진돗개, dog.ceo에 없음).
> 랜덤 엔드포인트를 쓰지 않으므로 재시드해도 항상 같은 사진이 나온다.
> 이미지 로드 실패 시 앱이 자동으로 플레이스홀더를 보여준다.
