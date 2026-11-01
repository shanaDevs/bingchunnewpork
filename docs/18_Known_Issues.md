# 18 — Known Issues

Curated from code inspection. Severity is qualitative.

---

## 1. Bugs / likely defects

| Issue | Detail |
|-------|--------|
| Customer help ticket delay | `_submitTicket` uses `Future.delayed` with **1500 seconds** (likely meant milliseconds) — spinner appears stuck |
| Customer API default | Hardcoded `192.168.1.62` bypasses production constant — release APK without dart-define hits LAN |
| Driver README vs code | README shows email/password demo; app requires PIN |
| iOS push | No `GoogleService-Info.plist` / `firebase_options.dart` — FCM incomplete on iOS |
| Shared iOS bundle ID note | Customer README mentions same bundle id pattern as driver — collision risk if both distributed |

---

## 2. Limitations

| Limitation | Notes |
|------------|-------|
| SMS / Email production | Mock only; Dialog/SendGrid throw if selected |
| Web phone login | No OTP required (interim) |
| Guest checkout PII | Orders store guest phone/email without account |
| Socket on customer mobile | Polling only |
| Driver tokens | No refresh-token rotation flow |
| Single-node sockets | No Redis adapter for horizontal scale |
| Reporting load | Brand reports may be heavy on large datasets |

---

## 3. Missing features

| Feature | Status |
|---------|--------|
| Password reset API | Not Implemented |
| Admin MFA login | Removed (not an open gap) |
| Frontend unit tests | Not Implemented |
| CI test stage | Not Implemented |
| NGINX/PM2 in repo | Not Implemented |
| Repository layer | Not Implemented |
| Real referral backend | Not Implemented |
| Real helpdesk ticket API | Not Implemented |
| Card tokenization / saved cards backend | Not Implemented |

---

## 4. Incomplete modules

| Module | Partial state |
|--------|---------------|
| POS | Route exists; sidebar hidden |
| Prisma migrations | SQL patches + push + ensure*, not full Migrate |
| env.example | Missing many vars used in `config` |
| Root README | Customer Flutter under-documented |
| Frontend README | create-next-app stub |

---

## 5. Technical debt

- Hardcoded CORS/socket IPs
- Duplicated admin fetch logic
- Runtime schema mutation in application boot
- Dead Flutter routes and mock parallel paths
- Thin automated test coverage outside auth/pricing
- CapRover CI path casing (`Frontend`)
- Customer mobile collects card form fields without vault (compliance risk if misused)

---

## Related

- [17_Code_Quality_Report.md](17_Code_Quality_Report.md)
- [15_Security_Documentation.md](15_Security_Documentation.md)
