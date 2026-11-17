import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { verifyAdminPin } from '../lib/verifyAdminPin';
import {
  getPaymentSettings,
  getEnabledMethodsForCheckout,
  updatePaymentSettings,
  PICKUP_ONLINE_PAYMENT_THRESHOLD,
  isActiveOnlineGatewayConfigured,
  type PaymentMethodConfig,
  type OnlineGateway,
} from '../lib/paymentSettings';
import {
  ensureAppSchema,
  getConvenienceFeeRates,
  getConvenientFeeRate,
  getGatewayFeeRate,
  getCommissionSlabs,
  setCommissionSlabs,
  invalidateCommissionSlabsCache,
  getDeliveryPlatformFeeRate,
  setDeliveryPlatformFeeRate,
  getMaxCupsPerRider,
  invalidatePickupOrderEditSettingsCache,
  invalidateGatewayFeeRateCache,
  invalidateDeliveryPlatformFeeRateCache,
  setMaxCupsPerRider,
  getAppDownloadSettings,
  setAppDownloadSettings,
  getWeeklyResetDay,
  setWeeklyResetDay,
  getSpinSettings,
  setSpinSettings,
  getCancelWindowMinutes,
  setCancelWindowMinutes,
  invalidateCancelWindowMinutesCache,
  getBranchCompletionRadiusM,
  setBranchCompletionRadiusM,
  getPickupMaxOrderAmount,
  setPickupMaxOrderAmount,
  invalidatePickupMaxOrderAmountCache,
} from '../lib/appSchema';
import { getGoogleMapsBrowserApiKey, setGoogleMapsApiKey } from '../lib/googleMapsKey';
import { parseSpinCriteria, parseSpinDisplay } from '../lib/spinDisplay';
import {
  getActiveCancelReasons,
  getAllCancelReasons,
  getCancelReasonById,
  getCancelReasonByValue,
  createCancelReasonRow,
  updateCancelReasonRow,
  normalizeCancelReasonValue,
} from '../lib/cancelReasonConfig';
import {
  assertCancellableOrderStatus,
  CANCELLABLE_ORDER_STATUSES,
  getAllOrderStatusRefundConfigs,
  upsertOrderStatusRefundConfig,
} from '../lib/orderStatusRefundConfig';
import {
  getDeliveryMilestoneSettings,
  invalidateDeliveryMilestoneSettingsCache,
  setDeliveryMilestoneSettings,
  validateMilestoneSettings,
} from '../lib/deliveryAccessMilestones';
import { buildLoyaltyProgramConfig } from '../lib/loyaltyProgram';
import {
  fetchLoyaltySettingRow,
  rowToLoyaltyFields,
  upsertLoyaltySettingRow,
} from '../lib/loyaltySettingStore';
import { getWhatsAppAdminView, updateWhatsAppSettings } from '../lib/messagingSettings';
import { getSmsAdminView, updateSmsSettings } from '../lib/smsSettings';
import { requireBranchStoreId } from '../middleware/auth';
import { resolveStoreOrderingHours } from '../lib/storeOrderingHours';
import { fetchStoreOrderingHours, fetchOrderingHoursMap, updateStoreOrderingHours } from '../lib/storeOrderingSchema';
import { broadcastBranchOperating } from '../lib/socket';
import { ensurePlatformPaybackSchema } from '../lib/platformPaybackSchema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function getPublicPaymentMethods(req: Request, res: Response, next: NextFunction) {
  try {
    const orderMode = z.enum(['DELIVERY', 'TAKEAWAY']).parse(req.query.orderMode);
    const orderSubtotal =
      req.query.orderSubtotal != null
        ? z.coerce.number().nonnegative().parse(req.query.orderSubtotal)
        : undefined;
    const methods = await getEnabledMethodsForCheckout(orderMode, orderSubtotal);
    const settings = await getPaymentSettings();
    const feeRates = await getConvenienceFeeRates();
    const convenientFeeRate =
      orderMode === 'TAKEAWAY' ? feeRates.pickup : feeRates.delivery;
    const gatewayConfigured = isActiveOnlineGatewayConfigured(settings);
    return success(res, {
      methods,
      activeOnlineGateway: settings.activeOnlineGateway,
      payhereSandbox: settings.payhere.mode === 'sandbox',
      payhereConfigured: settings.payhere.configured,
      payhereMerchantIdSet: Boolean(settings.payhere.merchantId),
      webxpaySandbox: settings.webxpay.mode === 'sandbox',
      webxpayConfigured: settings.webxpay.configured,
      onlineGatewayConfigured: gatewayConfigured,
      convenientFeeRate,
      convenientFeePercent: Math.round(convenientFeeRate * 1000) / 10,
      pickupConvenientFeeRate: feeRates.pickup,
      pickupConvenientFeePercent: Math.round(feeRates.pickup * 1000) / 10,
      deliveryConvenientFeeRate: feeRates.delivery,
      deliveryConvenientFeePercent: Math.round(feeRates.delivery * 1000) / 10,
      pickupOnlinePaymentThreshold: PICKUP_ONLINE_PAYMENT_THRESHOLD,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminPaymentSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getPaymentSettings();
    return success(res, {
      methods: settings.methods,
      activeOnlineGateway: settings.activeOnlineGateway,
      payhere: {
        merchantId: settings.payhere.merchantId,
        merchantSecretSet: Boolean(settings.payhere.merchantSecret && settings.payhere.merchantSecret !== 'mock_secret'),
        mode: settings.payhere.mode,
        configured: settings.payhere.configured,
      },
      webxpay: {
        publicKeySet: Boolean(settings.webxpay.publicKey),
        secretKeySet: Boolean(settings.webxpay.secretKey && settings.webxpay.secretKey !== 'mock_secret'),
        apiUsername: settings.webxpay.apiUsername,
        apiPasswordSet: Boolean(settings.webxpay.apiPassword),
        mode: settings.webxpay.mode,
        returnUrl: settings.webxpay.returnUrl,
        configured: settings.webxpay.configured,
      },
    });
  } catch (err) {
    next(err);
  }
}

const updateSchema = z.object({
  paymentMethods: z.record(z.string(), z.object({
    enabled: z.boolean(),
    label: z.string().min(1),
    icon: z.string().optional(),
    modes: z.array(z.enum(['DELIVERY', 'TAKEAWAY'])),
  })).optional(),
  activeOnlineGateway: z.enum(['PAYHERE', 'WEBXPAY']).optional(),
  payhereMerchantId: z.string().optional(),
  payhereMerchantSecret: z.string().optional(),
  payhereMode: z.enum(['sandbox', 'live']).optional(),
  webxpayPublicKey: z.string().optional(),
  webxpaySecretKey: z.string().optional(),
  webxpayApiUsername: z.string().optional(),
  webxpayApiPassword: z.string().optional(),
  webxpayMode: z.enum(['sandbox', 'live']).optional(),
  webxpayReturnUrl: z.string().optional(),
  password: z.string().min(1, 'PIN is required'),
});

export async function updateAdminPaymentSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateSchema.parse(req.body);
    await verifyAdminPin(req.user?.sub, data.password);
    const updated = await updatePaymentSettings({
      paymentMethods: (data.paymentMethods || {}) as Record<string, PaymentMethodConfig>,
      activeOnlineGateway: data.activeOnlineGateway as OnlineGateway | undefined,
      payhereMerchantId: data.payhereMerchantId,
      payhereMerchantSecret: data.payhereMerchantSecret,
      payhereMode: data.payhereMode,
      webxpayPublicKey: data.webxpayPublicKey,
      webxpaySecretKey: data.webxpaySecretKey,
      webxpayApiUsername: data.webxpayApiUsername,
      webxpayApiPassword: data.webxpayApiPassword,
      webxpayMode: data.webxpayMode,
      webxpayReturnUrl: data.webxpayReturnUrl,
    });
    return success(res, {
      methods: updated.methods,
      activeOnlineGateway: updated.activeOnlineGateway,
      payhere: {
        merchantId: updated.payhere.merchantId,
        merchantSecretSet: Boolean(updated.payhere.merchantSecret),
        mode: updated.payhere.mode,
        configured: updated.payhere.configured,
      },
      webxpay: {
        publicKeySet: Boolean(updated.webxpay.publicKey),
        secretKeySet: Boolean(updated.webxpay.secretKey),
        apiUsername: updated.webxpay.apiUsername,
        apiPasswordSet: Boolean(updated.webxpay.apiPassword),
        mode: updated.webxpay.mode,
        returnUrl: updated.webxpay.returnUrl,
        configured: updated.webxpay.configured,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminMessagingSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const [whatsapp, sms] = await Promise.all([getWhatsAppAdminView(), getSmsAdminView()]);
    return success(res, { whatsapp, sms });
  } catch (err) {
    next(err);
  }
}

const updateMessagingSchema = z.object({
  whatsapp: z
    .object({
      enabled: z.boolean().optional(),
      accessToken: z.string().optional(),
      phoneNumberId: z.string().optional(),
      businessAccountId: z.string().optional(),
      verifyToken: z.string().optional(),
      callbackUrl: z.string().optional(),
      webhookUrl: z.string().optional(),
    })
    .optional(),
  sms: z
    .object({
      enabled: z.boolean().optional(),
      provider: z.enum(['smslenz', 'mock', 'dialog']).optional(),
      userId: z.string().optional(),
      apiKey: z.string().optional(),
      senderId: z.string().optional(),
      baseUrl: z.string().optional(),
      connectionTimeoutMs: z.number().int().positive().max(120000).optional(),
      readTimeoutMs: z.number().int().positive().max(120000).optional(),
    })
    .optional(),
});

export async function updateAdminMessagingSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateMessagingSchema.parse(req.body);
    const whatsapp = data.whatsapp
      ? await updateWhatsAppSettings({
          enabled: data.whatsapp.enabled,
          accessToken: data.whatsapp.accessToken,
          phoneNumberId: data.whatsapp.phoneNumberId,
          businessAccountId: data.whatsapp.businessAccountId,
          verifyToken: data.whatsapp.verifyToken,
          callbackUrl: data.whatsapp.callbackUrl,
          webhookUrl: data.whatsapp.webhookUrl,
        })
      : await getWhatsAppAdminView();
    const sms = data.sms
      ? await updateSmsSettings({
          enabled: data.sms.enabled,
          provider: data.sms.provider,
          userId: data.sms.userId,
          apiKey: data.sms.apiKey,
          senderId: data.sms.senderId,
          baseUrl: data.sms.baseUrl,
          connectionTimeoutMs: data.sms.connectionTimeoutMs,
          readTimeoutMs: data.sms.readTimeoutMs,
        })
      : await getSmsAdminView();
    return success(res, { whatsapp, sms });
  } catch (err) {
    next(err);
  }
}

