# Login E2E Testing Guide

This guide helps QA engineers set up, run, debug, and extend the normal-user login end-to-end tests.

For mentor-led onboarding and review criteria, see the [QA Guidance for Login E2E Testing](login-e2e-qa-guidance.md).

For backend unit tests (no browser / no DB), see the [Login Unit Testing Guide](login-unit-testing.md).

## What Is Covered

The Playwright suite in `e2e/login.spec.ts` checks the customer login page at:

```text
http://localhost:3000/account/login
```

Current scenarios:

| Type | Scenario | Expected result |
|---|---|---|
| Positive | Send OTP then verify with the local number `0771234567` | Both API calls return success and the user is redirected to `/account` |
| Positive | Send OTP then verify with the international number `+94771234567` | Both API calls return success and the user is redirected to `/account` |
| Negative | Verify with an incorrect OTP code | The verify API rejects the code, an error message is shown, and the user stays on the login page |
| Negative | Send OTP with an invalid number `12345` | The client blocks the request, an error message is shown, and the user stays on the login page |
| Negative | Submit an empty phone field | The browser blocks submission, focuses the required field, and stays on the login page |

The login flow now requires OTP verification. Entering a phone number and pressing **Send OTP** calls `POST /api/auth/otp/request`, which creates the user if needed and returns a `code` field in development (mock SMS mode) so tests do not need a real SMS provider. Entering that code and pressing **Verify & Login** calls `POST /api/auth/otp/verify`, which logs the user in and redirects to `/account`.

## Prerequisites

- Node.js 18 or later
- npm 9 or later
- MySQL configured for the backend
- Valid environment files:
  - `backend/.env`
  - `Frontend/.env`

The frontend must use:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

## First-Time Setup

Run these commands from the repository root:

```bash
npm install
npx playwright install chromium
```

Prepare the database if it has not been initialized:

```bash
npm run db:push
npm run db:seed
```

## Running the Tests

### Standard run

```bash
npm run test:e2e
```

This starts or reuses the development server, opens Chromium, runs the tests, and closes the browser when finished.

Expected result:

```text
5 passed
```

### Playwright UI mode

```bash
npm run test:e2e:ui
```

Use UI mode to:

- Run one scenario at a time
- Step through each action
- Inspect locators, network requests, screenshots, and traces
- Re-run failed tests quickly

### Explicit headed mode

```bash
npm run test:e2e:headed
```

## Application Services

The Playwright configuration expects:

| Service | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:4000` |

`playwright.config.ts` runs `npm run dev` when the frontend is not already available. If the frontend is already running, Playwright reuses it.

For troubleshooting, services can be started manually:

```bash
npm run dev
```

Confirm both messages appear before testing:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:4000
```

## Test Files

| File | Purpose |
|---|---|
| `e2e/login.spec.ts` | Normal-user login scenarios and assertions |
| `playwright.config.ts` | Browser, base URL, reporter, trace, and server settings |
| `package.json` | Playwright test commands |

The tests wait for the login page to finish loading before interacting with it. They also wait for the `POST /api/auth/otp/request` and `POST /api/auth/otp/verify` responses before checking navigation or errors. This prevents false failures caused by clicking before the Next.js page has hydrated. The OTP code used to verify is read directly from the `otp/request` response body (its `code` field), which the backend returns in mock SMS mode.

## Test Data

The positive scenarios use:

```text
0771234567
+94771234567
```

Both values normalize to the same Sri Lankan phone number. The login endpoint may create or reuse a real record in the configured development database. Do not run this suite against production.

When adding more test data:

- Use Sri Lankan test numbers beginning with `0` or `+94`
- Avoid real customer phone numbers
- Keep tests repeatable so they can run multiple times
- Do not depend on execution order

## Reviewing Results

The terminal displays the pass/fail summary. Playwright also creates:

```text
playwright-report/
test-results/
```

These directories are ignored by Git.

Open the latest HTML report with:

```bash
npx playwright show-report
```

Traces are captured on the first retry and can be inspected from the report.

## Troubleshooting

### Chromium is missing

```bash
npx playwright install chromium
```

### Port 3000 is already in use

Stop the duplicate frontend process, or keep the existing valid development server running. Playwright can reuse a server on port 3000.

### Login stays on `/account/login`

Check:

1. The backend is running on port 4000.
2. `Frontend/.env` points to `http://localhost:4000/api`.
3. MySQL is running and the backend reports `Database connected`.
4. The browser network panel shows `POST /api/auth/otp/request` followed by `POST /api/auth/otp/verify`.

### Backend fails during `prisma generate` on Windows

An existing Node process may be locking the Prisma query engine DLL. Stop duplicate backend processes and run:

```bash
npm run db:generate
npm run dev
```

### HTTP 429 response

The authentication endpoint is rate-limited. Wait for the rate-limit window to reset, then run the test again. Avoid repeatedly running the suite against a production-configured backend.

### Invalid phone test fails

Invalid phone numbers are now rejected client-side before any API call is made. The expected toast message is `Enter a valid 10-digit mobile number`. If validation rules or the client-side error message change, update the matching assertion in `e2e/login.spec.ts`.

## Adding a New Scenario

Add the test inside the `normal user login` describe block in `e2e/login.spec.ts`.

Guidelines:

1. Use accessible locators such as `getByRole`.
2. Wait for the relevant API response before asserting the result.
3. Assert both the backend outcome and visible user behavior.
4. Keep each test independent.
5. Run the complete suite before submitting changes:

```bash
npm run test:e2e
```

Also verify there are no TypeScript or lint errors in the changed test files.
