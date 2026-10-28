# Login Unit Testing Guide

This guide helps a new QA engineer or developer set up, run, inspect, and extend the backend unit tests for normal-user phone login.

Related docs:

- [Login E2E Testing Guide](login-e2e-testing.md) — browser-level login tests
- [Login E2E QA Guidance](login-e2e-qa-guidance.md) — mentor onboarding for E2E

## What Unit Tests Are

Unit tests check one function or controller path in isolation.

| | Unit tests | E2E tests |
|---|---|---|
| Tool | Vitest | Playwright |
| Needs browser? | No | Yes |
| Needs running servers? | No | Yes (frontend + backend) |
| Needs database? | No (mocked) | Yes |
| Speed | Fast | Slower |
| What they prove | Login logic and phone helpers work | The full login UI flow works |

Use both. Unit tests catch logic bugs quickly. E2E tests prove the real user path.

## What Is Covered

Test files live in a separate folder (not inside `src`):

```text
backend/tests/
  utils/phone.test.ts
  controllers/authController.phoneLogin.test.ts
```

Current coverage:

| File | Scenarios |
|---|---|
| `phone.test.ts` | Normalize local, `+94`, `94`, 9-digit numbers; fallback junk input; lookup variants |
| `authController.phoneLogin.test.ts` | New user create, existing user reuse, invalid phone validation error |

## Prerequisites

- Node.js 18 or later
- Dependencies installed from the repository root:

```bash
npm install
```

No MySQL, frontend, or backend server is required for unit tests.

## Commands

Run these from the repository root:

| Command | Purpose |
|---|---|
| `npm run test:unit` | Run all backend unit tests once |
| `npm run test:unit:ui` | Open Vitest UI in the browser |
| `npm run test:unit:cov` | Run tests with a coverage report |

Expected result for a healthy suite:

```text
Test Files  2 passed (2)
     Tests  9 passed (9)
```

## Using Vitest UI (recommended)

```bash
npm run test:unit:ui
```

The terminal shows a local URL, for example:

```text
UI started at http://localhost:51204/__vitest__/
```

Open that URL in the browser. In the UI you can:

1. See every test file and test name
2. Run one test or the full suite
3. Inspect pass / fail details
4. Re-run after code changes

If you see `Cannot find package '@vitest/ui'`, reinstall matching versions from the root:

```bash
npm install -D vitest@3.2.7 @vitest/ui@3.2.7 @vitest/coverage-v8@3.2.7 -w @bingchun/backend --legacy-peer-deps
```

## Using Coverage (recommended)

```bash
npm run test:unit:cov
```

1. Read the terminal coverage table.
2. Open the HTML report:

```text
backend/coverage/index.html
```

Current focused coverage targets (configured in `backend/vitest.config.ts`):

- `src/utils/phone.ts`
- `src/controllers/authController.ts`

`phone.ts` should show near **100%** line coverage. `authController.ts` will be lower because only `phoneLogin` is tested, not every auth method.

## How To Read Results

### Terminal summary

```text
✓ tests/utils/phone.test.ts (6 tests)
✓ tests/controllers/authController.phoneLogin.test.ts (3 tests)
```

- `✓` = file passed
- number in parentheses = tests in that file
- Failed tests print the assertion and stack trace below

### Verbose names

```bash
npm run test -w @bingchun/backend -- --reporter=verbose
```

This lists each test title, for example:

```text
✓ normalizePhone > keeps a canonical local number
✓ phoneLogin > creates a new user when the phone is unknown
```

### Run one file or one test

```bash
npm run test -w @bingchun/backend -- tests/utils/phone.test.ts
npm run test -w @bingchun/backend -- -t "creates a new user"
```

## Important Files

| File | Role |
|---|---|
| `backend/tests/utils/phone.test.ts` | Phone helper tests |
| `backend/tests/controllers/authController.phoneLogin.test.ts` | `phoneLogin` controller tests |
| `backend/src/utils/phone.ts` | Code under test for phone helpers |
| `backend/src/controllers/authController.ts` | Code under test for phone login |
| `backend/vitest.config.ts` | Test include paths and coverage settings |
| `backend/package.json` | `test`, `test:ui`, `test:cov` scripts |
| Root `package.json` | `test:unit`, `test:unit:ui`, `test:unit:cov` shortcuts |

## What The Tests Assert

### Phone helpers

- `0771234567` stays `0771234567`
- `+94771234567`, `94771234567`, and `771234567` normalize to `0771234567`
- Unrecognized input returns the trimmed string
- Lookup variants include local, `+94`, and `94` forms without duplicates

### phoneLogin controller

Dependencies are mocked (`prisma`, `findUserByPhone`, token signing). No real DB writes happen.

- Unknown phone → creates a verified user and returns tokens
- Existing active phone → reuses the user, does not create again, claims guest orders
- Invalid phone (`123`) → calls `next(error)`, does not return success JSON

## Adding A New Unit Test

1. Create the file under `backend/tests/`, mirroring the `src` structure.
2. Name it `*.test.ts`.
3. Import production code from `../../src/...`.
4. Mock external dependencies with `vi.mock(...)`.
5. Keep each test independent.
6. Run:

```bash
npm run test:unit
npm run test:unit:cov
```

Guidelines:

- Prefer clear behavior names (`creates a new user when the phone is unknown`)
- Do not hit a real database
- Do not rely on test order
- Do not commit `backend/coverage/`

## Troubleshooting

### `@vitest/ui` not found

Install matching Vitest UI packages for the backend workspace (see command above).

### Coverage looks too low overall

That is expected if you open an old broad report. Current config only includes phone + auth controller files. Re-run `npm run test:unit:cov` and open `backend/coverage/index.html`.

### Tests fail after pulling new code

```bash
npm install
npm run test:unit
```

### Confused between unit and E2E failures

- Unit failure → logic / mock / assertion issue in backend tests
- E2E failure → UI, API server, env, or database issue

## Completion Checklist For A New Person

- [ ] Ran `npm run test:unit` and saw 9 passed
- [ ] Opened Vitest UI with `npm run test:unit:ui`
- [ ] Ran `npm run test:unit:cov` and opened the HTML report
- [ ] Can explain the difference between unit and E2E login tests
- [ ] Can point to the two test files under `backend/tests/`
- [ ] Can describe what the new-user and invalid-phone cases check