export async function getAppSettings(_req: Request, res: Response, next: NextFunction) {
  // Maps must still get a key even when other settings reads fail on a lagging schema.
  let googleMapsApiKey = '';
  try {
    await ensureAppSchema();
    googleMapsApiKey = await getGoogleMapsBrowserApiKey();
    const [feeRates, row, maxCupsPerRider, , appDownload, weeklyResetDay, spinSettings, cancelWindowMinutes, gatewayFeeRate, deliveryPlatformFeeRate, branchCompletionRadiusM, commissionSlabs, pickupMaxOrderAmount] = await Promise.all([
      getConvenienceFeeRates(),
      prisma.appSetting.findUnique({ where: { id: 'default' } }),
      getMaxCupsPerRider(),
      getDeliveryMilestoneSettings(),
      getAppDownloadSettings(),
      getWeeklyResetDay(),
      getSpinSettings(),
      getCancelWindowMinutes(),
      getGatewayFeeRate(),
      getDeliveryPlatformFeeRate(),
      getBranchCompletionRadiusM(),
      getCommissionSlabs(),
      getPickupMaxOrderAmount(),
    ]);
    return success(res, {
      convenientFeeRate: feeRates.delivery,
      convenientFeePercent: Math.round(feeRates.delivery * 1000) / 10,
      pickupConvenientFeeRate: feeRates.pickup,
      pickupConvenientFeePercent: Math.round(feeRates.pickup * 1000) / 10,
      deliveryConvenientFeeRate: feeRates.delivery,
      deliveryConvenientFeePercent: Math.round(feeRates.delivery * 1000) / 10,
      gatewayFeeRate,
      gatewayFeePercent: Math.round(gatewayFeeRate * 1000) / 10,
      deliveryPlatformFeeRate,
      deliveryPlatformFeePercent: Math.round(deliveryPlatformFeeRate * 1000) / 10,
      commissionSlabs: commissionSlabs.map((slab) => ({
        upTo: slab.upTo,
        rate: slab.rate,
        ratePercent: Math.round(slab.rate * 1000) / 10,
        label: slab.label,
      })),
      pickupAllowAddItemsPaidOnline: row?.pickupAllowAddItemsPaidOnline ?? true,
      pickupAllowEditCashUnpaid: row?.pickupAllowEditCashUnpaid ?? true,
      maxCupsPerRider,
      branchCompletionRadiusM,
      requireAppDownload: appDownload.requireAppDownload,
      androidStoreUrl: appDownload.androidStoreUrl,
      iosStoreUrl: appDownload.iosStoreUrl,
      androidAppIconUrl: appDownload.androidAppIconUrl,
      iosAppIconUrl: appDownload.iosAppIconUrl,
      weeklyResetDay,
      spinDurationSeconds: spinSettings.spinDurationSeconds,
      spinsPerWindow: spinSettings.spinsPerWindow,
      spinWindowHours: spinSettings.spinWindowHours,
      spinEnabled: spinSettings.spinEnabled,
      spinRequireLogin: spinSettings.requireLogin,
      spinDisplay: spinSettings.display,
      cancelWindowMinutes,
      pickupMaxOrderAmount,
      googleMapsApiKey,
    });
  } catch (err) {
    if (googleMapsApiKey) {
      return success(res, { googleMapsApiKey });
    }
    try {
      googleMapsApiKey = await getGoogleMapsBrowserApiKey();
      if (googleMapsApiKey) return success(res, { googleMapsApiKey });
    } catch {
      // fall through
    }
    next(err);
  }
}

