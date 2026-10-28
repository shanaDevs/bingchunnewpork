import { expect, test } from '@playwright/test';
import { CartPage } from './pages/cart.page';
import { CheckoutPage } from './pages/checkout.page';
import { MenuPage } from './pages/menu.page';
import { OrderConfirmationPage } from './pages/order-confirmation.page';
import { OrderSetupPage } from './pages/order-setup.page';

test.describe('guest single-item order', () => {
  test.use({
    geolocation: { latitude: 6.9271, longitude: 79.8612 },
    permissions: ['geolocation'],
  });

  test.beforeEach(async ({ page }) => {
    // Skip the fullscreen eco promo so it does not intercept clicks during the flow
    await page.addInitScript(() => {
      localStorage.setItem('bingchun_eco_promo_last_shown', String(Date.now()));
    });
  });

  test('guest can order one available food item via takeaway', async ({ page }) => {
    test.setTimeout(120_000);

    const menuPage = new MenuPage(page);
    const orderSetup = new OrderSetupPage(page);
    const cartPage = new CartPage(page);
    const checkoutPage = new CheckoutPage(page);
    const confirmationPage = new OrderConfirmationPage(page);

    // 1. Open the application
    await page.goto('/');
    await expect(page.getByText('How would you like to order?')).toBeVisible({ timeout: 20_000 });

    // Guest must choose takeaway + branch before the menu allows adding items
    await orderSetup.expectChooserVisible();
    await orderSetup.chooseTakeaway();
    const branchName = await orderSetup.selectFirstBranch();
    expect(branchName.length).toBeGreaterThan(0);

    // 2. Navigate to the menu
    const productsOnMenu = menuPage.waitForProductsResponse();
    await orderSetup.confirmAndContinueToMenu();
    await productsOnMenu;
    await menuPage.expectLoaded();
    await menuPage.expectOrderModeReady();
    await expect(menuPage.availableProductCards().first()).toBeVisible({ timeout: 30_000 });

    // 3–4. Select one available food item and add it to the cart
    const productName = await menuPage.selectFirstAvailableProduct();
    expect(productName.length).toBeGreaterThan(0);
    await menuPage.addDefaultCustomizationToCart();
    await expect(page.getByText(`${productName} added to your cup`, { exact: false })).toBeVisible();
    await expect(menuPage.floatingCartLink).toBeVisible();

    // 5. Verify the cart contains exactly one item
    await menuPage.openCart();
    await cartPage.expectSingleItem(productName);

    // 6. Proceed to checkout
    const paymentMethods = checkoutPage.waitForPaymentMethodsResponse();
    await cartPage.proceedToCheckout();
    await paymentMethods;
    await checkoutPage.expectLoaded();
    await expect(
      page.getByText(branchName.replace('Bing Chun - ', ''), { exact: false }).first(),
    ).toBeVisible();

    // 7. Fill required guest customer information
    await checkoutPage.fillGuestDetails('E2E Guest', '0775551234', 'e2e.guest@example.com');

    await checkoutPage.expectPayOnlineSelected();

    // 8–9. Place the order and verify it was created
    const orderNumber = await checkoutPage.placePickupOrder();
    await confirmationPage.expectOrderCreated(orderNumber);
  });
});
