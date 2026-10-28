import { Router, type Request, type Response, type NextFunction } from 'express';
import authRoutes from './auth';
import menuRoutes from './menu';
import storeRoutes from './stores';
import cartRoutes from './cart';
import orderRoutes from './orders';
import refundRoutes from './refunds';
import addressRoutes from './addresses';
import promoRoutes from './promos';
import adminRoutes from './admin';
import settingsRoutes from './settings';
import paymentsRoutes from './payments';
import notificationsRoutes from './notifications';
import deliveryRoutes from './delivery';
import loyaltyRoutes from './loyalty';
import internalRoutes from './internal';
import wishlistRoutes from './wishlist';
import inventoryRoutes from './inventoryReservations';
import spinRoutes from './spin';
import messagingRoutes from './messaging';
import { resolveApiSurface, type ApiSurface } from '../lib/apiSurface';
import {
  ADMIN_ORDERS,
  MENU_READ,
  POS_ADMIN,
  POS_ORDERS,
  SHOP_AUTH,
  SHOP_LOYALTY,
  SHOP_MENU,
  SHOP_ORDERS,
  SHOP_PROMOS,
  SHOP_SETTINGS,
  SHOP_SPIN,
  SHOP_STORES,
  STAFF_AUTH,
  assertSurfacePrefixes,
  prefixesFor,
  type RouteRule,
} from './surfacePolicy';

export type { ApiSurface } from '../lib/apiSurface';
export { resolveApiSurface, resolveRunBackgroundJobs } from '../lib/apiSurface';
export { assertSurfacePrefixes, prefixesFor, surfaceAllows } from './surfacePolicy';

function allow(rules: readonly RouteRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS' || req.method === 'HEAD') return next();
    const path = req.path || '/';
    const method = req.method.toUpperCase();
    const ok = rules.some((rule) => rule.methods.includes(method) && rule.pattern.test(path));
    if (!ok) {
      res.status(404).json({ success: false, message: 'Route not found' });
      return;
    }
    next();
  };
}

/** Cashier placement on the POS process cannot create a customer web order. */
function requirePosChannel(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST' || (req.path !== '/' && req.path !== '')) return next();
  const channel = String((req.body as { channel?: unknown } | undefined)?.channel ?? '').toUpperCase();
  if (channel !== 'POS') {
    res.status(403).json({
      success: false,
      message: 'This service only accepts POS orders',
      code: 'SURFACE_FORBIDDEN',
    });
    return;
  }
  next();
}

function mount(router: Router, prefix: string, handler: Router, rules?: readonly RouteRule[], extra?: (req: Request, res: Response, next: NextFunction) => void) {
  if (rules) {
    router.use(prefix, allow(rules), ...(extra ? [extra] : []), handler);
    return;
  }
  router.use(prefix, handler);
}

export function createApiRouter(surface: ApiSurface = resolveApiSurface()): Router {
  const prefixes = prefixesFor(surface);
  assertSurfacePrefixes(surface, prefixes);
  const router = Router();

  if (surface === 'core') {
    router.use('/auth', authRoutes);
    router.use('/menu', menuRoutes);
    router.use('/stores', storeRoutes);
    router.use('/cart', cartRoutes);
    router.use('/orders', orderRoutes);
    router.use('/refunds', refundRoutes);
    router.use('/addresses', addressRoutes);
    router.use('/promos', promoRoutes);
    router.use('/admin', adminRoutes);
    router.use('/settings', settingsRoutes);
    router.use('/payments', paymentsRoutes);
    router.use('/notifications', notificationsRoutes);
    router.use('/delivery', deliveryRoutes);
    router.use('/loyalty', loyaltyRoutes);
    router.use('/internal', internalRoutes);
    router.use('/wishlist', wishlistRoutes);
    router.use('/inventory', inventoryRoutes);
    router.use('/spin', spinRoutes);
    router.use('/', messagingRoutes);
    return router;
  }

  if (surface === 'shop') {
    mount(router, '/auth', authRoutes, SHOP_AUTH);
    mount(router, '/menu', menuRoutes, SHOP_MENU);
    mount(router, '/stores', storeRoutes, SHOP_STORES);
    mount(router, '/cart', cartRoutes);
    mount(router, '/orders', orderRoutes, SHOP_ORDERS);
    mount(router, '/addresses', addressRoutes);
    mount(router, '/promos', promoRoutes, SHOP_PROMOS);
    mount(router, '/settings', settingsRoutes, SHOP_SETTINGS);
    mount(router, '/payments', paymentsRoutes);
    mount(router, '/notifications', notificationsRoutes);
    mount(router, '/loyalty', loyaltyRoutes, SHOP_LOYALTY);
    mount(router, '/wishlist', wishlistRoutes);
    mount(router, '/inventory', inventoryRoutes);
    mount(router, '/spin', spinRoutes, SHOP_SPIN);
    mount(router, '/', messagingRoutes);
    return router;
  }

  if (surface === 'pos') {
    mount(router, '/auth', authRoutes, STAFF_AUTH);
    mount(router, '/menu', menuRoutes, MENU_READ);
    mount(router, '/stores', storeRoutes, SHOP_STORES);
    mount(router, '/orders', orderRoutes, POS_ORDERS, requirePosChannel);
    mount(router, '/settings', settingsRoutes, SHOP_SETTINGS);
    mount(router, '/admin', adminRoutes, POS_ADMIN);
    return router;
  }

  mount(router, '/auth', authRoutes, STAFF_AUTH);
  mount(router, '/menu', menuRoutes);
  mount(router, '/stores', storeRoutes);
  mount(router, '/orders', orderRoutes, ADMIN_ORDERS);
  mount(router, '/refunds', refundRoutes);
  mount(router, '/promos', promoRoutes);
  mount(router, '/admin', adminRoutes);
  mount(router, '/settings', settingsRoutes);
  mount(router, '/loyalty', loyaltyRoutes);
  mount(router, '/spin', spinRoutes);
  return router;
}