const appSettingsSchema = z.object({
  convenientFeeRate: z.number().min(0).max(1).optional(),
  pickupConvenientFeeRate: z.number().min(0).max(1).optional(),
  gatewayFeeRate: z.number().min(0).max(1).optional(),
  commissionSlabs: z
    .array(
      z.object({
        upTo: z.number().finite().min(0),
        rate: z.number().finite().min(0).max(1),
        label: z.string().max(120).optional(),
      }),
    )
    .min(2)
    .max(6)
    .optional(),
  deliveryPlatformFeeRate: z.number().min(0).max(1).optional(),
  pickupAllowAddItemsPaidOnline: z.boolean().optional(),
  pickupAllowEditCashUnpaid: z.boolean().optional(),
  maxCupsPerRider: z.number().int().min(1).max(100).optional(),
  branchCompletionRadiusM: z.number().int().min(20).max(2000).optional(),
  deliveryMilestone1Orders: z.number().int().min(1).optional(),
  deliveryMilestone2Orders: z.number().int().min(1).optional(),
  deliveryMilestone3Orders: z.number().int().min(1).optional(),
  requireAppDownload: z.boolean().optional(),
  androidStoreUrl: z.string().max(512).nullable().optional(),
  iosStoreUrl: z.string().max(512).nullable().optional(),
  androidAppIconUrl: z.string().max(512).nullable().optional(),
  iosAppIconUrl: z.string().max(512).nullable().optional(),
  weeklyResetDay: z.number().int().min(0).max(6).nullable().optional(),
  spinDurationSeconds: z.number().int().min(3).max(20).optional(),
  spinsPerWindow: z.number().int().min(1).max(10).optional(),
  spinWindowHours: z.number().int().min(1).max(720).optional(),
  spinTrackByIp: z.boolean().optional(),
  spinEnabled: z.boolean().optional(),
  spinFirstOrderOnly: z.boolean().optional(),
  spinRequireLogin: z.boolean().optional(),
  spinDaysOfWeek: z.array(z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])).optional(),
  spinTimeStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  spinTimeEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  spinStartsAt: z.string().datetime().nullable().optional(),
  spinExpiresAt: z.string().datetime().nullable().optional(),
  spinMaxPerDay: z.number().int().min(1).max(1000).nullable().optional(),
  spinMaxPerCustomer: z.number().int().min(1).max(10000).nullable().optional(),
  spinDisplay: z.object({
    autoPopup: z.boolean().optional(),
    showHeaderButton: z.boolean().optional(),
    showFab: z.boolean().optional(),
    popupPages: z.enum(['HOME', 'HOME_AND_ORDER', 'ALL']).optional(),
    loseAutoHideSeconds: z.number().min(0).max(30).optional(),
  }).optional(),
  spinCriteria: z.array(z.object({
    id: z.string().min(1).max(64).optional(),
    type: z.enum([
      'REQUIRE_LOGIN',
      'FIRST_ORDER_ONLY',
      'RETURNING_CUSTOMERS',
      'LOYALTY_JOURNEY',
      'MIN_ORDERS',
      'MIN_SPEND',
    ]),
    value: z.number().min(0).max(1_000_000).optional(),
  })).optional(),
  cancelWindowMinutes: z.number().int().min(1).max(120).optional(),
  pickupMaxOrderAmount: z.number().int().min(0).max(50_000_000).nullable().optional(),
  googleMapsApiKey: z.string().max(256).nullable().optional(),
  password: z.string().min(1).optional(),
});

