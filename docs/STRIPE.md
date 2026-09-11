# Stripe 연동 (구독 결제)

결제는 **두 모드**로 동작하며 데이터 레이어는 동일합니다.

| 모드 | 조건 | 동작 |
|---|---|---|
| **Demo** | `STRIPE_SECRET_KEY` 없음 (기본) | `checkout`이 구독을 즉시 활성화. 키 없이 전체 플로우 시연 가능 |
| **Stripe** | `STRIPE_SECRET_KEY` 설정 | Checkout Session으로 리다이렉트 → **웹훅**이 구독/권한 동기화 |

두 모드 모두 `services/subscriptions.js`의 `syncSubscription()` 하나만 호출합니다.
즉 결제 수단이 바뀌어도 **권한 규칙은 한 곳**입니다.

```
checkout ─┬─ (demo)   syncSubscription(active)
          └─ (stripe) Checkout Session → 결제 → webhook ─→ syncSubscription(event.status)
                                                              │
                                            Entitlement(unlimited_swipes, see_likes)
                                                              │
                                        requireEntitlement → 402 → 프론트 페이월
```

## 테스트 모드 설정 (5분, 카드·사업자 인증 불필요)

1. **가입/로그인** — https://dashboard.stripe.com/register
   우측 상단 **Test mode** 토글이 켜져 있는지 확인합니다.

2. **시크릿 키 복사** — [API keys](https://dashboard.stripe.com/test/apikeys) →
   *Secret key* (`sk_test_...`)

3. **웹훅 등록** — [Webhooks](https://dashboard.stripe.com/test/webhooks) → **Add endpoint**
   - URL: `https://<your-api-host>/api/billing/webhook`
   - 이벤트 선택:
     `checkout.session.completed`,
     `customer.subscription.created`,
     `customer.subscription.updated`,
     `customer.subscription.deleted`,
     `invoice.payment_failed`
   - 등록 후 **Signing secret** (`whsec_...`) 복사

4. **환경변수 설정**

   ```bash
   heroku config:set \
     STRIPE_SECRET_KEY=sk_test_xxx \
     STRIPE_WEBHOOK_SECRET=whsec_xxx \
     APP_URL=https://pet-app-frontend-fawn.vercel.app \
     -a petwebapp
   ```

   로컬은 `.env`에 같은 값을 넣고, 웹훅은 Stripe CLI로 포워딩합니다:

   ```bash
   stripe listen --forward-to localhost:5050/api/billing/webhook
   ```

5. **결제 테스트** — 앱에서 *Start Premium* → Stripe Checkout에서 테스트 카드 입력
   - 성공: `4242 4242 4242 4242` / 미래 만료일 / CVC 아무 3자리
   - 인증 필요(3DS): `4000 0025 0000 3155`
   - 거절: `4000 0000 0000 9995`

   결제 후 `/subscription`으로 돌아오면 웹훅이 도착하는 동안 몇 초간 재조회하고
   Premium이 활성화됩니다.

> 상품을 대시보드에 미리 만들 필요는 없습니다. `Plan`에 `stripePriceId`가 없으면
> Checkout Session을 만들 때 `price_data`로 즉석 생성합니다.
> 고정 Price를 쓰고 싶으면 `Plan.stripePriceId`에 `price_...`를 넣으면 그쪽이 우선합니다.

## 설계 노트 (면접용 요약)

- **원본 바이트 보존**: 서명 검증에는 파싱 전 body가 필요합니다. `server.js`에서
  `express.json()` **이전에** `/api/billing/webhook`만 `express.raw`로 마운트합니다.
  (이 순서가 틀리면 서명이 항상 실패합니다 — 흔한 함정)
- **멱등성**: `WebhookLog.stripeEventId` 유니크 인덱스. 재전송은 `{duplicate:true}`로 1회만 처리.
- **실패 시맨틱**: 서명 불일치 → `400`(재시도), 핸들러 예외 → `500`(백오프 재시도) +
  `WebhookLog.error`에 기록, 관심 없는 이벤트 → `200` ack.
- **유저 매핑**: Checkout 생성 시 `metadata.userId`를 세션과 구독 양쪽에 심어,
  웹훅에서 Stripe 고객 ↔ 우리 유저를 복원합니다.
- **해지**: 즉시 박탈이 아니라 `cancel_at_period_end` + 권한 `expiresAt`을 기간 만료일로 설정.
- **PCI**: 카드 정보는 서버가 보지 않습니다. 입력은 Stripe Checkout, 카드 변경은 고객 포털
  (`POST /api/billing/portal`)에서 처리합니다.

## 테스트

```bash
npm test   # tests/stripe-webhook.test.js — 서명 검증 / 멱등성 / 권한 부여·회수 (네트워크 불필요)
```

Stripe SDK의 `webhooks.generateTestHeaderString()`으로 서명을 만들어
실제 네트워크 없이 웹훅 경로 전체를 검증합니다.
