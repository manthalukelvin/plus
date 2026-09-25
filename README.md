# myjournal+ Growth & User Acquisition Specialist Portal

Pure HTML / CSS / JS. Responsive, professional glass UI.

## Commission model

- **$2** for every **50 qualified users retained for 7 days**
- **$5** for every **15 verified Premium customers**

## Pages

| File | Who |
|------|-----|
| `index.html` | Login |
| `specialist.html` | Growth & User Acquisition Specialist |
| `admin.html` | Admin |

## Auto-tracking signups

On your main app signup page, after creating the user:

```html
<script src="path/to/referral-signup-helper.js"></script>
<script>
  // after createUserWithEmailAndPassword success:
  await trackReferralSignup(user.uid, user.email);
</script>
```

When they become premium / qualified:

```js
await markReferralPremium(userId);
await markReferralQualified(userId);
```

Referrals then appear live on specialist + admin dashboards.

## Specialist features

- Live signup / retained / premium counts
- Progress bars to next $2 and $5 thresholds
- 7-day growth chart
- Referral pipeline with filters
- Acquisition link + performance
- Consult admin about thresholds / payouts
- Resources & profile

## Admin features

- Overview KPIs
- Manage specialists (code, name, suspend, notes)
- Live referral pipeline (qualify / set premium)
- Threshold progress for every specialist
- Sync / confirm retention & premium payouts
- Approve → pay commissions
- Consultations inbox
- Fraud scan
- Promote users → Growth Specialist

## Setup

1. Put Firebase config in `js/firebase-config.js`
2. Deploy `firestore.rules`
3. Promote a user: set `users/{uid}.role = "admin"` in Firestore
4. From Admin → Promote users → Make Growth Specialist

No Cloud Functions · No custom claims.