export async function updateAppSettings(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureAppSchema();
    const data = appSettingsSchema.parse(req.body);
    const paymentSettingsPatch =
      data.convenientFeeRate !== undefined ||
      data.pickupConvenientFeeRate !== undefined ||
      data.gatewayFeeRate !== undefined ||
      data.deliveryPlatformFeeRate !== undefined ||
      data.commissionSlabs !== undefined;
    if (paymentSettingsPatch && req.user?.role === 'SYSTEM_ADMIN') {
      const password = data.password ?? '';
      await verifyAdminPin(req.user?.sub, password);
    }
    const {
      maxCupsPerRider,
      branchCompletionRadiusM,
      deliveryMilestone1Orders,
      deliveryMilestone2Orders,
      deliveryMilestone3Orders,
      requireAppDownload,
      androidStoreUrl,
      iosStoreUrl,
      androidAppIconUrl,
      iosAppIconUrl,
      weeklyResetDay,
      spinDurationSeconds,
      spinsPerWindow,
      spinWindowHours,
      spinTrackByIp,
      spinEnabled,
      spinFirstOrderOnly,
      spinRequireLogin,
      spinDaysOfWeek,
      spinTimeStart,
      spinTimeEnd,
      spinStartsAt,
      spinExpiresAt,
      spinMaxPerDay,
      spinMaxPerCustomer,
      spinDisplay,
      spinCriteria,
      cancelWindowMinutes,
      pickupMaxOrderAmount,
      deliveryPlatformFeeRate,
      commissionSlabs,
      googleMapsApiKey,
      password: _pinForVerification,
      ...prismaData
    } = data;

    const updated = await prisma.appSetting.upsert({
      where: { id: 'default' },
      update: prismaData,
      create: {
        id: 'default',
        convenientFeeRate: data.convenientFeeRate ?? 0.075,
        pickupConvenientFeeRate: data.pickupConvenientFeeRate ?? 0.06,
        gatewayFeeRate: data.gatewayFeeRate ?? 0.019,
        pickupAllowAddItemsPaidOnline: data.pickupAllowAddItemsPaidOnline ?? true,
        pickupAllowEditCashUnpaid: data.pickupAllowEditCashUnpaid ?? true,
      },
    });

    const savedMaxCups = maxCupsPerRider != null
      ? await setMaxCupsPerRider(maxCupsPerRider)
      : await getMaxCupsPerRider();

    const savedBranchCompletionRadiusM = branchCompletionRadiusM != null
      ? await setBranchCompletionRadiusM(branchCompletionRadiusM)
      : await getBranchCompletionRadiusM();

    const savedWeeklyResetDay = weeklyResetDay !== undefined
      ? await setWeeklyResetDay(weeklyResetDay)
      : await getWeeklyResetDay();

    let savedMilestones = await getDeliveryMilestoneSettings();
    if (
      deliveryMilestone1Orders != null ||
      deliveryMilestone2Orders != null ||
      deliveryMilestone3Orders != null
    ) {
      const nextMilestones = {
        milestone1: deliveryMilestone1Orders ?? savedMilestones.milestone1,
        milestone2: deliveryMilestone2Orders ?? savedMilestones.milestone2,
        milestone3: deliveryMilestone3Orders ?? savedMilestones.milestone3,
      };
      try {
        validateMilestoneSettings(nextMilestones);
      } catch (err) {
        throw new AppError(err instanceof Error ? err.message : 'Invalid milestone settings', 400);
      }
      savedMilestones = await setDeliveryMilestoneSettings(nextMilestones);
    }

    const hasAppDownloadPatch =
      requireAppDownload !== undefined ||
      androidStoreUrl !== undefined ||
      iosStoreUrl !== undefined ||
      androidAppIconUrl !== undefined ||
      iosAppIconUrl !== undefined;

    const savedAppDownload = hasAppDownloadPatch
      ? await setAppDownloadSettings({
          requireAppDownload,
          androidStoreUrl,
          iosStoreUrl,
          androidAppIconUrl,
          iosAppIconUrl,
        })
      : await getAppDownloadSettings();

    const hasSpinPatch =
      spinDurationSeconds !== undefined ||
      spinsPerWindow !== undefined ||
      spinWindowHours !== undefined ||
      spinTrackByIp !== undefined ||
      spinEnabled !== undefined ||
      spinFirstOrderOnly !== undefined ||
      spinRequireLogin !== undefined ||
      spinDaysOfWeek !== undefined ||
      spinTimeStart !== undefined ||
      spinTimeEnd !== undefined ||
      spinStartsAt !== undefined ||
      spinExpiresAt !== undefined ||
      spinMaxPerDay !== undefined ||
      spinMaxPerCustomer !== undefined ||
      spinDisplay !== undefined ||
      spinCriteria !== undefined;

    const savedSpin = hasSpinPatch
      ? await setSpinSettings({
          spinDurationSeconds,
          spinsPerWindow,
          spinWindowHours,
          spinTrackByIp,
          spinEnabled,
          firstOrderOnly: spinFirstOrderOnly,
          requireLogin: spinRequireLogin,
          daysOfWeek: spinDaysOfWeek,
          timeStart: spinTimeStart,
          timeEnd: spinTimeEnd,
          startsAt: spinStartsAt,
          expiresAt: spinExpiresAt,
          maxPerDay: spinMaxPerDay,
          maxPerCustomer: spinMaxPerCustomer,
          display: spinDisplay !== undefined ? parseSpinDisplay(spinDisplay) : undefined,
          criteria: spinCriteria !== undefined ? parseSpinCriteria(spinCriteria) : undefined,
        })
      : await getSpinSettings();

    let savedCancelWindowMinutes = await getCancelWindowMinutes();
    if (cancelWindowMinutes != null) {
      if (req.user?.role !== 'SYSTEM_ADMIN') {
        throw new AppError('Only system admin can update cancel window minutes', 403);
      }
      savedCancelWindowMinutes = await setCancelWindowMinutes(cancelWindowMinutes);
      invalidateCancelWindowMinutesCache();
    }

    let savedPickupMaxOrderAmount = await getPickupMaxOrderAmount();
    if (pickupMaxOrderAmount !== undefined) {
      if (req.user?.role !== 'SYSTEM_ADMIN') {
        throw new AppError('Only system admin can update pickup order amount limit', 403);
      }
      const nextAmount =
        pickupMaxOrderAmount == null || pickupMaxOrderAmount <= 0 ? null : pickupMaxOrderAmount;
      if (savedPickupMaxOrderAmount !== nextAmount) {
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        await verifyAdminPin(req.user?.sub, password);
      }
      savedPickupMaxOrderAmount = await setPickupMaxOrderAmount(pickupMaxOrderAmount);
      invalidatePickupMaxOrderAmountCache();
    }

    if (deliveryPlatformFeeRate != null) {
      await setDeliveryPlatformFeeRate(deliveryPlatformFeeRate);
    }

    if (data.commissionSlabs != null) {
      try {
        await setCommissionSlabs(data.commissionSlabs);
      } catch (err) {
        throw new AppError(err instanceof Error ? err.message : 'Invalid commission slabs', 400);
      }
    }
    const savedGoogleMapsApiKey = googleMapsApiKey !== undefined
      ? await setGoogleMapsApiKey(googleMapsApiKey)
      : await getGoogleMapsBrowserApiKey();

    invalidatePickupOrderEditSettingsCache();
    invalidateGatewayFeeRateCache();
    invalidateCommissionSlabsCache();
    invalidateDeliveryPlatformFeeRateCache();
    invalidateDeliveryMilestoneSettingsCache();
    const savedRates = await getConvenienceFeeRates();
    const savedGatewayFeeRate = await getGatewayFeeRate();
    const savedDeliveryPlatformFeeRate = await getDeliveryPlatformFeeRate();
    const savedCommissionSlabs = await getCommissionSlabs();
    return success(res, {
      convenientFeeRate: savedRates.delivery,
      convenientFeePercent: Math.round(savedRates.delivery * 1000) / 10,
      pickupConvenientFeeRate: savedRates.pickup,
      pickupConvenientFeePercent: Math.round(savedRates.pickup * 1000) / 10,
      deliveryConvenientFeeRate: savedRates.delivery,
      deliveryConvenientFeePercent: Math.round(savedRates.delivery * 1000) / 10,
      gatewayFeeRate: savedGatewayFeeRate,
      gatewayFeePercent: Math.round(savedGatewayFeeRate * 1000) / 10,
      commissionSlabs: savedCommissionSlabs.map((slab) => ({
        upTo: slab.upTo,
        rate: slab.rate,
        ratePercent: Math.round(slab.rate * 1000) / 10,
        label: slab.label,
      })),
      deliveryPlatformFeeRate: savedDeliveryPlatformFeeRate,
      deliveryPlatformFeePercent: Math.round(savedDeliveryPlatformFeeRate * 1000) / 10,
      pickupAllowAddItemsPaidOnline: updated.pickupAllowAddItemsPaidOnline,
      pickupAllowEditCashUnpaid: updated.pickupAllowEditCashUnpaid,
      maxCupsPerRider: savedMaxCups,
      branchCompletionRadiusM: savedBranchCompletionRadiusM,
      deliveryMilestone1Orders: savedMilestones.milestone1,
      deliveryMilestone2Orders: savedMilestones.milestone2,
      deliveryMilestone3Orders: savedMilestones.milestone3,
      requireAppDownload: savedAppDownload.requireAppDownload,
      androidStoreUrl: savedAppDownload.androidStoreUrl,
      iosStoreUrl: savedAppDownload.iosStoreUrl,
      androidAppIconUrl: savedAppDownload.androidAppIconUrl,
      iosAppIconUrl: savedAppDownload.iosAppIconUrl,
      weeklyResetDay: savedWeeklyResetDay,
      spinDurationSeconds: savedSpin.spinDurationSeconds,
      spinsPerWindow: savedSpin.spinsPerWindow,
      spinWindowHours: savedSpin.spinWindowHours,
      spinTrackByIp: savedSpin.spinTrackByIp,
      spinEnabled: savedSpin.spinEnabled,
      spinFirstOrderOnly: savedSpin.firstOrderOnly,
      spinRequireLogin: savedSpin.requireLogin,
      spinDaysOfWeek: savedSpin.daysOfWeek,
      spinTimeStart: savedSpin.timeStart,
      spinTimeEnd: savedSpin.timeEnd,
      spinStartsAt: savedSpin.startsAt,
      spinExpiresAt: savedSpin.expiresAt,
      spinMaxPerDay: savedSpin.maxPerDay,
      spinMaxPerCustomer: savedSpin.maxPerCustomer,
      spinDisplay: savedSpin.display,
      spinCriteria: savedSpin.criteria,
      cancelWindowMinutes: savedCancelWindowMinutes,
      pickupMaxOrderAmount: savedPickupMaxOrderAmount,
      googleMapsApiKey: savedGoogleMapsApiKey,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeliveryZones(_req: Request, res: Response, next: NextFunction) {
  try {
    const zones = await prisma.deliveryZone.findMany({
      where: { isGlobal: true },
      orderBy: { radiusKm: 'asc' },
    });
    return success(res, zones);
  } catch (err) {
    next(err);
  }
}

const deliveryZoneSchema = z.object({
  name: z.string().min(1),
  radiusKm: z.number().positive(),
  fee: z.number().int().min(0),
  minOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function createDeliveryZone(req: Request, res: Response, next: NextFunction) {
  try {
    const data = deliveryZoneSchema.parse(req.body);
    const zone = await prisma.deliveryZone.create({
      data: {
        ...data,
        minOrder: data.minOrder ?? 500,
        isGlobal: true,
        storeId: null,
        isActive: data.isActive ?? true,
      },
    });
    return success(res, zone, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateDeliveryZone(req: Request, res: Response, next: NextFunction) {
  try {
    const data = deliveryZoneSchema.partial().parse(req.body);
    const existing = await prisma.deliveryZone.findUnique({ where: { id: req.params.id as string } });
    if (!existing?.isGlobal) throw new AppError('Global delivery zone not found', 404);
    const zone = await prisma.deliveryZone.update({
      where: { id: req.params.id as string },
      data,
    });
    return success(res, zone);
  } catch (err) {
    next(err);
  }
}

export async function deleteDeliveryZone(req: Request, res: Response, next: NextFunction) {
  try {
    const existing = await prisma.deliveryZone.findUnique({ where: { id: req.params.id as string } });
    if (!existing?.isGlobal) throw new AppError('Global delivery zone not found', 404);
    await prisma.deliveryZone.delete({ where: { id: req.params.id as string } });
    return success(res, { message: 'Delivery zone deleted' });
  } catch (err) {
    next(err);
  }
}

const loyaltyTierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  minSpendLkr: z.number().int().min(0),
  emoji: z.string().min(1),
  perk: z.string().min(1),
  accent: z.string().optional(),
});

const loyaltyRedeemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  cost: z.number().int().min(1),
  emoji: z.string().min(1),
  tag: z.string().optional(),
  isActive: z.boolean().optional(),
});

const loyaltyOfferSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: z.string().min(1),
  description: z.string().min(1),
  emoji: z.string().min(1),
  isActive: z.boolean().optional(),
});

const loyaltyProgramSchema = z.object({
  lkrPerPoint: z.number().int().min(1).max(100000).optional(),
  pointsPerLkr: z.number().min(0.0001).max(1).optional(),
  redeemValue: z.number().min(0.01).max(1000).optional(),
  maxRedeemPct: z.number().int().min(1).max(100).optional(),
  minOrderToEarn: z.number().int().min(0).max(1000000).optional(),
  referralBonusPoints: z.number().int().min(0).max(100000).optional(),
  customerRedeemEnabled: z.boolean().optional(),
  checkoutRedeemEnabled: z.boolean().optional(),
  minPointsToRedeem: z.number().int().min(0).max(1000000).optional(),
  tiers: z.array(loyaltyTierSchema).min(1).max(10).optional(),
  redeemRewards: z.array(loyaltyRedeemSchema).max(30).optional(),
  upcomingOffers: z.array(loyaltyOfferSchema).max(30).optional(),
});

export async function getLoyaltyProgramSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    const row = await fetchLoyaltySettingRow();
    const config = buildLoyaltyProgramConfig(row, { includeInactive: true });
    return success(res, config);
  } catch (err) {
    next(err);
  }
}

