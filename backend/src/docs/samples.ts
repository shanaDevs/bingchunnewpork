import type { RouteEntry } from './routeCatalog';

/** Stable sample identifiers used in every example payload. */
export const ID = {
  store: '11111111-1111-4111-8111-111111111111',
  product: '22222222-2222-4222-8222-222222222222',
  category: '33333333-3333-4333-8333-333333333333',
  topping: '44444444-4444-4444-8444-444444444444',
  user: '55555555-5555-4555-8555-555555555555',
  order: '66666666-6666-4666-8666-666666666666',
  address: '77777777-7777-4777-8777-777777777777',
  promo: '88888888-8888-4888-8888-888888888888',
  job: '99999999-9999-4999-8999-999999999999',
  withdrawal: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  admin: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reservation: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  driver: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

const AT = '2026-11-04T10:15:00.000Z';

const store = {
  id: ID.store,
  name: 'Bing Chun Nugegoda',
  city: 'Nugegoda',
  district: 'Colombo',
  addressLine: '12 High Level Road, Nugegoda',
  phone: '0112345678',
  lat: 6.8649,
  lng: 79.8997,
  isOpen: true,
  deliveryEnabled: true,
};

const category = {
  id: ID.category,
  name: 'Milk tea',
  sortOrder: 1,
  isActive: true,
};

const topping = {
  id: ID.topping,
  name: 'Brown sugar pearls',
  price: 100,
  isAvailable: true,
};

const product = {
  id: ID.product,
  categoryId: ID.category,
  name: 'Brown Sugar Boba Milk',
  description: 'Classic milk tea with brown sugar pearls',
  ingredients: 'Milk, tea, brown sugar, tapioca',
  basePrice: 890,
  cost: 320,
  tag: 'BESTSELLER',
  isAvailable: true,
  isDeliveryAvailable: true,
  imageUrl: 'https://cdn.example.com/products/brown-sugar-boba.jpg',
  sortOrder: 1,
  toppingIds: [ID.topping],
};

const user = {
  id: ID.user,
  name: 'Amal Perera',
  phone: '0771234567',
  email: 'amal@example.com',
  points: 240,
};

const adminUser = {
  id: ID.admin,
  name: 'Nugegoda Manager',
  email: 'nugegoda@bingchun.lk',
  role: 'BRANCH_MANAGER',
  storeId: ID.store,
  storeName: 'Bing Chun Nugegoda',
  storeCity: 'Nugegoda',
};

const address = {
  id: ID.address,
  label: 'Home',
  addressLine: '45 Stanley Tilakaratne Mawatha',
  city: 'Nugegoda',
  district: 'Colombo',
  lat: 6.8632,
  lng: 79.9011,
  isDefault: true,
};

const orderItem = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  productId: ID.product,
  name: 'Brown Sugar Boba Milk',
  size: 'LARGE',
  quantity: 2,
  unitPrice: 890,
  lineTotal: 1780,
  toppingIds: [ID.topping],
};

const order = {
  id: ID.order,
  orderNumber: 'BC-10482',
  status: 'RECEIVED',
  orderMode: 'DELIVERY',
  channel: 'WEB',
  paymentMethod: 'CASH_AT_COUNTER',
  paymentStatus: 'PENDING',
  storeId: ID.store,
  store,
  userId: ID.user,
  guestName: 'Amal Perera',
  guestPhone: '0771234567',
  guestEmail: 'amal@example.com',
  address,
  subtotal: 1780,
  discount: 0,
  loyaltyDiscount: 0,
  deliveryFee: 250,
  convenientFee: 0,
  total: 2030,
  notes: 'Less ice',
  items: [orderItem],
  createdAt: AT,
};

const tokens = {
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.customer.access',
  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.customer.refresh',
};

const cart = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  items: [
    {
      id: '12121212-1212-4121-8121-121212121212',
      productId: ID.product,
      name: 'Brown Sugar Boba Milk',
      size: 'REGULAR',
      quantity: 1,
      unitPrice: 790,
      toppingIds: [],
    },
  ],
  subtotal: 790,
};

const promo = {
  id: ID.promo,
  code: 'BOBA10',
  title: '10% off milk tea',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  minOrderValue: 1000,
  isActive: true,
  expiresAt: '2026-12-31T18:29:59.000Z',
  ownership: 'PLATFORM',
};

