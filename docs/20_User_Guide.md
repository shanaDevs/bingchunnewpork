# 20 — User Guide

End-user manual for **customers** using the Bing Chun web storefront and (where noted) the Flutter customer app.

![Screenshot: Home page](../assets/docs/placeholders/user-home.png)

---

## 1. Getting started (web)

1. Open the site (local: `http://localhost:3000`).
2. Choose **Delivery** or **Takeaway** when prompted.
3. Browse the menu and add drinks to the cart.
4. Checkout as guest or after signing in.

---

## 2. Account

### Register

1. Go to **Account → Register** (`/account/register`).
2. Enter name, phone, optional email, password (min 8).
3. Submit — you are signed in with a token.

### Login

1. Go to `/account/login`.
2. Enter a valid Sri Lankan mobile (e.g. `0771234567`).
3. Optional: Google / Facebook if configured by the operator.

**Note:** Web phone login currently does **not** require OTP (interim behaviour).

### Profile

- `/account` — view profile, delete account
- `/account/orders` — history and reorder
- `/account/addresses` — saved addresses with map selection
- `/account/loyalty` — points balance, earn/redeem settings, recent loyalty transactions
- `/account/notifications` — email / SMS / push preference toggles

![Screenshot: Login](../assets/docs/placeholders/user-login.png)

---

## 3. Browse menu

1. Open `/menu`.
2. Filter by category.
3. Open a product — choose size (Regular/Large), toppings, quantity.
4. Add to cart (availability depends on store / delivery flags).

![Screenshot: Menu](../assets/docs/placeholders/user-menu.png)

---

## 4. Cart and checkout

1. Open `/cart` — adjust quantities.
2. Proceed to `/checkout`.
3. Confirm contact details (guest fields if not logged in).
4. For delivery: set address on map; system validates delivery zone.
5. Apply promo code if available.
6. Choose payment: PayHere / cash on delivery / cash at counter / loyalty (as enabled).
7. Place order.

![Screenshot: Checkout](../assets/docs/placeholders/user-checkout.png)

---

## 5. Payment

- **PayHere:** Redirect/checkout page; complete payment on PayHere (or mock page in non-configured environments).
- **Cash:** Pay on delivery or at counter; branch may mark collected later.

---

## 6. Track order

- After placing, open `/order/[id]` or `/track/[id]`.
- Watch status progress; takeaway may show QR and pickup time.
- Live updates on web use Socket.io when connected.

![Screenshot: Order tracking](../assets/docs/placeholders/user-track.png)

---

## 7. Ratings

When delivered/completed, submit platform rating and (for delivery) rider rating if prompted.

---

## 8. Promotions and stores

- `/promotions` — active promo list
- `/stores` — find branches

---

## 9. Flutter customer app (summary)

| Feature | Behaviour |
|---------|-----------|
| Splash → shell tabs | Home, Menu, Orders, Cart, Profile |
| Auth | Phone/OTP/password/register with refresh tokens |
| Fulfillment setup | Delivery or takeaway |
| Checkout | Cash methods + PayHere WebView |
| Tracking | Polling (not sockets) |
| Addresses | Implemented in app screens |
| Referral / Help / Saved cards / many Settings toggles | Stub or local-only — see Known Issues |

Build with production API:

```bash
flutter run --dart-define=API_BASE_URL=https://<your-api>/api
```

---

## 10. Troubleshooting

| Problem | What to try |
|---------|-------------|
| Cannot deliver to address | Outside zone or branch delivery disabled |
| Payment stuck pending | Complete PayHere or ask branch to confirm |
| Login fails | Check phone format; ensure backend running |
| App cannot reach API | Set `API_BASE_URL` dart-define; check LAN firewall |

---

## Related

- [21_Admin_Guide.md](21_Admin_Guide.md)
- [08_Authentication_Authorization.md](08_Authentication_Authorization.md)