export async function updateLoyaltyProgramSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = loyaltyProgramSchema.parse(req.body);
    const existing = rowToLoyaltyFields(await fetchLoyaltySettingRow());

    let pointsPerLkr = data.pointsPerLkr ?? existing.pointsPerLkr;
    if (data.lkrPerPoint != null) {
      pointsPerLkr = 1 / data.lkrPerPoint;
    }

    const updated = await upsertLoyaltySettingRow({
      pointsPerLkr,
      redeemValue: data.redeemValue ?? existing.redeemValue,
      maxRedeemPct: data.maxRedeemPct ?? existing.maxRedeemPct,
      minOrderToEarn: data.minOrderToEarn ?? existing.minOrderToEarn,
      referralBonusPoints: data.referralBonusPoints ?? existing.referralBonusPoints,
      customerRedeemEnabled: data.customerRedeemEnabled ?? existing.customerRedeemEnabled,
      checkoutRedeemEnabled: data.checkoutRedeemEnabled ?? existing.checkoutRedeemEnabled,
      minPointsToRedeem: data.minPointsToRedeem ?? existing.minPointsToRedeem,
      tiers: data.tiers ?? existing.tiers,
      redeemRewards: data.redeemRewards ?? existing.redeemRewards,
      upcomingOffers: data.upcomingOffers ?? existing.upcomingOffers,
    });

    return success(res, buildLoyaltyProgramConfig(updated, { includeInactive: true }));
  } catch (err) {
    next(err);
  }
}

