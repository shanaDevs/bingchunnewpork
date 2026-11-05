import type { AuthKind, RouteEntry } from './routeCatalog';
import { loadRouteCatalog } from './routeCatalog';
import {
  ID,
  isList,
  isRawResponse,
  responseKind,
  sampleRequest,
  sampleResponseBody,
  successStatus,
} from './samples';

export type OpenApiSpec = {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
};

const TAGS: { name: string; description: string }[] = [
  { name: 'Health', description: 'Process liveness and object-storage reachability. No auth.' },
  { name: 'Auth', description: 'Customer, staff, and driver sign-in. Passwords in samples are placeholders.' },
  { name: 'Menu', description: 'Categories, products, toppings, ratings, and daily specials.' },
  { name: 'Stores', description: 'Branches, delivery validation, and address lookup.' },
  { name: 'Cart', description: 'Signed-in customer cart.' },
  { name: 'Orders', description: 'Place, track, and fulfil delivery and takeaway orders.' },
  { name: 'Addresses', description: 'Saved customer delivery addresses.' },
  { name: 'Promos', description: 'Public promo preview and admin promo management. Checkout recomputes discounts.' },
  { name: 'Payments', description: 'PayHere and WebXPay checkout pages. Session is JSON; other routes return HTML.' },
  { name: 'Notifications', description: 'Customer notifications and FCM device tokens.' },
  { name: 'Wishlist', description: 'Customer wishlist and public share links.' },
  { name: 'Loyalty', description: 'Points summary and the admin loyalty campaign.' },
  { name: 'Spin', description: 'Spin-the-wheel offers and plays.' },
  { name: 'Inventory', description: 'Checkout stock reservations. Payment callbacks require the internal secret.' },
  { name: 'Settings', description: 'Public app settings and system-admin configuration.' },
  { name: 'Refunds', description: 'Branch refund queue. Cashiers are blocked.' },
  { name: 'Admin', description: 'Staff shell: branch open/close and shared admin reads.' },
  { name: 'Admin payments', description: 'Settlements, invoices, and payment history.' },
  { name: 'Admin reports', description: 'Sales, brand, and platform earnings reports.' },
  { name: 'Admin stock', description: 'Branch stock, batches, and the movement ledger.' },
  { name: 'Admin wallet', description: 'Branch wallets, withdrawals, and the Jason ledger. Amounts are LKR.' },
  { name: 'Admin delivery', description: 'Jobs, riders, and delivery access. The delivery microservice remounts these under /delivery-api/admin.' },
  { name: 'Admin users', description: 'Staff accounts, roles, cashiers, and customer profiles.' },
  { name: 'Delivery', description: 'Driver app routes on this API. When DELIVERY_SERVICE_ENABLED=true they are proxied to the delivery microservice.' },
  { name: 'Delivery service', description: 'Routes served by the delivery microservice on port 4100. Try it out uses that server.' },
  { name: 'Messaging', description: 'Telegram webhook. WhatsApp settings live under Settings and Admin.' },
  { name: 'Internal', description: 'Service-to-service calls. Send header x-internal-secret.' },
];

const AUTH_TEXT: Record<AuthKind, string> = {
  Public: 'Public — no JWT',
  Optional: 'Optional — guest allowed, or Authorization: Bearer <customer access token>',
  Customer: 'Customer — Authorization: Bearer <access token> (JWT type=user)',
  Admin: 'Admin — Authorization: Bearer <access token> (JWT type=admin)',
  Driver: 'Driver — Authorization: Bearer <access token> (role DELIVERY_DRIVER)',
  Internal: 'Internal — header x-internal-secret: <INTERNAL_SERVICE_SECRET>',
};

