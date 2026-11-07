# Frontend-v2: customer website, version 2

`Frontend-v2` is version 2 of the **customer website**. All new redesign changes go here. `Frontend` is version 1, the
current design; it is still developed and is the only version that is deployed. v2 runs locally only.

- **Full copy, including admin.** The admin panel (`src/app/admin`) and its code are kept, so this folder could be
  deployed on its own later. Admin changes are still made in `Frontend`; the deployment files (`Dockerfile`,
  `deploy/`) are only in `Frontend`.
- **Not an npm workspace.** It isn't listed in the root `package.json` workspaces. Node finds its packages in the
  repo root's `node_modules`.
- **Images are shared.** `Frontend-v2/public` is a link to `Frontend/public` (git-ignored), so both versions use one
  set of images. Adding or deleting a file through either folder changes it for both.
- **Separate copy of everything else.** A fix made in `Frontend` is not in `Frontend-v2`, or the other way round,
  until it is made in both.

## Running it

From the repo root, after `npm ci` at the root:

```bash
npm run setup:frontend-v2   # once per machine: copies 2 packages from Frontend/node_modules, links public/
npm run dev:frontend-v2     # http://localhost:3001 (v1 stays on http://localhost:3000)
```

Both use the same backend (`npm run dev:backend`) and database. Sign-in is shared between the two on localhost.
Copy `Frontend/.env.local` to `Frontend-v2/.env.local` if you don't have it (it is git-ignored).

---

*The original Next.js notes follow.*

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