const timeField = z.string().regex(/^\d{2}:\d{2}$/);

const branchOrderingHoursSchema = z.object({
  openTime: timeField.optional(),
  closeTime: timeField.optional(),
  onlineOrderStartTime: timeField.nullable().optional(),
  onlineOrderStopTime: timeField.nullable().optional(),
  pickupCutoffMinutes: z.number().int().min(0).max(180).optional(),
});

export async function getBranchOrderingHours(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await requireBranchStoreId(req);
    const store = await fetchStoreOrderingHours(storeId);
    if (!store) throw new AppError('Store not found', 404);
    const hours = resolveStoreOrderingHours(store);
    return success(res, {
      storeId: store.id,
      storeName: store.name,
      ...hours,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBranchOrderingHours(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await requireBranchStoreId(req);
    const data = branchOrderingHoursSchema.parse(req.body);
    const store = await updateStoreOrderingHours(storeId, data);
    const hours = resolveStoreOrderingHours(store);
    broadcastBranchOperating({
      storeId,
      branchClosedAt: store.branchClosedAt ? new Date(store.branchClosedAt).toISOString() : null,
      openTime: store.openTime,
      closeTime: store.closeTime,
      onlineOrderStartTime: store.onlineOrderStartTime,
      onlineOrderStopTime: store.onlineOrderStopTime,
      pickupCutoffMinutes: store.pickupCutoffMinutes,
    });
    return success(res, {
      storeId: store.id,
      storeName: store.name,
      ...hours,
    });
  } catch (err) {
    next(err);
  }
}

const platformPaybackBranchSchema = z.object({
  storeId: z.string().min(1),
  enabled: z.boolean(),
});

const platformPaybackUpdateSchema = z.object({
  branches: z.array(platformPaybackBranchSchema).min(1),
  passcode: z.string().min(1, 'Passcode is required'),
});

async function loadPendingPaybackStoreIds(storeIds: string[]): Promise<Set<string>> {
  if (storeIds.length === 0) return new Set();

  const pendingRows = await prisma.storeWithdrawal.findMany({
    where: { status: 'PENDING', storeId: { in: storeIds } },
    select: { storeId: true },
    distinct: ['storeId'],
  });

  return new Set(pendingRows.map((row) => row.storeId));
}

function mapPlatformPaybackBranchRow(
  store: { id: string; name: string; city: string; platformDiscountPaybackEnabled: boolean },
  pendingStoreIds: Set<string>,
) {
  return {
    storeId: store.id,
    name: store.name,
    city: store.city,
    platformDiscountPaybackEnabled: store.platformDiscountPaybackEnabled,
    hasPendingWithdrawals: pendingStoreIds.has(store.id),
  };
}

export async function getPlatformDiscountPaybackSettings(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const loadStores = () =>
      prisma.store.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          city: true,
          platformDiscountPaybackEnabled: true,
        },
        orderBy: { name: 'asc' },
      });

    let stores;
    try {
      stores = await loadStores();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'P2022') throw err;
      await ensurePlatformPaybackSchema();
      stores = await loadStores();
    }

    const pendingStoreIds = await loadPendingPaybackStoreIds(stores.map((store) => store.id));

    return success(
      res,
      stores.map((store) => mapPlatformPaybackBranchRow(store, pendingStoreIds)),
    );
  } catch (err) {
    next(err);
  }
}