const job = {
  id: ID.job,
  status: 'ASSIGNED',
  rideCode: 'R-204',
  storeId: ID.store,
  driverId: ID.driver,
  cups: 4,
  deliveryFee: 250,
  estimatedMinutes: 28,
  estimatedDistanceKm: 4.6,
  canComplete: false,
  orders: [
    {
      id: ID.order,
      orderNumber: 'BC-10482',
      customerName: 'Amal Perera',
      customerPhone: '0771234567',
      addressLine: address.addressLine,
      city: 'Nugegoda',
      district: 'Colombo',
      lat: 6.8632,
      lng: 79.9011,
      total: 2030,
      status: 'OUT_FOR_DELIVERY',
    },
  ],
};

const wallet = {
  storeId: ID.store,
  storeName: 'Bing Chun Nugegoda',
  balance: 185000,
  currency: 'LKR',
  pendingWithdrawal: 0,
};

const withdrawal = {
  id: ID.withdrawal,
  storeId: ID.store,
  amount: 50000,
  status: 'PENDING',
  periodDays: 15,
  from: '2026-10-21',
  to: '2026-11-04',
  remarks: 'Fortnight payout',
  createdAt: AT,
};

const notification = {
  id: '13131313-1313-4131-8131-131313131313',
  title: 'Order received',
  body: 'BC-10482 was received at Bing Chun Nugegoda',
  read: false,
  orderId: ID.order,
  createdAt: AT,
};

const refund = {
  id: '14141414-1414-4141-8141-141414141414',
  orderId: ID.order,
  orderNumber: 'BC-10482',
  amount: 2030,
  status: 'REQUESTED',
  reason: 'Customer cancelled before preparation',
};

const stockRow = {
  productId: ID.product,
  name: 'Brown Sugar Boba Milk',
  onHand: 48,
  reserved: 2,
  available: 46,
  cost: 320,
  basePrice: 890,
};

const reportBlock = {
  from: '2026-11-01',
  to: '2026-11-04',
  storeId: ID.store,
  orderCount: 86,
  grossSales: 214500,
  netSales: 198750,
  currency: 'LKR',
};

const loyaltySummary = {
  points: 240,
  settings: { pointsPerLkr: 1, redeemValue: 1, maxRedeemPct: 50, minOrderToEarn: 500 },
  transactions: [
    { id: 'txn-1', type: 'EARN', points: 20, orderNumber: 'BC-10482', createdAt: AT },
  ],
};

const driverStats = {
  period: { key: '7d', from: '2026-10-28T00:00:00.000Z', to: '2026-11-04T10:15:00.000Z' },
  totals: {
    completedRuns: 18,
    deliveredStops: 42,
    totalDistanceKm: 96.4,
    earningsLkr: 8400,
    onlineMinutes: 1870,
    attendanceDays: 6,
    averagePickupMinutes: 7,
    averageDeliveryMinutes: 34,
  },
  rating: { average: 4.8, count: 12, recent: [{ stars: 5, comment: 'On time', createdAt: AT }] },
  merit: { points: 88, status: 'GOOD', recent: [] },
};

const keyOf = (route: Pick<RouteEntry, 'method' | 'path'>) => `${route.method} ${route.path}`;

