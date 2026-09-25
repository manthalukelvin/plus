# MyJournal+ — Premium Payments, PayChangu, PayPal & AI Setup Guide

## 1. Architecture Overview

```
User
 ↓
Frontend (HTML/JS + Firebase Auth)
 ↓
PHP Backend (/api/...)
 ├── Authentication (Firebase ID token verification)
 ├── Premium Access Control (Firestore isPremium + plan + expiry)
 ├── PayChangu (create → redirect → verify / webhook)
 ├── PayPal (create order → capture)
 └── Gemini AI (proxy, free-limit enforced server-side)
 ↓
Firestore (users, payments, aiChats, entries, moods)
```

## 2. Files Added / Modified

### New backend files
- `api/lib.php` — shared auth, Firestore helpers, premium status helper
- `api/config.sample.php` — configuration template
- `api/payments/create-paychangu.php`
- `api/payments/verify-paychangu.php`
- `api/payments/webhook-paychangu.php`
- `api/payments/paypal-create-order.php`
- `api/payments/paypal-capture.php`
- `api/payments/status.php`
- `api/.htaccess` — updated routes
- `.env.example`
- `SETUP_PAYMENTS_AND_AI.md` (this file)

### Modified
- `api/ai-chat.php` — free AI uses raised to **2**, better limit response
- `confirm.html` — new pricing ($2.49 / $20 / $49.99)
- `main.js` — price text + backend URL constants
- `settings.html` — price text
- `ai-insights.js` — points to `/api/ai-chat`, removes hardcoded Gemini key, better free-limit messaging
- `styles.css` — circular MJ logo (`border-radius: 50%`)

## 3. Environment / Config

1. Copy `api/config.sample.php` → `api/config.php`
2. Fill in real values (never commit `config.php`)

Required keys:

| Variable | Where to get it |
|----------|-----------------|
| GEMINI_API_KEY | Google AI Studio → https://aistudio.google.com/app/apikey |
| GEMINI_MODEL | e.g. `gemini-2.0-flash` or current recommended model |
| PAYCHANGU_SECRET_KEY | PayChangu dashboard → API keys |
| PAYCHANGU_PUBLIC_KEY | same |
| PAYPAL_CLIENT_ID / SECRET | https://developer.paypal.com → Apps & Credentials |
| PAYPAL_ENVIRONMENT | `sandbox` then `live` |
| APP_BASE_URL | your production domain (e.g. https://myjournalplus.com) |

Also update MWK prices in `PREMIUM_PRICES_MWK` to match current exchange rate.

## 4. PayChangu Setup

1. Create a merchant account at https://paychangu.com
2. Get Public + Secret keys from the dashboard
3. Put them in `api/config.php`
4. **Webhook URL** to configure in PayChangu dashboard:
   ```
   https://YOUR_DOMAIN/api/payments/webhook-paychangu
   ```
5. **Return / Callback URLs** used by the create endpoint:
   - Return: `https://YOUR_DOMAIN/confirm.html?status=success&tx=...`
   - Cancel: `https://YOUR_DOMAIN/confirm.html?status=cancelled`

Frontend flow:
1. User selects plan on confirm page
2. Frontend calls `POST /api/payments/create-paychangu` with Bearer token + `{plan}`
3. Backend returns `checkoutUrl`
4. Redirect user to PayChangu checkout
5. On return, call `POST /api/payments/verify-paychangu` with `{txRef}`
6. Backend verifies with PayChangu and sets `isPremium`, `premiumPlan`, `premiumExpiresAt` on the user document

## 5. PayPal Setup

1. Create app at https://developer.paypal.com
2. Copy Client ID + Secret (Sandbox first)
3. Put in config with `PAYPAL_ENVIRONMENT=sandbox`
4. For production change to `live` and use Live credentials
5. Optional webhook:
   ```
   https://YOUR_DOMAIN/api/payments/paypal-webhook   (you can extend later)
   ```

Frontend flow (recommended with PayPal JS SDK):
1. Call `POST /api/payments/paypal-create-order` → get `orderId`
2. Use PayPal Buttons with that orderId
3. On approve → call `POST /api/payments/paypal-capture` with `{orderId}`
4. Backend captures and activates premium

## 6. Gemini Setup

1. Go to https://aistudio.google.com/app/apikey
2. Create API key
3. Put in `GEMINI_API_KEY`
4. Set `GEMINI_MODEL` to a currently supported model (e.g. `gemini-2.0-flash`)

Free users get **2** AI uses total (server-side via `aiFreeUsedCount` on the user document).
Premium users have unlimited (subject to Gemini rate limits).

## 7. Deploy Checklist

1. Upload all files to your hosting (public_html or equivalent)
2. Ensure `api/config.php` exists and is **not** publicly downloadable (deny in .htaccess if needed)
3. PHP curl + json extensions enabled
4. HTTPS required for payments and Firebase
5. Test with sandbox credentials first
6. Switch PayPal to `live` and PayChangu to production keys when ready

## 8. Testing Checklist

### Auth
- [ ] Sign up / sign in / sign out
- [ ] Authenticated API calls return 401 without token

### AI
- [ ] First free AI use succeeds, remaining = 1
- [ ] Second free AI use succeeds, remaining = 0
- [ ] Third attempt returns 402 FREE_LIMIT_REACHED + upgrade message
- [ ] Premium user can use AI without limit
- [ ] Direct call without token → 401

### Payments (sandbox)
- [ ] Create monthly / yearly / lifetime PayChangu payment
- [ ] Successful verify activates correct plan + expiry
- [ ] Cancelled payment does not activate
- [ ] PayPal create → capture → premium activated
- [ ] Duplicate verify does not break state

### UI
- [ ] Prices show $2.49 / $20 / $49.99
- [ ] MJ logo is circular on desktop + mobile
- [ ] Existing journal, mood, dashboard still work

## 9. Remaining Manual Steps (YOU must do)

1. Create `api/config.php` from the sample and insert real keys
2. Configure webhook URLs in PayChangu dashboard
3. Create PayPal app and insert credentials
4. Obtain Gemini API key
5. Adjust MWK amounts in config to current rates
6. Test end-to-end in sandbox before going live
7. (Recommended) Add a Firebase service-account for true server-side webhook activation without user token

## 10. Security Notes

- Secret keys live only in `api/config.php` (server)
- Frontend never sees PayChangu/PayPal/Gemini secrets
- AI limit and premium status enforced in PHP
- Firebase ID tokens verified on every protected endpoint
- Webhook duplicate protection via processed-event keys
