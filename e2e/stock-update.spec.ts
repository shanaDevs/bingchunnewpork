import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { getLatestOtpForPhone } from './helpers/otp';
import { CartPage } from './pages/cart.page';
import { MenuPage } from './pages/menu.page';

/**
 * Stock deduction & alerts e2e
 *
 * Covers:
 * 1. Customer login (OTP)
 * 2. Pickup (cash at counter) → stock deducts on place
 * 3. Delivery (online) → stock deducts only after successful payment
 * 4. Failed online payment → stock qty unchanged
 * 5. Branch admin UI + low-stock / out-of-stock warning toasts
 *
 * Does not modify any application source files.
 */

const API_BASE = 'http://localhost:4000/api';
const CUSTOMER_PHONE = '0771234567';
const BRANCH_ADMIN = {
  email: 'branch@bingchunsrilanka.lk',
  password: 'Branch@123',
} as const;
const NUGEGODA = { latitude: 6.8726, longitude: 79.8897 };

/** Matches backend/src/lib/stockEngine.ts */
const LOW_STOCK_THRESHOLD = 25;
const OUT_OF_STOCK_THRESHOLD = 5;

type StockItem = {
  productId: string;
  name: string;
  weeklyBaseQty: number;
  weeklyRemainingQty: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
};

type StockResponse = {
  store: { id: string; name: string; city: string };
  items: StockItem[];
};

type PlacedOrder = {
  orderNumber: string;
  paymentMethod: string;
  paymentStatus?: string;
  total: number;
  productId: string;
  productName: string;
  quantity: number;
  orderMode: 'TAKEAWAY' | 'DELIVERY';
};

function expectedQtyStatus(item: Pick<StockItem, 'isOutOfStock' | 'isLowStock'>): string {
  if (item.isOutOfStock) return 'Out of stock';
  if (item.isLowStock) return 'Low stock';
  return 'In stock';
}

async function adminLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/auth/admin/login`, {
    data: BRANCH_ADMIN,
  });
  expect(res.ok(), `admin login failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { data?: { token?: string } };
  const token = body.data?.token;
  expect(token).toBeTruthy();
  return token!;
}

