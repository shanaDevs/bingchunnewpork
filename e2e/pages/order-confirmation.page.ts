import { expect, type Locator, type Page } from '@playwright/test';

export class OrderConfirmationPage {
  readonly page: Page;
  readonly confirmedHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.confirmedHeading = page.getByRole('heading', { name: 'Order Confirmed!' });
  }

  async expectOrderCreated(orderNumber: string) {
    await expect(this.page).toHaveURL(new RegExp(`/order/${encodeURIComponent(orderNumber)}`));
    await expect(this.confirmedHeading).toBeVisible({ timeout: 30_000 });
    await expect(this.page.getByText(`Order #${orderNumber}`)).toBeVisible();
  }
}