function tagFor(path: string): string {
  if (path === '/' || path.startsWith('/health') || path.startsWith('/api/health')) return 'Health';
  if (path.startsWith('/delivery-api')) return 'Delivery service';
  if (path.startsWith('/api/auth')) return 'Auth';
  if (path.startsWith('/api/menu')) return 'Menu';
  if (path.startsWith('/api/stores')) return 'Stores';
  if (path.startsWith('/api/cart')) return 'Cart';
  if (path.startsWith('/api/orders')) return 'Orders';
  if (path.startsWith('/api/addresses')) return 'Addresses';
  if (path.startsWith('/api/promos')) return 'Promos';
  if (path.startsWith('/api/payments')) return 'Payments';
  if (path.startsWith('/api/notifications')) return 'Notifications';
  if (path.startsWith('/api/wishlist')) return 'Wishlist';
  if (path.startsWith('/api/loyalty')) return 'Loyalty';
  if (path.startsWith('/api/spin')) return 'Spin';
  if (path.startsWith('/api/inventory')) return 'Inventory';
  if (path.startsWith('/api/settings')) return 'Settings';
  if (path.startsWith('/api/refunds')) return 'Refunds';
  if (path.startsWith('/api/delivery')) return 'Delivery';
  if (path.startsWith('/api/telegram')) return 'Messaging';
  if (path.startsWith('/api/internal')) return 'Internal';
  if (path.startsWith('/api/admin/wallet') || path.startsWith('/api/admin/jason')) return 'Admin wallet';
  if (path.startsWith('/api/admin/stock')) return 'Admin stock';
  if (path.startsWith('/api/admin/reports') || path.startsWith('/api/admin/platform-earnings')) return 'Admin reports';
  if (
    path.startsWith('/api/admin/payment') ||
    path.startsWith('/api/admin/invoices') ||
    path.startsWith('/api/admin/spaces') ||
    path.startsWith('/api/admin/settlement') ||
    path.startsWith('/api/admin/invoice')
  ) {
    return 'Admin payments';
  }
  if (
    path.startsWith('/api/admin/delivery') ||
    path.startsWith('/api/admin/drivers') ||
    path.startsWith('/api/admin/driver') ||
    path.startsWith('/api/admin/live-drivers') ||
    path.startsWith('/api/admin/branches') ||
    path.startsWith('/api/admin/stores/delivery') ||
    path.startsWith('/api/admin/delivery-wallet') ||
    path.startsWith('/api/admin/delivery-jobs') ||
    path.startsWith('/api/admin/delivery-failures')
  ) {
    return 'Admin delivery';
  }
  if (
    path.startsWith('/api/admin/users') ||
    path.startsWith('/api/admin/roles') ||
    path.startsWith('/api/admin/cashiers') ||
    path.startsWith('/api/admin/branch-managers') ||
    path.startsWith('/api/admin/customers') ||
    path.startsWith('/api/admin/me') ||
    path.startsWith('/api/admin/messaging')
  ) {
    return 'Admin users';
  }
  if (path.startsWith('/api/admin')) return 'Admin';
  return 'Admin';
}

export function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function summaryFor(route: RouteEntry): string {
  const tail = route.path
    .replace(/:[A-Za-z0-9_]+/g, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/-/g, ' ');
  const verb: Record<RouteEntry['method'], string> = {
    GET: 'Get',
    POST: 'Create',
    PUT: 'Replace',
    PATCH: 'Update',
    DELETE: 'Delete',
  };
  if (!tail || tail === 'api') return `${verb[route.method]} ${route.path}`;
  return `${verb[route.method]} ${tail}`;
}

