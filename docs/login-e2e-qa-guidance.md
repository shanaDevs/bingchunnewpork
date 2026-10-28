# QA Guidance for Login E2E Testing

This document is for the person onboarding or supervising a new QA engineer who will maintain the normal-user login Playwright tests.

The detailed setup and execution instructions are in the [Login E2E Testing Guide](login-e2e-testing.md).

## Guidance Objective

By the end of onboarding, the QA engineer should be able to:

- Explain the normal-user login flow
- Start the required frontend, backend, and database services
- Run the Playwright login suite
- Understand each positive and negative scenario
- Investigate a failed test using Playwright UI and reports
- Add a new independent scenario using reliable locators and assertions
- Report whether a failure is caused by the application, environment, test data, or test code

## System Overview to Explain

Walk the QA engineer through this flow:

1. Playwright opens `http://localhost:3000/account/login`.
2. The user enters a Sri Lankan phone number and presses **Send OTP**.
3. The frontend sends `POST http://localhost:4000/api/auth/otp/request`.
4. The backend validates and normalizes the phone number, creates or reuses a development user, and returns an OTP `code` (mock SMS mode).
5. The user enters the 6-digit code and presses **Verify & Login**.
6. The frontend sends `POST http://localhost:4000/api/auth/otp/verify`.
7. A correct, unexpired code logs the user in, stores authentication data, and redirects to `/account`.
8. Invalid input keeps the user on the login page and displays validation feedback.

Important points:

- OTP verification is required to log in.
- Tests use the development database and must never run against production.
- `0771234567` and `+94771234567` normalize to the same phone number.
- The browser is intentionally visible during normal test execution.
- The backend returns the OTP `code` in the `otp/request` response body so tests can verify without a real SMS provider.

## Recommended Onboarding Session

### 1. Repository orientation

Show these files:

- `e2e/login.spec.ts` — test scenarios
- `playwright.config.ts` — browser and server configuration
- `Frontend/src/app/account/login/page.tsx` — login user interface
- `backend/src/controllers/authController.ts` — backend login behavior
- `docs/login-e2e-testing.md` — setup and execution reference

Ask the QA engineer to identify:

- The phone input locator
- The "Send OTP" button locator
- The OTP code input locator
- The "Verify & Login" button locator
- The OTP request and verify API endpoints
- The successful redirect
- The expected invalid-input response

### 2. Environment verification

Ask the QA engineer to confirm:

- Node.js 18 or later is installed
- Dependencies are installed
- Chromium is installed for Playwright
- MySQL is running
- Backend reports `Database connected`
- Frontend is available on port 3000
- Backend is available on port 4000
- `Frontend/.env` points to `http://localhost:4000/api`

Do not continue until the application can be opened manually.

### 3. First test run

Run:

```bash
npm run test:e2e
```

The expected result is:

```text
5 passed
```

Ask the QA engineer to explain what the browser did for each scenario instead of only confirming the final pass count.

### 4. Interactive investigation

Run:

```bash
npm run test:e2e:ui
```

Ask the QA engineer to:

1. Select one positive test.
2. Run it independently.
3. Inspect each action.
4. Find the `POST /api/auth/otp/request` request and confirm it returns a `code`.
5. Find the `POST /api/auth/otp/verify` request and confirm its response status.
6. Check the final browser URL.
7. Run one negative test and compare the result.

### 5. Failure exercise

Create a temporary local failure for training, such as entering an incorrect expected URL in the test. Do not commit the temporary change.

Ask the QA engineer to:

1. Read the terminal error.
2. Open the Playwright report.
3. Identify the failed assertion.
4. Decide whether the application or test expectation is wrong.
5. Restore the original test.
6. Re-run the complete suite.

Use:

```bash
npx playwright show-report
```

## Existing Scenario Review

### Valid local phone number

Input:

```text
0771234567
```

The QA engineer should verify:

- The OTP request API call is sent and returns a `code`.
- The OTP input field appears.
- Submitting the correct code sends the verify API request.
- The response is successful.
- The page redirects to `/account`.
- The welcome message is visible.

### Valid international phone number

Input:

```text
+94771234567
```

The QA engineer should verify:

- The backend accepts the international format.
- The number is normalized correctly.
- The page redirects to `/account` after OTP verification.

### Incorrect OTP code

The QA engineer should verify:

- The verify API call fails.
- An "Invalid or expired OTP" message is displayed.
- The browser remains on `/account/login`.

### Invalid phone number

Input:

```text
12345
```

The QA engineer should verify:

- No OTP request API call is sent (client-side validation blocks it).
- An "Enter a valid 10-digit mobile number" message is displayed.
- The browser remains on `/account/login`.

### Empty phone number

The QA engineer should verify:

- The browser prevents form submission.
- The phone field receives focus.
- Required-field validation is active.
- No successful navigation occurs.

## Rules for Adding Tests

Require the QA engineer to follow these rules:

1. Give each test a behavior-focused name.
2. Keep every test independent and repeatable.
3. Use accessible Playwright locators such as `getByRole`.
4. Do not use arbitrary sleep statements.
5. Wait for the relevant API response when testing submitted forms.
6. Assert both the API result and the visible user result.
7. Never use real customer phone numbers.
8. Do not depend on test execution order.
9. Run the complete suite after every change.
10. Do not commit Playwright reports or test result artifacts.

## Review Checklist

Before accepting the QA engineer's work, verify:

- [ ] The complete suite passes.
- [ ] Positive and negative behavior is covered.
- [ ] Tests use stable, accessible locators.
- [ ] There are no fixed delays such as `waitForTimeout`.
- [ ] API waits are registered before clicking the submit button.
- [ ] Assertions check meaningful user-visible outcomes.
- [ ] Test data is safe for the development database.
- [ ] Tests pass when run more than once.
- [ ] Reports and generated results are not committed.
- [ ] Any discovered application bug includes reproduction steps, expected behavior, actual behavior, and evidence.

## How to Classify Failures

### Application failure

Examples:

- API returns an unexpected 500 response.
- Valid credentials do not redirect.
- Invalid input is accepted.
- The expected error is not visible.

The QA engineer should create a bug report with screenshots, response status, response body, and exact reproduction steps.

### Environment failure

Examples:

- MySQL is not running.
- Port 3000 or 4000 is unavailable.
- Chromium is not installed.
- Environment variables point to the wrong API.

Fix the environment and rerun before reporting an application defect.

### Test failure

Examples:

- A locator no longer matches after an intentional UI change.
- The test checks outdated text.
- The test starts waiting for a response after the click.
- Test data depends on a previous test.

Update the test only after confirming that the application behavior is correct.

### Test-data failure

Examples:

- A number conflicts with unexpected database state.
- A real or production-linked account was used.
- Rate limits were triggered by repeated execution.

Use safe development data and document any required database state.

## Bug Report Template

```markdown
# Login: Short description

## Environment
- Branch/commit:
- Browser:
- Frontend URL:
- Backend URL:

## Preconditions
- Database state:
- Test phone number:

## Steps to reproduce
1.
2.
3.

## Expected result

## Actual result

## Evidence
- Screenshot/video:
- API status and response:
- Playwright trace/report:
```

## Completion Criteria

The QA engineer is ready to work independently when they can:

- Run all login tests without assistance
- Explain why every assertion exists
- Diagnose one intentionally failed test
- Add and validate one new scenario
- Produce a complete bug report from a confirmed application failure
- Restore the suite to a passing state