async function fetchBranchStock(request: APIRequestContext, token: string): Promise<StockResponse> {
  const res = await request.get(`${API_BASE}/admin/stock`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `stock fetch failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { data: StockResponse };
  return body.data;
}

/** Drive weekly remaining qty to an exact target via topup API (no app code changes). */
async function setRemainingQty(
  request: APIRequestContext,
  token: string,
  productId: string,
  target: number,
) {
  const stock = await fetchBranchStock(request, token);
  const item = stock.items.find((row) => row.productId === productId);
  expect(item, `product ${productId} missing from branch stock`).toBeTruthy();
  const current = item!.weeklyRemainingQty;
  if (current === target) return;

  if (current > target) {
    const res = await request.post(`${API_BASE}/admin/stock/${productId}/topup`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { weeklyBaseQty: Math.max(target, 1), note: 'e2e set remaining down' },
    });
    expect(res.ok(), `topup reduce failed: ${res.status()}`).toBeTruthy();
  } else {
    const res = await request.post(`${API_BASE}/admin/stock/${productId}/topup`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        weeklyBaseQty: Math.max(item!.weeklyBaseQty, target),
        delta: target - current,
        note: 'e2e set remaining up',
      },
    });
    expect(res.ok(), `topup increase failed: ${res.status()}`).toBeTruthy();
  }

  await expect
    .poll(async () => {
      const after = await fetchBranchStock(request, token);
      return after.items.find((row) => row.productId === productId)?.weeklyRemainingQty ?? null;
    })
    .toBe(target);
}

async function notifyPayment(
  request: APIRequestContext,
  orderNumber: string,
  total: number,
  success: boolean,
) {
  // PayHere: '2' = paid. Non-2 / non-0 codes mark FAILED (see payherePayment.isFailedStatus).
  // Mock UI "failed" uses '0' which stays PENDING — use '-2' so stock path is unambiguous.
  const statusCode = success ? '2' : '-2';
  const res = await request.post(`${API_BASE}/orders/payment-notify`, {
    data: {
      order_id: orderNumber,
      payment_id: `e2e_${Date.now()}`,
      payhere_amount: total,
      payhere_currency: 'LKR',
      status_code: statusCode,
      md5sig: 'mock_sig',
    },
  });
  expect(res.ok(), `payment-notify failed: ${res.status()}`).toBeTruthy();
}

async function skipEcoPromo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('bingchun_eco_promo_last_shown', String(Date.now()));
  });
}

async function loginAsCustomer(page: Page) {
  await page.goto('/account/login');
  await page.waitForLoadState('networkidle');
  await page.getByRole('textbox', { name: '07X XXX XXXX' }).fill(CUSTOMER_PHONE);

  const otpRequest = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/otp/request') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send OTP', exact: true }).click();
  const otpRes = await otpRequest;
  expect(otpRes.ok()).toBeTruthy();
  const code = await getLatestOtpForPhone(CUSTOMER_PHONE);
  expect(code).toBeTruthy();

  await page.getByPlaceholder('6-digit OTP').fill(code);
  const verify = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/otp/verify') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Verify & Login', exact: true }).click();
  expect((await verify).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/$/);

}

async function openOrderChooser(page: Page) {
  await page.goto('/');
  await expect(page.getByText('How would you like to order?')).toBeVisible({ timeout: 30_000 });
}

async function choosePickupAtNugegoda(page: Page) {
  await openOrderChooser(page);
  await page.getByRole('button', { name: /Select Pickup|Takeaway/i }).click();
  await expect(page.getByText(/Choose your pickup store|Nearest outlet|All branches/i).first()).toBeVisible({
    timeout: 20_000,
  });

  // Prefer current location list (geo is Nugegoda), else search branches.
  const useLocation = page.getByRole('button', { name: /use my current location/i });
  if (await useLocation.isVisible().catch(() => false)) {
    await useLocation.click();
  }

  const nugegoda = page
    .locator('button')
    .filter({ has: page.locator('p.font-medium, p.font-semibold') })
    .filter({ hasText: /Nugegoda/i })
    .first();
  await expect(nugegoda).toBeVisible({ timeout: 45_000 });
  await Promise.all([page.waitForURL(/\/menu/, { timeout: 30_000 }), nugegoda.click()]);
}

async function chooseDeliveryNearNugegoda(page: Page) {
  await openOrderChooser(page);
  await page.getByRole('button', { name: /Select Delivery|Delivery/i }).first().click();
  await expect(page.getByText(/Where should we deliver/i)).toBeVisible({ timeout: 20_000 });

  await expect
    .poll(
      async () =>
        (await page.getByText(/Suggested branches|Finding nearest|Delivery not available/i).count()) >
        0,
      { timeout: 60_000 },
    )
    .toBeTruthy();

  const nugegoda = page
    .locator('button')
    .filter({ hasText: /Nugegoda/i })
    .first();
  if (await nugegoda.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await Promise.all([page.waitForURL(/\/menu/, { timeout: 30_000 }), nugegoda.click()]);
    return;
  }

  // Fallback: click first suggested eligible branch
  const suggested = page.locator('button.order-branch-card').first();
  await expect(suggested).toBeVisible({ timeout: 20_000 });
  await Promise.all([page.waitForURL(/\/menu/, { timeout: 30_000 }), suggested.click()]);
}

async function addFirstAvailableProduct(page: Page): Promise<string> {
  const menuPage = new MenuPage(page);
  await menuPage.expectLoaded();
  await expect(menuPage.availableProductCards().first()).toBeVisible({ timeout: 30_000 });
  const productName = await menuPage.selectFirstAvailableProduct();
  expect(productName.length).toBeGreaterThan(0);
  await menuPage.addDefaultCustomizationToCart();
  await expect(page.getByText(`${productName} added to your cup`, { exact: false })).toBeVisible();
  return productName;
}

async function goCheckout(page: Page, productName: string) {
  const menuPage = new MenuPage(page);
  const cartPage = new CartPage(page);
  await menuPage.openCart();
  await cartPage.expectSingleItem(productName);
  const paymentMethods = page.waitForResponse(
    (response) =>
      response.url().includes('/api/settings/payment-methods') &&
      response.request().method() === 'GET' &&
      response.ok(),
  );
  await cartPage.proceedToCheckout();
  await paymentMethods;
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
}

async function selectPaymentMethod(page: Page, preferCash: boolean): Promise<string> {
  if (preferCash) {
    const cash = page.getByRole('radio', { name: /Cash at Counter/i });
    if (await cash.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cash.click();
      await expect(cash).toHaveAttribute('aria-checked', 'true');
      return 'CASH_AT_COUNTER';
    }
  }
  const online = page.getByRole('radio', { name: /Pay Online|PayHere|Card/i }).first();
  await expect(online).toBeVisible({ timeout: 10_000 });
  await online.click();
  await expect(online).toHaveAttribute('aria-checked', 'true');
  return 'PAYHERE';
}

async function placeOrderFromCheckout(
  page: Page,
  preferCash: boolean,
): Promise<PlacedOrder> {
  const paymentMethod = await selectPaymentMethod(page, preferCash);

  const orderResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/orders') && response.request().method() === 'POST',
  );

  const placeOrderButton = page.getByRole('button', {
    name: /Pay & Place|Place Order|Place Pickup Order/,
  });
  await expect(placeOrderButton).toBeEnabled({ timeout: 30_000 });
  // Do not await navigation — PayHere popup can hang after order create.
  void placeOrderButton.click();

  const orderResponse = await orderResponsePromise;
  expect(orderResponse.ok(), `place order failed: ${orderResponse.status()}`).toBeTruthy();
  const orderBody = (await orderResponse.json()) as {
    data?: {
      order?: {
        orderNumber?: string;
        paymentMethod?: string;
        paymentStatus?: string;
        total?: number;
        orderMode?: 'TAKEAWAY' | 'DELIVERY';
        items?: Array<{ productId?: string; quantity?: number; productName?: string }>;
      };
    };
  };
  const order = orderBody.data?.order;
  expect(order?.orderNumber).toBeTruthy();
  const item = order!.items?.[0];
  expect(item?.productId).toBeTruthy();

  return {
    orderNumber: order!.orderNumber!,
    paymentMethod: order?.paymentMethod ?? paymentMethod,
    paymentStatus: order?.paymentStatus,
    total: order?.total ?? 0,
    productId: item!.productId!,
    productName: item?.productName ?? '',
    quantity: item?.quantity ?? 1,
    orderMode: order?.orderMode ?? 'TAKEAWAY',
  };
}

async function loginBranchAdminUi(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const adminPage = await context.newPage();
  await adminPage.goto('/admin/login');
  await adminPage.getByPlaceholder('Staff email').fill(BRANCH_ADMIN.email);
  await adminPage.getByPlaceholder('Password').fill(BRANCH_ADMIN.password);
  await Promise.all([
    adminPage.waitForURL(/\/admin/),
    adminPage.getByRole('button', { name: 'Sign In', exact: true }).click(),
  ]);
  // Prime socket listeners used for stock alerts
  await adminPage.goto('/admin/stock');
  await expect(adminPage.getByRole('heading', { name: 'Branch Stock' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(adminPage.getByText('Low Stock', { exact: true }).first()).toBeVisible();
  await expect(adminPage.getByText('Out of Stock', { exact: true }).first()).toBeVisible();
  return adminPage;
}

async function assertStockRow(
  adminPage: Page,
  productName: string,
  expectedQty: number,
  expectedStatus: string,
) {
  const search = adminPage.getByPlaceholder('Search products...');
  await search.fill(productName);
  await adminPage.getByRole('button', { name: 'Find', exact: true }).click();
  const row = adminPage.locator('tbody tr').filter({ hasText: productName }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(String(expectedQty), { exact: true })).toBeVisible();
  await expect(row.getByText(expectedStatus, { exact: true })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('stock deduction for pickup/delivery + alerts', () => {
  test.use({
    geolocation: NUGEGODA,
    permissions: ['geolocation'],
  });

  test.beforeEach(async ({ page }) => {
    await skipEcoPromo(page);
  });

  test('pickup cash order deducts stock; admin UI shows updated qty', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);

    // H1: CASH_AT_COUNTER (pickup) deducts weeklyRemainingQty on order create
    // H2: Branch Stock table mirrors API remaining qty + status labels

    const token = await adminLogin(request);
    await loginAsCustomer(page);
    await choosePickupAtNugegoda(page);

    const productName = await addFirstAvailableProduct(page);
    const before = await fetchBranchStock(request, token);
    const baseline = before.items.find((i) => i.name.toLowerCase() === productName.toLowerCase());
    expect(baseline, `no stock row for ${productName}`).toBeTruthy();
    // Keep cash path under online threshold and safely above low-stock band
    await setRemainingQty(request, token, baseline!.productId, 40);
    const qtyBefore = 40;

    await goCheckout(page, productName);
    const placed = await placeOrderFromCheckout(page, true);
    expect(placed.orderMode).toBe('TAKEAWAY');
    expect(placed.paymentMethod).toBe('CASH_AT_COUNTER');

    await expect
      .poll(async () => {
        const after = await fetchBranchStock(request, token);
        return after.items.find((r) => r.productId === placed.productId)?.weeklyRemainingQty ?? null;
      })
      .toBe(qtyBefore - placed.quantity);

    const afterItem = (await fetchBranchStock(request, token)).items.find(
      (r) => r.productId === placed.productId,
    )!;

    const adminPage = await loginBranchAdminUi(browser);
    await assertStockRow(
      adminPage,
      productName,
      afterItem.weeklyRemainingQty,
      expectedQtyStatus(afterItem),
    );

    await adminPage.context().close();
  });

  test('delivery online: stock deducts only after successful payment', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    // H3: Online delivery order does NOT deduct until payment succeeds
    // H4: Successful payment-notify deducts stock once

    const token = await adminLogin(request);
    await loginAsCustomer(page);
    await chooseDeliveryNearNugegoda(page);

    const productName = await addFirstAvailableProduct(page);
    const before = await fetchBranchStock(request, token);
    const baseline = before.items.find((i) => i.name.toLowerCase() === productName.toLowerCase());
    expect(baseline).toBeTruthy();
    await setRemainingQty(request, token, baseline!.productId, 40);
    const qtyBefore = 40;

    await goCheckout(page, productName);
    const placed = await placeOrderFromCheckout(page, false);
    expect(placed.orderMode).toBe('DELIVERY');
    expect(['PAYHERE', 'CARD']).toContain(placed.paymentMethod);

    // Immediately after create — stock must be unchanged (pending online payment)
    const mid = await fetchBranchStock(request, token);
    const midItem = mid.items.find((r) => r.productId === placed.productId)!;
    expect(midItem.weeklyRemainingQty).toBe(qtyBefore);

    await notifyPayment(request, placed.orderNumber, placed.total, true);

    await expect
      .poll(async () => {
        const after = await fetchBranchStock(request, token);
        return after.items.find((r) => r.productId === placed.productId)?.weeklyRemainingQty ?? null;
      })
      .toBe(qtyBefore - placed.quantity);

  });

  test('failed online payment does not deduct stock', async ({ page, request }) => {
    test.setTimeout(180_000);

    // H5: Failed payment-notify leaves weeklyRemainingQty unchanged

    const token = await adminLogin(request);
    await loginAsCustomer(page);
    await chooseDeliveryNearNugegoda(page);

    const productName = await addFirstAvailableProduct(page);
    const before = await fetchBranchStock(request, token);
    const baseline = before.items.find((i) => i.name.toLowerCase() === productName.toLowerCase());
    expect(baseline).toBeTruthy();
    await setRemainingQty(request, token, baseline!.productId, 40);
    const qtyBefore = 40;

    await goCheckout(page, productName);
    const placed = await placeOrderFromCheckout(page, false);
    expect(['PAYHERE', 'CARD']).toContain(placed.paymentMethod);

    await notifyPayment(request, placed.orderNumber, placed.total, false);

    // Poll to ensure no delayed finalize/deduct path mutates stock after failure
    await expect
      .poll(async () => {
        const after = await fetchBranchStock(request, token);
        return after.items.find((r) => r.productId === placed.productId)?.weeklyRemainingQty ?? null;
      })
      .toBe(qtyBefore);

    const afterItem = (await fetchBranchStock(request, token)).items.find(
      (r) => r.productId === placed.productId,
    )!;

  });

  test('low stock and out of stock warnings appear for branch admin', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(240_000);

    // H6: Crossing ≤25 remaining emits Low stock toast for branch admin
    // H7: Crossing ≤5 remaining emits Out of Stock toast + UI status

    const token = await adminLogin(request);
    const adminPage = await loginBranchAdminUi(browser);

    await loginAsCustomer(page);
    await choosePickupAtNugegoda(page);
    const productName = await addFirstAvailableProduct(page);
    const before = await fetchBranchStock(request, token);
    const baseline = before.items.find((i) => i.name.toLowerCase() === productName.toLowerCase());
    expect(baseline).toBeTruthy();
    const productId = baseline!.productId;

    // --- Low stock: start at 26, order 1 cash → 25 ---
    await setRemainingQty(request, token, productId, LOW_STOCK_THRESHOLD + 1);
    await goCheckout(page, productName);
    const lowOrder = await placeOrderFromCheckout(page, true);
    expect(lowOrder.paymentMethod).toBe('CASH_AT_COUNTER');

    await expect
      .poll(async () => {
        const after = await fetchBranchStock(request, token);
        return after.items.find((r) => r.productId === productId)?.weeklyRemainingQty ?? null;
      })
      .toBe(LOW_STOCK_THRESHOLD);

    await expect(
      adminPage.getByText(/Low stock:/i).filter({ hasText: new RegExp(productName, 'i') }).first(),
    ).toBeVisible({ timeout: 20_000 });

    await assertStockRow(adminPage, productName, LOW_STOCK_THRESHOLD, 'Low stock');

    // --- Out of stock: start at 6, order 1 cash → 5 ---
    await setRemainingQty(request, token, productId, OUT_OF_STOCK_THRESHOLD + 1);

    // Fresh cart/order for the same product
    await page.goto('/menu');
    const menuPage = new MenuPage(page);
    await expect(menuPage.availableProductCards().filter({ hasText: productName }).first()).toBeVisible({
      timeout: 30_000,
    });
    // Prefer ordering the same product if still available
    const sameCard = menuPage.availableProductCards().filter({ hasText: productName }).first();
    if (await sameCard.isVisible().catch(() => false)) {
      await sameCard.click();
      await menuPage.addDefaultCustomizationToCart();
    } else {
      await addFirstAvailableProduct(page);
    }

    await goCheckout(page, productName);
    const oosOrder = await placeOrderFromCheckout(page, true);
    expect(oosOrder.paymentMethod).toBe('CASH_AT_COUNTER');

    await expect
      .poll(async () => {
        const after = await fetchBranchStock(request, token);
        return after.items.find((r) => r.productId === productId)?.weeklyRemainingQty ?? null;
      })
      .toBe(OUT_OF_STOCK_THRESHOLD);

    await expect(
      adminPage
        .getByText(/is now Out of Stock/i)
        .filter({ hasText: new RegExp(productName, 'i') })
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    await assertStockRow(adminPage, productName, OUT_OF_STOCK_THRESHOLD, 'Out of stock');

    // Restore stock so later runs / other tests are not stuck OOS
    await setRemainingQty(request, token, productId, 50);
    await adminPage.context().close();
  });
});