export async function updatePlatformDiscountPaybackSettings(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await ensurePlatformPaybackSchema();

    const adminId = req.user?.sub;
    if (!adminId) throw new AppError('Unauthorized', 401);

    const { branches, passcode } = platformPaybackUpdateSchema.parse(req.body);
    const storeIds = branches.map((b) => b.storeId);

    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { name: true, passwordHash: true },
    });
    if (!admin) throw new AppError('Unauthorized', 401);

    const validPasscode = await bcrypt.compare(passcode, admin.passwordHash);
    if (!validPasscode) throw new AppError('Invalid passcode', 401);

    const existingStores = await prisma.store.findMany({
      where: { id: { in: storeIds }, isActive: true },
      select: { id: true, name: true, platformDiscountPaybackEnabled: true },
    });

    if (existingStores.length !== storeIds.length) {
      throw new AppError('One or more branches were not found or are inactive', 400);
    }

    const existingById = new Map(existingStores.map((s) => [s.id, s]));
    const changedByName = admin.name ?? null;

    const changes = branches.filter((branch) => {
      const existing = existingById.get(branch.storeId);
      return existing && existing.platformDiscountPaybackEnabled !== branch.enabled;
    });

    if (changes.length > 0) {
      const pendingStoreIds = await loadPendingPaybackStoreIds(changes.map((branch) => branch.storeId));
      const blockedNames = changes
        .filter((branch) => pendingStoreIds.has(branch.storeId))
        .map((branch) => existingById.get(branch.storeId)!.name);

      if (blockedNames.length > 0) {
        throw new AppError(
          `Cannot update payback for branches with pending payout requests: ${blockedNames.join(', ')}`,
          400,
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const branch of changes) {
        const existing = existingById.get(branch.storeId)!;
        await tx.store.update({
          where: { id: branch.storeId },
          data: { platformDiscountPaybackEnabled: branch.enabled },
        });
        await tx.platformPaybackSettingLog.create({
          data: {
            id: crypto.randomUUID(),
            storeId: branch.storeId,
            previousValue: existing.platformDiscountPaybackEnabled,
            newValue: branch.enabled,
            changedById: adminId,
            changedByName,
          },
        });
      }
    });

    const updated = await prisma.store.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        city: true,
        platformDiscountPaybackEnabled: true,
      },
      orderBy: { name: 'asc' },
    });

    const pendingStoreIds = await loadPendingPaybackStoreIds(updated.map((store) => store.id));

    return success(
      res,
      updated.map((store) => mapPlatformPaybackBranchRow(store, pendingStoreIds)),
    );
  } catch (err) {
    next(err);
  }
}

