import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Covers the Delivery / Takeaway setup UI used on the home page
 * and in the site-wide OrderModeModal.
 */
export class OrderSetupPage {
  readonly page: Page;
  readonly chooseHeading: Locator;
  readonly takeawayButton: Locator;
  readonly deliveryButton: Locator;
  readonly continueButton: Locator;
  readonly branchSearch: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chooseHeading = page.getByRole('heading', { name: 'How would you like to order?' });
    this.takeawayButton = page.getByRole('button', { name: /Takeaway/i });
    this.deliveryButton = page.getByRole('button', { name: /Delivery/i });
    this.continueButton = page.getByRole('button', { name: 'Continue to Menu' });
    this.branchSearch = page.getByPlaceholder('Search by name, area, or district...');
  }

  waitForStoresResponse() {
    return this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/stores') &&
        response.request().method() === 'GET' &&
        response.ok(),
    );
  }

  async expectChooserVisible() {
    await expect(this.chooseHeading).toBeVisible();
    await expect(this.takeawayButton).toBeVisible();
    await expect(this.deliveryButton).toBeVisible();
  }

  async chooseTakeaway() {
    const storesResponse = this.waitForStoresResponse();
    await this.takeawayButton.click();
    await expect(this.page.getByRole('heading', { name: 'Choose your pickup store' })).toBeVisible();
    await storesResponse;
    await expect(this.page.getByText(/Finding nearest outlet|Loading outlets/)).toBeHidden({
      timeout: 30_000,
    });
    await expect(this.branchSearch).toBeVisible();
  }

  async selectFirstBranch() {
    const branch = this.page
      .locator('button')
      .filter({ has: this.page.locator('p.font-medium') })
      .filter({ hasText: /Bing Chun/ })
      .first();

    await expect(branch).toBeVisible({ timeout: 30_000 });
    const branchName = (await branch.locator('p.font-medium').innerText()).trim();
    await branch.click();
    await expect(this.continueButton).toBeEnabled();
    return branchName;
  }

  async confirmAndContinueToMenu() {
    await this.continueButton.click();
    await expect(this.page).toHaveURL(/\/menu/);
  }
}
