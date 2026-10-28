import { expect, type Locator, type Page } from '@playwright/test';

export class MenuPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly productGrid: Locator;
  readonly floatingCartLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Explore Our Products' });
    this.productGrid = page.locator('.product-card-grid');
    this.floatingCartLink = page.getByRole('link', { name: /View Your Cup/i });
  }

  async goto() {
    await this.page.goto('/menu');
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/menu/);
    await expect(this.heading).toBeVisible();
  }

  waitForProductsResponse() {
    return this.page.waitForResponse((response) => {
      const url = response.url();
      return (
        url.includes('/api/menu/products') &&
        !url.includes('tag=') &&
        response.request().method() === 'GET' &&
        response.ok()
      );
    });
  }

  /** In-stock items at the selected branch (excludes unavailable / nearby-only). */
  availableProductCards(): Locator {
    return this.productGrid
      .locator('[role="button"]')
      .filter({ hasNotText: 'Unavailable' })
      .filter({ hasNotText: 'Out here · Available nearby' });
  }

  async selectFirstAvailableProduct() {
    const product = this.availableProductCards().first();
    await expect(product).toBeVisible({ timeout: 30_000 });
    const label = (await product.getAttribute('aria-label')) ?? '';
    const name = label.split(',')[0]?.trim() || 'item';
    await product.click();
    return name;
  }

  async expectOrderModeReady() {
    await expect(this.page.getByText('Takeaway', { exact: true }).first()).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Change order mode' })).toBeVisible();
  }

  async addDefaultCustomizationToCart() {
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Customize & Add' })).toBeVisible();

    const addButton = dialog.getByRole('button', { name: /Add to Cart/ });
    await expect(addButton).toBeEnabled();
    await addButton.click();

    await expect(dialog).toBeHidden();
  }

  async openCart() {
    await expect(this.floatingCartLink).toBeVisible();
    await Promise.all([
      this.page.waitForURL(/\/cart/),
      this.floatingCartLink.click(),
    ]);
  }
}
