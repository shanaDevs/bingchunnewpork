import { expect, type Locator, type Page } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly emailInput: Locator;

  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Checkout' });
    this.nameInput = page.getByPlaceholder('Full Name *');
    this.phoneInput = page.getByPlaceholder('Mobile Number *');
    this.emailInput = page.getByPlaceholder('Email (optional)');
    this.placeOrderButton = page.getByRole('button', {
      name: /Pay & Place|Place Pickup Order|Place Order/,
    });
  }

  waitForPaymentMethodsResponse() {
    return this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/settings/payment-methods') &&
        response.request().method() === 'GET' &&
        response.ok(),
    );
  }

  waitForGuestLoginResponse() {
    return this.page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/phone/login') &&
        response.request().method() === 'POST',
    );
  }

  waitForPlaceOrderResponse() {
    return this.page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/orders') &&
        response.request().method() === 'POST',
    );
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.page.getByText('Takeaway', { exact: true }).first()).toBeVisible();
  }

  async fillGuestDetails(name: string, phone: string, email?: string) {
    await expect(this.nameInput).toBeVisible();
    await this.nameInput.fill(name);
    await this.phoneInput.fill(phone);
    if (email) {
      await this.emailInput.fill(email);
    }
    await expect(this.nameInput).toHaveValue(name);
    await expect(this.phoneInput).toHaveValue(phone);
  }

  async expectPayOnlineSelected() {
    await expect(
      this.page.getByText('Pay online to complete your order', { exact: false }),
    ).toBeVisible({
      timeout: 30_000,
    });
  }

  async placePickupOrder() {
    const loginResponse = this.waitForGuestLoginResponse();
    const orderResponse = this.waitForPlaceOrderResponse();

    await expect(this.placeOrderButton).toBeEnabled();
    await this.placeOrderButton.click();

    expect((await loginResponse).ok()).toBeTruthy();
    const placed = await orderResponse;
    expect(placed.ok()).toBeTruthy();

    const body = await placed.json();
    const orderNumber = body?.data?.order?.orderNumber as string | undefined;
    expect(orderNumber).toBeTruthy();

    await this.page.waitForURL(new RegExp(`/order/${encodeURIComponent(orderNumber!)}`), {
      timeout: 30_000,
    });
    return orderNumber!;
  }
}