function operationId(route: RouteEntry): string {
  const slug = route.path
    .replace(/^\//, '')
    .replace(/[:{}]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${route.method.toLowerCase()}_${slug}`;
}

const PARAM_EXAMPLES: Record<string, string> = {
  id: ID.order,
  storeId: ID.store,
  productId: ID.product,
  itemId: '12121212-1212-4121-8121-121212121212',
  orderId: ID.order,
  orderNumber: 'BC-10482',
  withdrawalId: ID.withdrawal,
  settlementId: '16161616-1616-4161-8161-161616161616',
  transactionId: '17171717-1717-4171-8171-171717171717',
  batchId: '18181818-1818-4181-8181-181818181818',
  riderId: ID.driver,
  externalUserId: '94771234567',
  token: 'share_7f3a9c',
  uuid: ID.reservation,
  yearMonth: '2026-11',
  month: '2026-11',
  status: 'CANCELLED',
  filename: 'receipt-2026-11.pdf',
  attemptId: '19191919-1919-4191-8191-191919191919',
};

function pathParameters(expressPath: string) {
  const params = expressPath.match(/:([A-Za-z0-9_]+)/g) ?? [];
  return params.map((raw) => {
    const name = raw.slice(1);
    return {
      name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
      example: PARAM_EXAMPLES[name] ?? ID.order,
    };
  });
}

function queryParameters(route: RouteEntry) {
  if (route.method !== 'GET' && route.method !== 'POST') return [];
  const params: Record<string, unknown>[] = [];
  const push = (name: string, example: string | number, description: string) => {
    params.push({
      name,
      in: 'query',
      required: false,
      description,
      schema: { type: typeof example === 'number' ? 'integer' : 'string' },
      example,
    });
  };
  if (isList(route)) {
    push('page', 1, 'Page number, starting at 1');
    push('limit', 20, 'Page size');
  }
  if (/report|ledger|audit|analytics|payment-history|earnings|wallet|refund|stock/.test(route.path)) {
    push('from', '2026-11-01', 'Range start (YYYY-MM-DD)');
    push('to', '2026-11-04', 'Range end (YYYY-MM-DD)');
  }
  if (
    route.path.startsWith('/api/admin') &&
    !route.path.includes(':storeId') &&
    /stock|wallet|reports|payment-history|customers|orders/.test(route.path)
  ) {
    push('storeId', ID.store, 'Branch id. System admins pass this; branch staff are scoped to their store.');
  }
  if (route.path.endsWith('/stats')) push('period', '7d', 'today | 7d | 30d | all');
  if (route.path.startsWith('/api/orders/') && route.auth === 'Optional') {
    push('trackToken', 'trk_8f3c1a', 'Guest tracking token from the order response');
  }
  if (route.path === '/api/stores/address/autocomplete' || route.path === '/api/stores/address/geocode') {
    push('q', 'High Level Road Nugegoda', 'Address text');
  }
  if (route.path === '/api/stores/address/reverse') {
    push('lat', '6.8649', 'Latitude');
    push('lng', '79.8997', 'Longitude');
  }
  if (route.path.startsWith('/api/inventory/availability')) {
    push('storeId', ID.store, 'Branch id');
    push('productId', ID.product, 'Product id');
  }
  return params;
}

function securityFor(auth: AuthKind): unknown[] | undefined {
  if (auth === 'Public') return [];
  if (auth === 'Optional') return [{ bearerAuth: [] }, {}];
  if (auth === 'Internal') return [{ internalSecret: [] }];
  return [{ bearerAuth: [] }];
}

function errorResponses(route: RouteEntry): Record<string, unknown> {
  const refs: Record<string, unknown> = {
    '400': { $ref: '#/components/responses/BadRequest' },
    '422': { $ref: '#/components/responses/ValidationError' },
  };
  if (route.auth !== 'Public') refs['401'] = { $ref: '#/components/responses/Unauthorized' };
  if (route.auth === 'Admin' || route.auth === 'Driver' || route.auth === 'Internal') {
    refs['403'] = { $ref: '#/components/responses/Forbidden' };
  }
  if (route.path.includes(':')) refs['404'] = { $ref: '#/components/responses/NotFound' };
  return refs;
}

function requestBody(route: RouteEntry): Record<string, unknown> | undefined {
  const sample = sampleRequest(route);
  const content: Record<string, unknown> = {};
  if (sample !== undefined && !(route.multipart && route.method === 'DELETE')) {
    content['application/json'] = {
      schema: { type: 'object', example: sample },
      example: sample,
    };
  }
  if (route.multipart) {
    const properties: Record<string, unknown> = {};
    for (const field of route.multipartFields) {
      properties[field] = { type: 'string', format: 'binary', description: 'Upload this file in the multipart body' };
    }
    if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
      for (const [k, v] of Object.entries(sample as Record<string, unknown>)) {
        if (!properties[k]) properties[k] = { type: typeof v === 'number' ? 'number' : 'string', example: v };
      }
    }
    content['multipart/form-data'] = {
      schema: { type: 'object', properties },
    };
  }
  if (!Object.keys(content).length) return undefined;
  return {
    required: route.method !== 'DELETE',
    description: 'Sample body. Replace ids and secrets with values from your environment.',
    content,
  };
}

function successResponse(route: RouteEntry): Record<string, unknown> {
  const kind = responseKind(route.path);
  if (kind === 'pdf') {
    return {
      description: 'PDF file download',
      content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
    };
  }
  if (kind === 'html') {
    return {
      description: 'HTML checkout or return page. Open it in a browser; it is not a JSON envelope.',
      content: { 'text/html': { schema: { type: 'string' }, example: '<!doctype html><title>Bing Chun checkout</title>' } },
    };
  }
  const example = sampleResponseBody(route);
  const status = successStatus(route);
  return {
    description: status === '201' ? 'Created' : 'Success',
    content: {
      'application/json': {
        schema: isRawResponse(route)
          ? { type: 'object', example }
          : { $ref: '#/components/schemas/SuccessEnvelope' },
        example,
      },
    },
  };
}

function buildOperation(route: RouteEntry, deliveryBase: string): Record<string, unknown> {
  const lines = [AUTH_TEXT[route.auth]];
  if (route.permission) lines.push(`Permission: ${route.permission}`);
  if (route.notes.length) lines.push(route.notes.join('. ') + '.');
  lines.push('Example values below are sample data for calling this API. They are not live records.');
  const status = successStatus(route);
  const op: Record<string, unknown> = {
    tags: [tagFor(route.path)],
    summary: summaryFor(route),
    description: lines.join('\n\n'),
    operationId: operationId(route),
    security: securityFor(route.auth),
    parameters: [...pathParameters(route.path), ...queryParameters(route)],
    responses: {
      [status]: successResponse(route),
      ...errorResponses(route),
    },
  };
  const body = requestBody(route);
  if (body) op.requestBody = body;
  if (route.server === 'delivery') {
    op.servers = [{ url: deliveryBase, description: 'Delivery microservice' }];
  }
  return op;
}

export function coreServerUrl(): string {
  const port = process.env.PORT || '4000';
  return process.env.API_BASE_URL || process.env.PUBLIC_API_URL || `http://localhost:${port}`;
}

export function deliveryServerUrl(): string {
  const port = process.env.DELIVERY_PORT || '4100';
  return process.env.DELIVERY_SERVICE_URL || `http://localhost:${port}`;
}

export function buildOpenApiSpec(routes: RouteEntry[] = loadRouteCatalog()): OpenApiSpec {
  const deliveryBase = deliveryServerUrl();
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const openPath = toOpenApiPath(route.path);
    const bucket = paths[openPath] ?? {};
    bucket[route.method.toLowerCase()] = buildOperation(route, deliveryBase);
    paths[openPath] = bucket;
  }
  const orderedPaths = Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)));
  return {
    openapi: '3.0.3',
    info: {
      title: 'Bing Chun API',
      version: '1.0.0',
      description: [
        'Full Bing Chun HTTP API: customer shop, POS, admin, driver app, and the delivery microservice.',
        '',
        'This server documents the **core** surface (`API_SURFACE=core`), which mounts every route. Shop, POS, and admin processes expose a subset of the same paths.',
        '',
        '**Download PDF:** use the **Download PDF** button in the top bar, or open `/api/docs/bingchun-api.pdf`.',
        '',
        '**Call an API:** open an operation, click **Try it out**. Request bodies, path params, and query params are prefilled with sample data. Send `Authorization: Bearer <token>` after **Authorize**. Customer, admin, and driver tokens are different logins (`/api/auth/login`, `/api/auth/admin/login`, `/api/auth/delivery/login`).',
        '',
        'Success JSON is `{ "success": true, "data": ... }`. Lists add `meta: { total, page, limit, pages }`. Errors are `{ "success": false, "message": "...", "details": null }`.',
        '',
        'Socket.io connects to the same host. Client events: `trackOrder` (order id), `joinUser` (user id), `joinAdmin` (`{ adminId, storeId? }`).',
        '',
        `Sample branch \`${ID.store}\`, product \`${ID.product}\`, order \`${ID.order}\` (\`BC-10482\`), customer phone \`0771234567\`.`,
      ].join('\n'),
    },
    servers: [
      { url: coreServerUrl(), description: 'Core API (this process)' },
      { url: deliveryBase, description: 'Delivery microservice' },
    ],
    tags: TAGS,
    paths: orderedPaths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from customer, admin, or driver login.',
        },
        internalSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'x-internal-secret',
          description: 'Shared secret for /api/internal and reservation payment callbacks.',
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { description: 'Payload. Shape depends on the operation; see the example.' },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer', example: 1 },
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 20 },
                pages: { type: 'integer', example: 1 },
              },
            },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Invalid promo code' },
            details: { nullable: true, example: null },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'Business rule or bad request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorEnvelope' },
              example: { success: false, message: 'Store is closed for ordering', details: null },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorEnvelope' },
              example: { success: false, message: 'Unauthorized', details: null },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated but not allowed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorEnvelope' },
              example: { success: false, message: 'Forbidden', details: null },
            },
          },
        },
        NotFound: {
          description: 'Record not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorEnvelope' },
              example: { success: false, message: 'Not found', details: null },
            },
          },
        },
        ValidationError: {
          description: 'Request body failed validation',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorEnvelope' },
              example: {
                success: false,
                message: 'Validation failed',
                details: [{ path: 'phone', message: 'Invalid Sri Lankan phone number' }],
              },
            },
          },
        },
      },
    },
  };
}

let cached: OpenApiSpec | null = null;

export function getOpenApiSpec(): OpenApiSpec {
  if (!cached) cached = buildOpenApiSpec();
  return cached;
}
