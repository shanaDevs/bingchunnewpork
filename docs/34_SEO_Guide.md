# SEO Guide — Bing Chun Sri Lanka (`bingchunsrilanka.com`)

Technical SEO is implemented in the Next.js frontend. Ranking #1 for “bing chun” also depends on **off-site** actions (Search Console, Google Business Profile, backlinks). This guide covers both.

**Canonical domain:** `https://bingchunsrilanka.com`  
**Live site:** [https://bingchunsrilanka.com/](https://bingchunsrilanka.com/)

---

## What the code already does

| Feature | Location |
|---------|----------|
| Root metadata (title, description, OG, Twitter, robots, canonical) | `Frontend/src/app/layout.tsx` |
| Site constants | `Frontend/src/lib/seo.ts` |
| `robots.txt` | `Frontend/src/app/robots.ts` → `/robots.txt` |
| `sitemap.xml` (home, menu, stores, promotions + products) | `Frontend/src/app/sitemap.ts` → `/sitemap.xml` |
| Organization + FoodEstablishment JSON-LD | Root layout |
| Menu ItemList JSON-LD | `Frontend/src/app/menu/page.tsx` |
| Stores ItemList JSON-LD | `Frontend/src/app/stores/page.tsx` |
| Product schema + `generateMetadata` | `Frontend/src/app/product/[id]/page.tsx` |
| Google Analytics 4 (optional) | `Frontend/src/components/analytics/GoogleAnalytics.tsx` |
| App icons / favicon | `Frontend/src/app/icon.png`, `apple-icon.png` |

After deploy, verify:

- https://bingchunsrilanka.com/robots.txt
- https://bingchunsrilanka.com/sitemap.xml
- View page source on `/`, `/menu`, `/stores`, `/product/<id>` for `<title>`, `canonical`, and `application/ld+json`

---

## Env vars (frontend)

Set these on the CapRover **frontend** app (or in `Frontend/.env` for local):

```bash
NEXT_PUBLIC_SITE_URL=https://bingchunsrilanka.com

# Google Analytics 4 Measurement ID (optional until you create GA4)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Google Search Console HTML-tag verification — content value only
# Example meta: <meta name="google-site-verification" content="AbCdEf123" />
# Then set: NEXT_PUBLIC_GSC_VERIFICATION=AbCdEf123
NEXT_PUBLIC_GSC_VERIFICATION=
```

Redeploy the frontend after changing these.

---

## Step 1 — Google Search Console (required)

**HTML file verification (already in repo):**  
`Frontend/public/googlec26f338f1816d955.html` is served at:

`https://bingchunsrilanka.com/googlec26f338f1816d955.html`

1. Deploy the frontend so that URL returns the verification file.
2. Open [Google Search Console](https://search.google.com/search-console).
3. Add property → **URL prefix** → `https://bingchunsrilanka.com` (if not already).
4. Choose **HTML file** verification and click **Verify**.
5. Go to **Sitemaps** → submit: `https://bingchunsrilanka.com/sitemap.xml`
6. Use **URL Inspection** on the homepage and request indexing.

**Optional HTML-tag method:** set `NEXT_PUBLIC_GSC_VERIFICATION` to the meta `content` value instead (or in addition).

Optional stronger verification: **Domain** property via DNS TXT record (if you control DNS).

---

## Step 2 — Google Analytics 4 (recommended)

1. Open [Google Analytics](https://analytics.google.com/).
2. Create a GA4 property for Bing Chun Sri Lanka.
3. Create a **Web** data stream with URL `https://bingchunsrilanka.com`.
4. Copy the Measurement ID (`G-XXXXXXXXXX`).
5. Set `NEXT_PUBLIC_GA_ID` on CapRover and redeploy.
6. Confirm realtime traffic after visiting the site.

---

## Step 3 — Google Business Profile (highest local impact)

For people searching “bing chun” / “bubble tea near me”, a verified Business Profile often matters more than on-page tags.

1. Open [Google Business Profile](https://business.google.com/).
2. Claim or create **Bing Chun Sri Lanka** (and major branches if needed).
3. Match NAP (name / phone / hours) with the site:
   - Phone: `076 546 6686`
   - Hours: Daily 9:00 AM – 11:00 PM
   - Website: `https://bingchunsrilanka.com`
4. Add photos, categories (`Bubble Tea Store`, `Ice cream shop`), and menu links to `/menu`.

---

## Step 4 — Off-site checklist

- [ ] Social profiles (Facebook / Instagram / TikTok) link to `https://bingchunsrilanka.com`
- [ ] Same business name and phone everywhere (NAP consistency)
- [ ] Submit sitemap in Search Console
- [ ] Request indexing for `/`, `/menu`, `/stores`
- [ ] Fix any Soft 404 / redirect issues (ensure `.lk` does not compete — redirect `.lk` → `.com` if you own it)
- [ ] Build a few quality backlinks (directories, press, partners)

---

## Expectation

On-site SEO makes the site correctly crawlable and relevant. **#1 rank is not guaranteed by code alone** — brand searches improve fastest with Google Business Profile + consistent NAP + Search Console indexing. Competitive non-brand queries (e.g. “bubble tea Colombo”) need ongoing content and backlinks.

---

## Developer notes

- Public routes are indexed; `/admin`, `/account`, `/checkout`, `/cart`, `/api` are disallowed in `robots.ts`.
- Sitemap product URLs need the frontend container to reach the backend API (`BACKEND_URL` / `NEXT_PUBLIC_API_URL`). If the API is unreachable at request time, sitemap still returns the static routes.
- Do not put secrets in `NEXT_PUBLIC_*` vars — GA and GSC verification values are public by design.
