# PetDate demo accounts (10 virtual users)

Created by `node scripts/seed-demo.js`. **Same password for everyone.**

**Password: `Petdate123!`**

| # | Email | Owner | Pet | Area |
|---|-------|-------|-----|------|
| 1 | demo1@petdate.app | Seojun Kim | Choco (Pomeranian) | Seoul · Mapo |
| 2 | demo2@petdate.app | Jiwoo Lee | Mong (Maltese) | Seoul · Gangnam |
| 3 | demo3@petdate.app | Minjun Park | Max (Golden Retriever) | Seoul · Seongdong |
| 4 | demo4@petdate.app | Sua Choi | Dubu (Bichon Frise) | Seoul · Songpa |
| 5 | demo5@petdate.app | Haneul Jung | Haru (Shiba Inu) | Seoul · Eunpyeong |
| 6 | demo6@petdate.app | Yeeun Kang | Bori (Welsh Corgi) | Seoul · Seocho |
| 7 | demo7@petdate.app | Dohyun Yoon | Kong (Beagle) | Seoul · Yongsan |
| 8 | demo8@petdate.app | Chaewon Lim | Luna (Pomeranian) | Seoul · Jongno |
| 9 | demo9@petdate.app | Jiho Han | Mungchi (Jindo) | Seoul · Gwangjin |
| 10 | demo10@petdate.app | Seoyeon Oh | Coco (Shih Tzu) | Seoul · Dongjak |

## Recommended login: **demo1@petdate.app**
demo1 has relationship data so every screen shows content:
- **Discover**: the other 9 users appear as cards
- **Matches**: matched with Mong (demo2), Max (demo3), Dubu (demo4)
- **Chat**: English conversation with Mong (demo2) + a walk-plan card
- **Walk plans**: confirmed with demo2, proposed to demo3
- **Walk records**: 3 walks for Choco

> Photos: owner faces from randomuser.me; pets use **breed-matched pinned URLs** —
> dog.ceo static CDN + Wikimedia Commons (Jindo, which dog.ceo lacks).
> No random endpoints, so reseeding always yields the same photos.
> If an image fails to load, the app falls back to a placeholder automatically.
