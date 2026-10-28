import { expect, type Locator, type Page } from '@playwright/test';

export class CartPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly checkoutButton: Locator;
  readonly itemCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Your Cup' });
    this.checkoutButton = page.getByRole('button', { name: /Proceed to Checkout/i });
    this.itemCards = page.locator('.lg\\:col-span-2 .card');
  }

  async expectSingleItem(productName: string) {
    await expect(this.page).toHaveURL(/\/cart/);
    await expect(this.heading).toBeVisible();
    await expect(this.page.getByText('1 drink', { exact: false })).toBeVisible();
    await expect(this.page.getByText('Subtotal (1 items)')).toBeVisible();
    await expect(this.itemCards).toHaveCount(1);
    await expect(this.itemCards.first().getByRole('heading', { name: productName })).toBeVisible();
  }

  async proceedToCheckout() {
    await expect(this.checkoutButton).toBeEnabled();
    await this.checkoutButton.scrollIntoViewIfNeeded();
    await Promise.all([
      this.page.waitForURL(/\/checkout/),
      this.checkoutButton.click(),
    ]);
  }
}
