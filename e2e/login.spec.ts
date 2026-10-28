import { expect, test } from '@playwright/test';
import { getLatestOtpForPhone } from './helpers/otp';

async function openLoginPage(page: import('@playwright/test').Page) {
  await page.goto('/account/login');
  await page.waitForLoadState('networkidle');
}

function waitForOtpRequestResponse(page: import('@playwright/test').Page) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/otp/request') &&
      response.request().method() === 'POST',
  );
}

function waitForOtpVerifyResponse(page: import('@playwright/test').Page) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/otp/verify') &&
      response.request().method() === 'POST',
  );
}

async function requestOtpAndGetCode(
  page: import('@playwright/test').Page,
  phone: string,
): Promise<string> {
  await page.getByRole('textbox', { name: '07X XXX XXXX' }).fill(phone);

  const otpRequestResponse = waitForOtpRequestResponse(page);
  await page.getByRole('button', { name: 'Send OTP', exact: true }).click();

  const response = await otpRequestResponse;
  expect(response.ok()).toBeTruthy();
  const code = await getLatestOtpForPhone(phone);
  return code;
}

test.describe('normal user login', () => {
  test.beforeEach(async ({ page }) => {
    await openLoginPage(page);
  });

  test('logs in with a valid local phone number after verifying the OTP', async ({ page }) => {
    const code = await requestOtpAndGetCode(page, '0771234567');
    await expect(page.getByPlaceholder('6-digit OTP')).toBeVisible();

    await page.getByPlaceholder('6-digit OTP').fill(code);

    const verifyResponse = waitForOtpVerifyResponse(page);
    await page.getByRole('button', { name: 'Verify & Login', exact: true }).click();

    expect((await verifyResponse).ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Welcome back!', { exact: false })).toBeVisible();
  });

  test('logs in with a valid international phone number after verifying the OTP', async ({ page }) => {
    const code = await requestOtpAndGetCode(page, '+94771234567');
    await page.getByPlaceholder('6-digit OTP').fill(code);

    const verifyResponse = waitForOtpVerifyResponse(page);
    await page.getByRole('button', { name: 'Verify & Login', exact: true }).click();

    expect((await verifyResponse).ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/$/);
  });

  test('rejects an incorrect OTP code', async ({ page }) => {
    const code = await requestOtpAndGetCode(page, '0771234567');
    const wrongCode = code === '000000' ? '111111' : '000000';
    await page.getByPlaceholder('6-digit OTP').fill(wrongCode);

    const verifyResponse = waitForOtpVerifyResponse(page);
    await page.getByRole('button', { name: 'Verify & Login', exact: true }).click();

    expect((await verifyResponse).ok()).toBeFalsy();
    await expect(page).toHaveURL(/\/account\/login$/);
    await expect(page.getByText('Invalid or expired OTP', { exact: false })).toBeVisible();
  });

  test('rejects an invalid phone number', async ({ page }) => {
    await page.getByRole('textbox', { name: '07X XXX XXXX' }).fill('12345');
    await page.getByRole('button', { name: 'Send OTP', exact: true }).click();

    await expect(page.getByText('Enter a valid 10-digit mobile number', { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/account\/login$/);
    await expect(page.getByPlaceholder('6-digit OTP')).not.toBeVisible();
  });

  test('does not submit an empty phone number', async ({ page }) => {
    const phoneInput = page.getByRole('textbox', { name: '07X XXX XXXX' });

    await page.getByRole('button', { name: 'Send OTP', exact: true }).click();

    await expect(phoneInput).toBeFocused();
    expect(
      await phoneInput.evaluate((input: HTMLInputElement) => input.validity.valueMissing),
    ).toBeTruthy();
    await expect(page).toHaveURL(/\/account\/login$/);
  });
});