const REQUESTS: Record<string, unknown> = {
  'POST /api/auth/register': {
    name: 'Amal Perera',
    phone: '0771234567',
    email: 'amal@example.com',
    password: 'Secret123',
    referralCode: 'AMAL24',
  },
  'POST /api/auth/login': { phone: '0771234567', password: 'Secret123' },
  'POST /api/auth/phone/login': { phone: '0771234567', name: 'Amal Perera', email: 'amal@example.com' },
  'POST /api/auth/phone/check': { phone: '0771234567' },
  'POST /api/auth/google': { idToken: 'google-id-token-from-the-client' },
  'POST /api/auth/facebook': { accessToken: 'facebook-user-access-token' },
  'POST /api/auth/otp/request': { phone: '0771234567', intent: 'login' },
  'POST /api/auth/otp/verify': { phone: '0771234567', code: '123456', intent: 'login', name: 'Amal Perera' },
  'POST /api/auth/refresh': { refreshToken: tokens.refreshToken },
  'POST /api/auth/password/forgot': { email: 'amal@example.com' },
  'POST /api/auth/password/reset': { token: 'reset-token-from-the-email', password: 'NewSecret123' },
  'PUT /api/auth/me': { name: 'Amal Perera', email: 'amal@example.com' },
  'POST /api/auth/phone/link/request': { phone: '0771234567' },
  'POST /api/auth/phone/link/verify': { phone: '0771234567', code: '123456' },
  'POST /api/auth/admin/login': { email: 'nugegoda@bingchun.lk', password: 'Secret123' },
  'POST /api/auth/admin/refresh': { refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.refresh' },
  'POST /api/auth/admin/password/forgot': { email: 'nugegoda@bingchun.lk' },
  'POST /api/auth/admin/password/reset': { token: 'admin-reset-token', password: 'NewSecret123' },
  'POST /api/auth/delivery/otp/request': { phone: '0779876543' },
  'POST /api/auth/delivery/login': { phone: '0779876543', code: '123456', challenge: 'otp-challenge-from-request' },
  'POST /delivery-api/auth/login': { phone: '0779876543', code: '123456', challenge: 'otp-challenge-from-request' },
  'POST /delivery-api/auth/refresh': { refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.driver.refresh' },
  'POST /api/menu/categories': { name: 'Milk tea', sortOrder: 1 },
  'PUT /api/menu/categories/:id': { name: 'Milk tea', sortOrder: 1 },
  'POST /api/menu/toppings': { name: 'Brown sugar pearls', price: 100, isAvailable: true },
  'PUT /api/menu/toppings/:id': { name: 'Brown sugar pearls', price: 120, isAvailable: true },
  'POST /api/menu/toppings/bulk-assign': { toppingIds: [ID.topping], productIds: [ID.product] },
  'POST /api/menu/products': {
    categoryId: ID.category,
    name: 'Brown Sugar Boba Milk',
    basePrice: 890,
    cost: 320,
    description: 'Classic milk tea with brown sugar pearls',
    ingredients: 'Milk, tea, brown sugar, tapioca',
    isAvailable: true,
    isDeliveryAvailable: true,
    sortOrder: 1,
    toppingIds: [ID.topping],
  },
  'PUT /api/menu/products/:id': { name: 'Brown Sugar Boba Milk', basePrice: 950, isAvailable: true },
  'POST /api/menu/products/:id/rating': { stars: 5, comment: 'Best boba in Nugegoda' },
  'POST /api/menu/specials': { productId: ID.product, label: 'Today only', discountPrice: 750 },
  'POST /api/stores': {
    name: 'Bing Chun Nugegoda',
    city: 'Nugegoda',
    district: 'Colombo',
    addressLine: '12 High Level Road, Nugegoda',
    phone: '0112345678',
    lat: 6.8649,
    lng: 79.8997,
  },
  'PUT /api/stores/:id': { phone: '0112345678', isOpen: true },
  'POST /api/stores/validate-delivery': { lat: 6.8632, lng: 79.9011, addressLine: address.addressLine },
  'POST /api/stores/zones': { storeId: ID.store, name: 'Nugegoda core', radiusKm: 4 },
  'POST /api/cart/items': { productId: ID.product, size: 'REGULAR', toppingIds: [ID.topping], quantity: 1 },
  'PUT /api/cart/items/:itemId': { quantity: 2, size: 'LARGE', toppingIds: [] },
  'POST /api/orders': {
    orderMode: 'DELIVERY',
    storeId: ID.store,
    addressId: ID.address,
    items: [{ productId: ID.product, size: 'LARGE', toppingIds: [ID.topping], quantity: 2 }],
    deliveryAddress: {
      addressLine: '45 Stanley Tilakaratne Mawatha',
      city: 'Nugegoda',
      district: 'Colombo',
      lat: 6.8632,
      lng: 79.9011,
    },
    paymentMethod: 'CASH_AT_COUNTER',
    promoCode: 'BOBA10',
    usePoints: 0,
    notes: 'Less ice',
    guestName: 'Amal Perera',
    guestPhone: '0771234567',
    guestEmail: 'amal@example.com',
    channel: 'WEB',
  },
  'PUT /api/orders/takeaway-queue/reorder': { orderIds: [ID.order], storeId: ID.store },
  'POST /api/orders/:id/confirm-payment': { trackToken: 'trk_8f3c1a', orderNumber: 'BC-10482' },
  'POST /api/orders/:id/confirm-payhere-popup': { trackToken: 'trk_8f3c1a', status: 'success' },
  'POST /api/orders/:id/rating': { stars: 5, comment: 'Hot and on time' },
  'POST /api/orders/:id/rider-rating': { stars: 5, comment: 'Polite rider' },
  'POST /api/orders/:id/cancel': { cancellationReason: 'CHANGED_MIND', customReasonText: 'Ordered from the wrong branch' },
  'PUT /api/orders/:id/status': { status: 'PREPARING', note: 'Started the drinks' },
  'PATCH /api/orders/:id/contact': { guestName: 'Amal Perera', guestPhone: '0771234567' },
  'PUT /api/orders/:id/items': { items: [{ productId: ID.product, size: 'REGULAR', toppingIds: [], quantity: 1 }] },
  'POST /api/orders/:id/collect-payment': { collectPayment: true, paymentMethod: 'CASH', cashReceivedAmount: 2000 },
  'POST /api/orders/payment-notify': {
    merchant_id: '123456',
    order_id: 'BC-10482',
    payment_id: '320045001234',
    payhere_amount: '2030.00',
    payhere_currency: 'LKR',
    status_code: '2',
    md5sig: 'payhere-md5-signature',
    status_message: 'Successfully received the payment',
  },
  'POST /api/addresses': {
    label: 'Home',
    addressLine: '45 Stanley Tilakaratne Mawatha',
    city: 'Nugegoda',
    district: 'Colombo',
    lat: 6.8632,
    lng: 79.9011,
    isDefault: true,
  },
  'PUT /api/addresses/:id': { label: 'Office', isDefault: false },
  'POST /api/promos/validate': { code: 'BOBA10', orderTotal: 1780 },
  'POST /api/promos/eligible': { orderTotal: 1780, storeId: ID.store },
  'POST /api/promos/admin': {
    code: 'BOBA10',
    title: '10% off milk tea',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    minOrderValue: 1000,
    isActive: true,
    expiresAt: '2026-12-31T18:29:59.000Z',
    ownership: 'PLATFORM',
    storeIds: [ID.store],
  },
  'PUT /api/promos/admin/:id': { isActive: false },
  'PUT /api/promos/admin/reorder': { ids: [ID.promo] },
  'POST /api/promos/admin/bulk-delete': { ids: [ID.promo] },
  'POST /api/promos/admin/bulk-status': { ids: [ID.promo], isActive: true },
  'PUT /api/settings/app': { appName: 'Bing Chun', supportPhone: '0112345678' },
  'PUT /api/settings/payment': { payhereEnabled: true, cashOnDeliveryEnabled: true },
  'PUT /api/settings/messaging': { whatsappEnabled: true },
  'POST /api/settings/delivery-zones': { name: 'Nugegoda', storeId: ID.store, fee: 250 },
  'PUT /api/settings/delivery-zones/:id': { fee: 300 },
  'PUT /api/settings/loyalty-program': { pointsPerLkr: 1, redeemValue: 1, maxRedeemPct: 50, minOrderToEarn: 500 },
  'PUT /api/settings/branch-ordering-hours': { storeId: ID.store, openTime: '10:00', closeTime: '22:00' },
  'PUT /api/settings/platform-discount-payback': { enabled: true },
  'POST /api/settings/cancel-reasons': { code: 'CHANGED_MIND', label: 'Changed my mind', isActive: true },
  'PUT /api/settings/order-status-refunds/:status': { refundPct: 100 },
  'POST /api/notifications/fcm-token': { token: 'fcm-device-token', platform: 'android' },
  'DELETE /api/notifications/fcm-token': { token: 'fcm-device-token' },
  'POST /api/notifications/read-order': { orderId: ID.order },
  'POST /api/admin/notifications/read-order': { orderId: ID.order },
  'PATCH /api/delivery/me/duty': { onDuty: true },
  'POST /api/delivery/me/fcm-token': { token: 'fcm-device-token', platform: 'android' },
  'POST /api/delivery/me/complaints': { orderId: ID.order, message: 'Customer was not at the gate' },
  'POST /api/delivery/me/branch-requests': { toStoreId: ID.store, note: 'Can cover Nugegoda this evening' },
  'PATCH /api/delivery/me/notifications/:id/read': {},
  'POST /api/delivery/me/notifications/read-all': {},
  'POST /api/delivery/locations/batch': {
    jobId: ID.job,
    points: [{ lat: 6.8649, lng: 79.8997, accuracyM: 8, speedKph: 22, heading: 90, recordedAt: AT, jobId: ID.job }],
  },
  'POST /api/delivery/jobs/:id/pickup': { lat: 6.8649, lng: 79.8997 },
  'POST /api/delivery/jobs/:id/start': { lat: 6.8649, lng: 79.8997 },
  'POST /api/delivery/jobs/:id/complete': { lat: 6.8649, lng: 79.8997 },
  'POST /api/delivery/jobs/:id/reject': { reason: 'Too far from my current stop' },
  'POST /api/delivery/jobs/vehicle-failure': { jobId: ID.job, lat: 6.86, lng: 79.9, note: 'Flat tyre' },
  'PUT /api/delivery/orders/:orderId/status': { status: 'DELIVERED', lat: 6.8632, lng: 79.9011 },
  'POST /api/inventory/reservations': {
    storeId: ID.store,
    items: [{ productId: ID.product, quantity: 2, productName: 'Brown Sugar Boba Milk' }],
  },
  'POST /api/inventory/checkout': {
    storeId: ID.store,
    items: [{ productId: ID.product, quantity: 2, productName: 'Brown Sugar Boba Milk' }],
    reservationUuid: ID.reservation,
  },
  'POST /api/inventory/reservations/payment-success': {
    orderId: ID.order,
    storeId: ID.store,
    items: [{ productId: ID.product, quantity: 2 }],
  },
  'POST /api/inventory/reservations/payment-failure': { orderId: ID.order, reservationUuid: ID.reservation },
  'POST /api/spin/play': { orderNumber: 'BC-10482' },
  'POST /api/spin/validate': { claimCode: 'SPIN-2048' },
  'POST /api/spin/admin/offers': {
    label: '10% off',
    offerType: 'PERCENTAGE',
    discountValue: 10,
    winRate: 120,
    color: '#307ef2',
    sortOrder: 1,
    isActive: true,
    minOrderValue: 0,
  },
  'PUT /api/loyalty/campaign': { name: 'November stamps', stampsRequired: 6, reward: 'Free regular milk tea' },
  'POST /api/admin/wallet/withdrawals': {
    amount: 50000,
    periodDays: 15,
    from: '2026-10-21',
    to: '2026-11-04',
    remarks: 'Fortnight payout',
    password: '1234',
  },
  'POST /api/admin/wallet/verify-pin': { password: '1234' },
  'POST /api/admin/wallet/withdrawals/:id/reject': { reason: 'Bank account name does not match' },
  'POST /api/admin/wallet/withdrawals/:id/approve': {
    paymentMethod: 'BANK_TRANSFER',
    password: '1234',
  },
  'POST /api/admin/wallet/:storeId/adjust': {
    type: 'ADJUSTMENT',
    amount: 1500,
    description: 'Correct a missed cash order',
    reference: 'BC-10482',
    direction: 'IN',
    password: '1234',
  },
  'POST /api/admin/wallet/:storeId/settle': { from: '2026-10-21', to: '2026-11-04', description: 'Fortnight settlement' },
  'POST /api/admin/wallet/:storeId/initiate-payout': {
    amount: 50000,
    periodDays: 15,
    from: '2026-10-21',
    to: '2026-11-04',
    remarks: 'Paid to the branch account',
    paymentMethod: 'BANK_TRANSFER',
    password: '1234',
    proofFileName: 'transfer.jpg',
    proofMimeType: 'image/jpeg',
    proofBase64: 'aGVsbG8=',
  },
  'POST /api/admin/branch/close': { reason: 'End of service' },
  'POST /api/admin/branch/open': {},
  'POST /api/admin/stock/reset': { storeId: ID.store, note: 'Morning count' },
  'POST /api/admin/stock/bulk-restock': {
    storeId: ID.store,
    lines: [{ productId: ID.product, quantity: 24, cost: 320 }],
  },
  'POST /api/admin/stock/:productId/batches': { quantity: 24, cost: 320, note: 'Morning delivery' },
  'PATCH /api/admin/stock/:productId': { quantity: 40 },
  'POST /api/admin/stock/:productId/topup': { quantity: 12, note: 'Extra pearls' },
  'PATCH /api/admin/stock/:productId/settings': { lowStockThreshold: 8 },
  'POST /api/admin/users': {
    name: 'Kasun Silva',
    email: 'kasun@bingchun.lk',
    password: 'Secret123',
    role: 'CASHIER',
    storeId: ID.store,
  },
  'PATCH /api/admin/users/:id': { name: 'Kasun Silva', isActive: true },
  'PUT /api/admin/users/:id/permissions': { permissions: [{ menu: 'ORDERS', actions: ['read', 'update'] }] },
  'PUT /api/admin/users/:id/stores': { storeIds: [ID.store] },
  'POST /api/admin/roles': { name: 'AUDITOR', permissions: [{ menu: 'REPORTS', actions: ['read'] }] },
  'PUT /api/admin/roles/:id': { name: 'AUDITOR' },
  'POST /api/admin/branch-managers': {
    name: 'Nugegoda Manager',
    email: 'nugegoda@bingchun.lk',
    password: 'Secret123',
    storeId: ID.store,
  },
  'POST /api/admin/cashiers': {
    name: 'Kasun Silva',
    email: 'kasun@bingchun.lk',
    password: 'Secret123',
    storeId: ID.store,
  },
  'POST /api/admin/jason': { type: 'EXPENSE', amount: 2500, description: 'Ice delivery', storeId: ID.store },
  'PATCH /api/admin/jason/:id': { isActive: false },
  'POST /api/admin/customers/:id/ban': { reason: 'Repeated unpaid cash orders' },
  'POST /api/admin/drivers': { name: 'Sunil Fernando', phone: '0779876543', storeId: ID.store, pin: '1234' },
  'PATCH /api/admin/drivers/:id': { name: 'Sunil Fernando', isActive: true },
  'POST /api/admin/delivery/classify': { orderIds: [ID.order] },
  'POST /api/admin/delivery/preview-route': { storeId: ID.store, orderIds: [ID.order] },
  'POST /api/admin/delivery-jobs': { storeId: ID.store, orderIds: [ID.order] },
  'PATCH /api/admin/stores/:id/delivery-access': { deliveryEnabled: true },
  'PATCH /api/admin/driver-complaints/:id': { status: 'RESOLVED', note: 'Spoke to the customer' },
  'PATCH /api/admin/driver-branch-requests/:id': { status: 'APPROVED' },
  'POST /api/admin/delivery-wallet/unlock': { password: '1234' },
  'POST /api/admin/delivery-wallet/payouts': { driverId: ID.driver, amount: 8400, password: '1234' },
  'POST /api/admin/delivery-wallet/payouts/:id/reject': { reason: 'Duplicate payout' },
  'POST /api/admin/platform-earnings/:yearMonth/settle': { note: 'November platform settlement' },
  'PUT /api/refunds/:id/status': { status: 'APPROVED' },
  'POST /api/internal/delivery/order-status': { orderId: ID.order, status: 'DELIVERED' },
  'POST /api/internal/delivery/send-code': { orderId: ID.order },
  'POST /api/internal/socket/emit': { room: `order:${ID.order}`, event: 'orderUpdated', payload: { status: 'PREPARING' } },
  'POST /api/telegram/webhook': { update_id: 1001, message: { text: 'menu', chat: { id: 555001 } } },
  'POST /delivery-api/orders/:orderId/otp/verify': { code: '482913' },
  'POST /delivery-api/orders/:orderId/arrive': { lat: 6.8632, lng: 79.9011 },
  'POST /delivery-api/orders/:orderId/attempt': { reason: 'NO_ANSWER', note: 'Called twice' },
  'POST /delivery-api/me/complaints': { orderId: ID.order, message: 'Gate was locked' },
  'POST /delivery-api/locations/batch': {
    jobId: ID.job,
    points: [{ lat: 6.8649, lng: 79.8997, recordedAt: AT }],
  },
};

const RESPONSES: Record<string, unknown> = {
  'POST /api/auth/register': { ...tokens, user },
  'POST /api/auth/login': { ...tokens, user },
  'POST /api/auth/phone/login': { ...tokens, user },
  'POST /api/auth/phone/check': { exists: true, phone: '0771234567' },
  'POST /api/auth/google': { ...tokens, user },
  'POST /api/auth/facebook': { ...tokens, user },
  'POST /api/auth/otp/request': { sent: true, phone: '0771234567' },
  'POST /api/auth/otp/verify': { ...tokens, user },
  'POST /api/auth/refresh': { ...tokens, user },
  'GET /api/auth/me': user,
  'POST /api/auth/logout': { loggedOut: true },
  'POST /api/auth/logout-all': { loggedOut: true },
  'GET /api/auth/social-config': { googleEnabled: true, facebookEnabled: true },
  'POST /api/auth/admin/login': {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.access',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.refresh',
    admin: adminUser,
  },
  'POST /api/auth/admin/refresh': {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.access',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.refresh',
    admin: adminUser,
  },
  'GET /api/auth/admin/socket-token': { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin.access' },
  'POST /api/auth/delivery/otp/request': { sent: true, challenge: 'otp-challenge-from-request' },
  'POST /api/auth/delivery/login': {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.driver.access',
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.driver.refresh',
    admin: { ...adminUser, id: ID.driver, role: 'DELIVERY_DRIVER', name: 'Sunil Fernando' },
  },
  'GET /api/loyalty/summary': loyaltySummary,
  'GET /api/delivery/me/stats': driverStats,
  'GET /delivery-api/me/stats': driverStats,
  'GET /api/admin/dashboard': {
    ordersToday: 86,
    salesToday: 214500,
    pendingOrders: 7,
    currency: 'LKR',
    storeId: ID.store,
  },
  'POST /api/promos/validate': {
    valid: true,
    authoritative: false,
    notice: 'Preview only. POST /api/orders recomputes the discount.',
    code: 'BOBA10',
    discount: 178,
    orderTotal: 1780,
  },
  'GET /api/payments/payhere/:orderNumber/session': {
    orderNumber: 'BC-10482',
    merchantId: '123456',
    amount: '2030.00',
    currency: 'LKR',
    sandbox: true,
  },
};

const RAW: Record<string, unknown> = {
  'GET /': {
    status: 'ok',
    surface: 'core',
    timestamp: AT,
    rateLimitStore: 'memory',
    socketAdapter: 'memory',
    backgroundJobs: true,
    buildTag: 'cors-surface-web-2026-10-26',
  },
  'GET /health': {
    status: 'ok',
    surface: 'core',
    timestamp: AT,
    rateLimitStore: 'memory',
    socketAdapter: 'memory',
    backgroundJobs: true,
    buildTag: 'cors-surface-web-2026-10-26',
  },
  'GET /health/spaces': { service: 'spaces', timestamp: AT, configured: true, reachable: true },
  'GET /api/health/spaces': { service: 'spaces', timestamp: AT, configured: true, reachable: true },
  'GET /delivery-api/admin/health': { success: true, service: 'delivery-admin', status: 'ok' },
};

const SINGLETON_TAILS = new Set([
  'me', 'summary', 'dashboard', 'eligibility', 'social-config', 'app', 'payment', 'preview',
  'geocode', 'reverse', 'autocomplete', 'today', 'analysis', 'my-claim', 'discount-report',
  'settle-info', 'settle-preview', 'net-preview', 'payout-period-info', 'pending-withdrawal',
  'socket-token', 'active', 'stats', 'whatsapp-status', 'branch-operating-status',
  'invariant-check', 'batch-preview', 'campaign', 'messaging', 'payment-methods',
  'loyalty-program', 'branch-ordering-hours', 'platform-discount-payback', 'permissions',
  'delivery-dashboard', 'driver-analytics', 'brand-analytics', 'branch-analytics',
  'branch-tier-analytics', 'brand-branch-performance', 'top-branches-channel-breakdown',
  'hourly-peak-heatmap', 'customer-loyalty', 'order-fulfillment', 'order-cancellations',
  'wallet-ledger', 'sales', 'top-products', 'top-customers', 'cashier-activity', 'route',
  'actual-route', 'live-route', 'pricing', 'movement-ledger', 'session', 'report', 'ids',
  'health', 'status',
]);

const ACTION_TAIL =
  /(validate|login|logout|logout-all|refresh|check|verify|request|play|cancel|approve|reject|sync|open|close|settle|classify|claim|assign|start|pickup|complete|reorder|confirm-payment|confirm-payhere-popup|collect-payment|complete-takeaway|read-all|read-order|topup|reset|bulk-restock|bulk-delete|bulk-status|upload|upload-image|payment-notify|payment-success|payment-failure|expire|checkout|unlock|ban|restore|reply|re-ring|reassign|adjust|initiate-payout|verify-pin|webhook|notify|resend|arrive|attempt|duty|fcm-token|share|forgot|link)$/;

export function routeKey(route: Pick<RouteEntry, 'method' | 'path'>): string {
  return keyOf(route);
}

export function responseKind(path: string): 'json' | 'html' | 'pdf' {
  if (path.includes('/invoices/')) return 'pdf';
  if (path.startsWith('/api/payments/') && !path.endsWith('/session')) return 'html';
  return 'json';
}

export function isList(route: Pick<RouteEntry, 'method' | 'path'>): boolean {
  if (route.method !== 'GET') return false;
  if (/:[A-Za-z0-9_]+$/.test(route.path)) return false;
  const tail = route.path.split('/').filter(Boolean).pop() ?? '';
  if (SINGLETON_TAILS.has(tail)) return false;
  if (RAW[keyOf(route)]) return false;
  return true;
}

export function successStatus(route: Pick<RouteEntry, 'method' | 'path'>): '200' | '201' {
  if (route.method === 'POST' && !ACTION_TAIL.test(route.path)) return '201';
  return '200';
}

function sampleEntity(path: string): Record<string, unknown> {
  const p = path.toLowerCase();
  if (p.includes('withdrawal')) return withdrawal;
  if (p.includes('refund')) return refund;
  if (p.includes('notification')) return notification;
  if (p.includes('delivery-job') || p.includes('/jobs')) return job;
  if (p.includes('driver')) return { id: ID.driver, name: 'Sunil Fernando', phone: '0779876543', storeId: ID.store, onDuty: true };
  if (p.includes('wishlist')) return { productIds: [ID.product], items: [product] };
  if (p.includes('cart')) return cart;
  if (p.includes('promo') || p.includes('offer') || p.includes('/spin')) return promo;
  if (p.includes('address')) return address;
  if (p.includes('topping')) return topping;
  if (p.includes('categor')) return category;
  if (p.includes('product') || p.includes('special')) return product;
  if (p.includes('order')) return order;
  if (p.includes('stock') || p.includes('batch') || p.includes('inventory')) return stockRow;
  if (p.includes('wallet') || p.includes('payout') || p.includes('settlement') || p.includes('earning')) return wallet;
  if (p.includes('loyalty')) return loyaltySummary;
  if (p.includes('customer') || p.includes('/users') || p.endsWith('/me')) return user;
  if (p.includes('cashier') || p.includes('branch-manager') || p.includes('admin')) return adminUser;
  if (p.includes('role')) return { id: '15151515-1515-4151-8151-151515151515', name: 'BRANCH_MANAGER' };
  if (p.includes('store') || p.includes('branch') || p.includes('zone')) return store;
  if (p.includes('report') || p.includes('analytics') || p.includes('dashboard') || p.includes('ledger')) return reportBlock;
  return { id: ID.order, updatedAt: AT };
}

function writable(entity: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['id', 'createdAt', 'updatedAt', 'orderNumber', 'status', 'paymentStatus', 'store', 'user', 'items']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (skip.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : { note: 'Sample update' };
}

function actionBody(path: string): unknown | undefined {
  if (path.endsWith('/cancel')) return { reason: 'Customer changed their mind' };
  if (path.endsWith('/reject')) return { reason: 'Does not match the payout period' };
  if (path.endsWith('/approve')) return { paymentMethod: 'BANK_TRANSFER', password: '1234' };
  if (path.endsWith('/close')) return { reason: 'End of service' };
  if (path.endsWith('/open') || path.endsWith('/sync') || path.endsWith('/read-all')) return {};
  if (path.endsWith('/rating') || path.endsWith('/rider-rating')) return { stars: 5, comment: 'Excellent' };
  if (path.endsWith('/complete') || path.endsWith('/pickup') || path.endsWith('/start') || path.endsWith('/arrive')) {
    return { lat: 6.8649, lng: 79.8997 };
  }
  if (path.endsWith('/claim') || path.endsWith('/assign') || path.endsWith('/re-ring')) return {};
  if (path.endsWith('/ban')) return { reason: 'Abuse of cash orders' };
  if (path.endsWith('/restore')) return {};
  if (path.endsWith('/unlock') || path.endsWith('/verify-pin')) return { password: '1234' };
  if (path.endsWith('/play')) return { orderNumber: 'BC-10482' };
  if (path.endsWith('/validate')) return { code: 'BOBA10', orderTotal: 1780 };
  return undefined;
}

export function sampleRequest(route: RouteEntry): unknown | undefined {
  if (route.method === 'GET') return undefined;
  const preset = REQUESTS[keyOf(route)];
  if (preset !== undefined) return preset;
  const action = actionBody(route.path);
  if (action !== undefined && route.method === 'POST') return action;
  if (route.method === 'DELETE') return undefined;
  if (route.multipart && route.multipartFields.length && preset === undefined && action === undefined) {
    return undefined;
  }
  return writable(sampleEntity(route.path));
}

export function sampleResponseBody(route: RouteEntry): unknown {
  const key = keyOf(route);
  if (RAW[key] !== undefined) return RAW[key];
  const data = RESPONSES[key] !== undefined ? RESPONSES[key] : responseData(route);
  if (isList(route) && Array.isArray(data)) {
    return { success: true, data, meta: { total: data.length, page: 1, limit: 20, pages: 1 } };
  }
  return { success: true, data };
}

function responseData(route: RouteEntry): unknown {
  if (route.method === 'DELETE') return { deleted: true };
  const entity = sampleEntity(route.path);
  if (isList(route)) return [entity];
  if (route.method === 'POST' && ACTION_TAIL.test(route.path)) return { ok: true };
  return entity;
}

export function isRawResponse(route: RouteEntry): boolean {
  return RAW[keyOf(route)] !== undefined;
}