const cancelReasonConfigFields = z.object({
  label: z.string().min(1).max(120),
  value: z.string().min(1).max(64).optional(),
  minRefundPercentage: z.number().min(0).max(100).optional(),
  maxRefundPercentage: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

const cancelReasonConfigSchema = cancelReasonConfigFields.refine((data) => {
  if (data.minRefundPercentage == null || data.maxRefundPercentage == null) return true;
  return data.minRefundPercentage <= data.maxRefundPercentage;
}, {
  message: 'Minimum refund percentage cannot exceed maximum',
  path: ['minRefundPercentage'],
});

function serializeCancelReasonConfig(reason: {
  id: string;
  label: string;
  value: string;
  minRefundPercentage: number;
  maxRefundPercentage: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: reason.id,
    label: reason.label,
    value: reason.value,
    minRefundPercentage: reason.minRefundPercentage,
    maxRefundPercentage: reason.maxRefundPercentage,
    isActive: reason.isActive,
    sortOrder: reason.sortOrder,
    createdAt: reason.createdAt.toISOString(),
    updatedAt: reason.updatedAt.toISOString(),
  };
}

export async function getPublicCancelReasons(_req: Request, res: Response, next: NextFunction) {
  try {
    const reasons = await getActiveCancelReasons();
    return success(res, reasons.map((reason) => ({
      value: reason.value,
      label: reason.label,
      minRefundPercentage: reason.minRefundPercentage,
      maxRefundPercentage: reason.maxRefundPercentage,
    })));
  } catch (err) {
    next(err);
  }
}

export async function getAllCancelReasonConfigs(_req: Request, res: Response, next: NextFunction) {
  try {
    const reasons = await getAllCancelReasons();
    return success(res, reasons.map(serializeCancelReasonConfig));
  } catch (err) {
    next(err);
  }
}

export async function createCancelReasonConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const data = cancelReasonConfigSchema.parse(req.body);
    const value = normalizeCancelReasonValue(data.value ?? data.label);
    if (!value) throw new AppError('Reason value is required', 400);

    const existing = await getCancelReasonByValue(value);
    if (existing) throw new AppError('A cancellation reason with this value already exists', 409);

    const reason = await createCancelReasonRow({
      label: data.label.trim(),
      value,
      minRefundPercentage: data.minRefundPercentage ?? 0,
      maxRefundPercentage: data.maxRefundPercentage ?? 100,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    });

    return success(res, serializeCancelReasonConfig(reason), 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCancelReasonConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const data = cancelReasonConfigFields.partial().parse(req.body);

    const existing = await getCancelReasonById(id);
    if (!existing) throw new AppError('Cancellation reason not found', 404);

    if (data.value != null) {
      const value = normalizeCancelReasonValue(data.value);
      if (!value) throw new AppError('Reason value is required', 400);
      const duplicate = await getCancelReasonByValue(value);
      if (duplicate && duplicate.id !== id) {
        throw new AppError('A cancellation reason with this value already exists', 409);
      }
    }

    const reason = await updateCancelReasonRow(id, {
      ...(data.label != null ? { label: data.label.trim() } : {}),
      ...(data.value != null ? { value: normalizeCancelReasonValue(data.value) } : {}),
      ...(data.minRefundPercentage != null ? { minRefundPercentage: data.minRefundPercentage } : {}),
      ...(data.maxRefundPercentage != null ? { maxRefundPercentage: data.maxRefundPercentage } : {}),
      ...(data.isActive != null ? { isActive: data.isActive } : {}),
      ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
    });

    return success(res, serializeCancelReasonConfig(reason));
  } catch (err) {
    next(err);
  }
}

export async function deleteCancelReasonConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const existing = await getCancelReasonById(id);
    if (!existing) throw new AppError('Cancellation reason not found', 404);

    const reason = await updateCancelReasonRow(id, { isActive: false });

    return success(res, serializeCancelReasonConfig(reason));
  } catch (err) {
    next(err);
  }
}

const orderStatusRefundConfigSchema = z.object({
  refundPercentage: z.number().min(0).max(100),
  isActive: z.boolean().optional(),
});

function serializeOrderStatusRefundConfig(config: {
  id: string;
  orderStatus: string;
  refundPercentage: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: config.id,
    orderStatus: config.orderStatus,
    refundPercentage: config.refundPercentage,
    isActive: config.isActive,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export async function getAllOrderStatusRefundConfigsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const configs = await getAllOrderStatusRefundConfigs();
    return success(res, configs.map(serializeOrderStatusRefundConfig));
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatusRefundConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const statusParam = req.params.status as string;
    const orderStatus = assertCancellableOrderStatus(statusParam.toUpperCase());
    const data = orderStatusRefundConfigSchema.parse(req.body);

    const config = await upsertOrderStatusRefundConfig(orderStatus, {
      refundPercentage: data.refundPercentage,
      ...(data.isActive != null ? { isActive: data.isActive } : {}),
    });

    return success(res, serializeOrderStatusRefundConfig(config));
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid order status for refund configuration') {
      next(new AppError(`Invalid order status. Allowed: ${CANCELLABLE_ORDER_STATUSES.join(', ')}`, 400));
      return;
    }
    next(err);
  }
}
