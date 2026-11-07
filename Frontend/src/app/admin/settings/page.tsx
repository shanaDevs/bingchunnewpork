'use client';
import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { getApiBaseUrl, getWebxpayReturnUrlHint } from '@/lib/apiBase';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Clock, CreditCard, Dices, Gift, MessageCircle, Phone, RefreshCw, Save, Settings, ShoppingBag, Smartphone, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import LoyaltyProgramSettings from '@/components/admin/LoyaltyProgramSettings';
import LoyaltyCampaignDashboard from '@/components/admin/loyalty/LoyaltyCampaignDashboard';
import PlatformDiscountPaybackSettings from '@/components/admin/PlatformDiscountPaybackSettings';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import { isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import { confirmDialog } from '@/store/confirmStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type MethodKey = 'PAYHERE' | 'CASH_AT_COUNTER';

interface MethodConfig {
  enabled: boolean;
  label: string;
  icon?: string;
  modes: ('DELIVERY' | 'TAKEAWAY')[];
}

const WEEKLY_RESET_DAY_OPTIONS = [
  { value: '', label: 'Not scheduled' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
] as const;

function TabSaveButton({
  onClick,
  pending,
  label,
}: {
  onClick: () => void;
  pending: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="btn-primary flex items-center gap-2 px-6 py-3"
    >
      <Save size={16} />
      {pending ? 'Saving...' : label}
    </button>
  );
}

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [methods, setMethods] = useState<Record<MethodKey, MethodConfig> | null>(null);
  const [activeOnlineGateway, setActiveOnlineGateway] = useState<'PAYHERE' | 'WEBXPAY'>('PAYHERE');
  const [merchantId, setMerchantId] = useState('');
  const [merchantSecret, setMerchantSecret] = useState('');
  const [payhereMode, setPayhereMode] = useState<'sandbox' | 'live'>('sandbox');
  const [webxpayPublicKey, setWebxpayPublicKey] = useState('');
  const [webxpaySecretKey, setWebxpaySecretKey] = useState('');
  const [webxpayApiUsername, setWebxpayApiUsername] = useState('');
  const [webxpayApiPassword, setWebxpayApiPassword] = useState('');
  const [webxpayMode, setWebxpayMode] = useState<'sandbox' | 'live'>('sandbox');
  const [webxpayReturnUrl, setWebxpayReturnUrl] = useState('');
  const [pickupConvenienceFeePercent, setPickupConvenienceFeePercent] = useState('6');
  const [deliveryConvenienceFeePercent, setDeliveryConvenienceFeePercent] = useState('7.5');
  const [gatewayFeePercent, setGatewayFeePercent] = useState('1.9');
  const [commissionSlab1UpTo, setCommissionSlab1UpTo] = useState('1000000');
  const [commissionSlab1RatePercent, setCommissionSlab1RatePercent] = useState('6.5');
  const [commissionSlab2RatePercent, setCommissionSlab2RatePercent] = useState('5');
  const [deliveryPlatformFeePercent, setDeliveryPlatformFeePercent] = useState('0');
  const [pickupAllowAddItemsPaidOnline, setPickupAllowAddItemsPaidOnline] = useState(true);
  const [pickupAllowEditCashUnpaid, setPickupAllowEditCashUnpaid] = useState(true);
  const [maxCupsPerRider, setMaxCupsPerRider] = useState('20');
  const [weeklyResetDay, setWeeklyResetDay] = useState('');
  const [requireAppDownload, setRequireAppDownload] = useState(true);
  const [androidStoreUrl, setAndroidStoreUrl] = useState('');
  const [iosStoreUrl, setIosStoreUrl] = useState('');
  const [androidAppIconUrl, setAndroidAppIconUrl] = useState('');
  const [iosAppIconUrl, setIosAppIconUrl] = useState('');
  const [cancelWindowMinutes, setCancelWindowMinutes] = useState('10');
  const [pickupMaxOrderAmount, setPickupMaxOrderAmount] = useState('');
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const [spinDurationSeconds, setSpinDurationSeconds] = useState('8');
  const [spinsPerWindow, setSpinsPerWindow] = useState('1');
  const [spinWindowValue, setSpinWindowValue] = useState('1');
  const [spinWindowUnit, setSpinWindowUnit] = useState<'hours' | 'days'>('days');
  const [spinTrackByIp, setSpinTrackByIp] = useState(true);
  const [zoneForm, setZoneForm] = useState({ name: '', radiusKm: '', fee: '', minOrder: '500' });
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testTitle, setTestTitle] = useState('Test notification');
  const [testMessage, setTestMessage] = useState('This is a test push from the Bing Chun admin panel.');
  const [testResult, setTestResult] = useState<{
    user?: { name: string; phone: string };
    pushTokensTargeted: number;
    pushTokensSent: number;
    fcmConfigured: boolean;
    socketEmitted: boolean;
  } | null>(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState('');
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('');
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState('');
  const [whatsappAccessTokenSet, setWhatsappAccessTokenSet] = useState(false);
  const [whatsappVerifyTokenSet, setWhatsappVerifyTokenSet] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [whatsappWebhookPath, setWhatsappWebhookPath] = useState('/api/whatsapp/webhook');
  const [whatsappWebhookUrl, setWhatsappWebhookUrl] = useState(
    'https://bing-chun-ui2ow.ondigitalocean.app/api/whatsapp/webhook',
  );
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsProvider, setSmsProvider] = useState<'smslenz' | 'mock'>('smslenz');
  const [smsUserId, setSmsUserId] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [smsBaseUrl, setSmsBaseUrl] = useState('https://smslenz.lk');
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsApiKeySet, setSmsApiKeySet] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [smsConnectionTimeoutMs, setSmsConnectionTimeoutMs] = useState('30000');
  const [smsReadTimeoutMs, setSmsReadTimeoutMs] = useState('30000');
  const [branchOpenTime, setBranchOpenTime] = useState('09:00');
  const [branchCloseTime, setBranchCloseTime] = useState('23:00');
  const [branchOnlineStart, setBranchOnlineStart] = useState('');
  const [branchOnlineStop, setBranchOnlineStop] = useState('');
  const [branchPickupCutoff, setBranchPickupCutoff] = useState('50');
  const [branchStoreName, setBranchStoreName] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bc_admin');
    if (stored) setAdmin(JSON.parse(stored) as AdminSession);
  }, []);

  const superAdmin = isSuperAdmin(admin);
  const resolvedTab = activeTab ?? (superAdmin ? 'payments' : 'hours');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payment-settings'],
    queryFn: () => adminFetch('/settings/payment'),
    enabled: superAdmin,
  });

  const { data: appSettings, isLoading: appSettingsLoading } = useQuery({
    queryKey: ['admin-app-settings'],
    queryFn: () => adminFetch('/settings/app'),
    enabled: Boolean(admin),
  });

  const { data: branchOrderingHours, isLoading: branchHoursLoading } = useQuery({
    queryKey: ['branch-ordering-hours'],
    queryFn: () => adminFetch('/settings/branch-ordering-hours'),
    enabled: Boolean(admin) && !superAdmin,
  });

  useEffect(() => {
    if (!branchOrderingHours) return;
    setBranchStoreName(branchOrderingHours.storeName ?? '');
    setBranchOpenTime(branchOrderingHours.openTime ?? '09:00');
    setBranchCloseTime(branchOrderingHours.closeTime ?? '23:00');
    setBranchOnlineStart(branchOrderingHours.onlineOrderStartTime ?? '');
    setBranchOnlineStop(branchOrderingHours.onlineOrderStopTime ?? '');
    setBranchPickupCutoff(String(branchOrderingHours.pickupCutoffMinutes ?? 50));
  }, [branchOrderingHours]);

  const { data: deliveryZones = [], refetch: refetchZones } = useQuery<any[]>({
    queryKey: ['admin-delivery-zones'],
    queryFn: () => adminFetch('/settings/delivery-zones').then((res) => (Array.isArray(res) ? res : [])),
    enabled: superAdmin,
  });

  const { data: messagingSettings } = useQuery({
    queryKey: ['admin-messaging-settings'],
    queryFn: () => adminFetch('/settings/messaging'),
    enabled: superAdmin && resolvedTab === 'messaging',
    staleTime: 5 * 60_000,
  });

  const { data: whatsappLiveStatus } = useQuery({
    queryKey: ['admin-whatsapp-status'],
    queryFn: () =>
      adminFetch('/admin/messaging/whatsapp-status') as Promise<{
        token: { ok: boolean; status: string; detail: string; displayPhoneNumber?: string };
        lastInbound: { at: string; from: string; preview: string; source: string } | null;
      }>,
    enabled: superAdmin && resolvedTab === 'messaging',
    refetchInterval: resolvedTab === 'messaging' ? 60_000 : false,
  });

  useEffect(() => {
    const payload = data;
    if (!payload) return;
    setMethods(payload.methods);
    setActiveOnlineGateway(payload.activeOnlineGateway === 'WEBXPAY' ? 'WEBXPAY' : 'PAYHERE');
    setMerchantId(payload.payhere?.merchantId || '');
    setPayhereMode(payload.payhere?.mode === 'live' ? 'live' : 'sandbox');
    setWebxpayApiUsername(payload.webxpay?.apiUsername || '');
    setWebxpayMode(payload.webxpay?.mode === 'live' ? 'live' : 'sandbox');
    setWebxpayReturnUrl(payload.webxpay?.returnUrl || '');
  }, [data]);

  useEffect(() => {
    const wa = messagingSettings?.whatsapp;
    if (wa) {
      setWhatsappEnabled(Boolean(wa.enabled));
      setWhatsappPhoneNumberId(wa.phoneNumberId || '');
      setWhatsappBusinessAccountId(wa.businessAccountId || '');
      setWhatsappAccessTokenSet(Boolean(wa.accessTokenSet));
      setWhatsappVerifyTokenSet(Boolean(wa.verifyTokenSet));
      setWhatsappConfigured(Boolean(wa.configured));
      setWhatsappWebhookPath(wa.webhookPath || '/api/whatsapp/webhook');
      setWhatsappWebhookUrl(
        wa.webhookUrl ||
          'https://bing-chun-ui2ow.ondigitalocean.app/api/whatsapp/webhook',
      );
    }
    const sms = messagingSettings?.sms;
    if (sms) {
      setSmsEnabled(Boolean(sms.enabled));
      setSmsProvider(sms.provider === 'mock' ? 'mock' : 'smslenz');
      setSmsUserId(sms.userId || '');
      setSmsSenderId(sms.senderId || '');
      setSmsBaseUrl(sms.baseUrl || 'https://smslenz.lk');
      setSmsApiKeySet(Boolean(sms.apiKeySet));
      setSmsConfigured(Boolean(sms.configured));
      setSmsConnectionTimeoutMs(String(sms.connectionTimeoutMs ?? 30000));
      setSmsReadTimeoutMs(String(sms.readTimeoutMs ?? 30000));
    }
  }, [messagingSettings]);

  useEffect(() => {
    const payload = appSettings;
    if (payload?.pickupConvenientFeePercent != null) {
      setPickupConvenienceFeePercent(String(payload.pickupConvenientFeePercent));
    } else if (payload?.convenientFeePercent != null) {
      setPickupConvenienceFeePercent(String(payload.convenientFeePercent));
    }
    if (payload?.deliveryConvenientFeePercent != null) {
      setDeliveryConvenienceFeePercent(String(payload.deliveryConvenientFeePercent));
    } else if (payload?.convenientFeePercent != null) {
      setDeliveryConvenienceFeePercent(String(payload.convenientFeePercent));
    }
    if (payload?.gatewayFeePercent != null) {
      setGatewayFeePercent(String(payload.gatewayFeePercent));
    }
    if (Array.isArray(payload?.commissionSlabs) && payload.commissionSlabs.length > 0) {
      const first = payload.commissionSlabs[0];
      const second = payload.commissionSlabs[1];
      if (first?.upTo != null) setCommissionSlab1UpTo(String(first.upTo));
      if (first?.ratePercent != null) setCommissionSlab1RatePercent(String(first.ratePercent));
      if (second?.ratePercent != null) setCommissionSlab2RatePercent(String(second.ratePercent));
    }
    if (payload?.deliveryPlatformFeePercent != null) {
      setDeliveryPlatformFeePercent(String(payload.deliveryPlatformFeePercent));
    }
    if (payload?.pickupAllowAddItemsPaidOnline != null) {
      setPickupAllowAddItemsPaidOnline(Boolean(payload.pickupAllowAddItemsPaidOnline));
    }
    if (payload?.pickupAllowEditCashUnpaid != null) {
      setPickupAllowEditCashUnpaid(Boolean(payload.pickupAllowEditCashUnpaid));
    }
    if (payload?.maxCupsPerRider != null) {
      setMaxCupsPerRider(String(payload.maxCupsPerRider));
    }
    if (payload?.weeklyResetDay != null) {
      setWeeklyResetDay(String(payload.weeklyResetDay));
    } else {
      setWeeklyResetDay('');
    }
    if (payload?.requireAppDownload != null) {
      setRequireAppDownload(Boolean(payload.requireAppDownload));
    }
    if (payload?.androidStoreUrl != null) {
      setAndroidStoreUrl(String(payload.androidStoreUrl));
    }
    if (payload?.iosStoreUrl != null) {
      setIosStoreUrl(String(payload.iosStoreUrl));
    }
    if (payload?.androidAppIconUrl != null) {
      setAndroidAppIconUrl(String(payload.androidAppIconUrl));
    }
    if (payload?.iosAppIconUrl != null) {
      setIosAppIconUrl(String(payload.iosAppIconUrl));
    }
    if (payload?.cancelWindowMinutes != null) {
      setCancelWindowMinutes(String(payload.cancelWindowMinutes));
    }
    if (payload?.pickupMaxOrderAmount != null && payload.pickupMaxOrderAmount > 0) {
      setPickupMaxOrderAmount(String(payload.pickupMaxOrderAmount));
    } else {
      setPickupMaxOrderAmount('');
    }
    if (payload?.spinDurationSeconds != null) {
      setSpinDurationSeconds(String(payload.spinDurationSeconds));
    }
    if (payload?.spinsPerWindow != null) {
      setSpinsPerWindow(String(payload.spinsPerWindow));
    }
    if (payload?.spinWindowHours != null) {
      const hours = Number(payload.spinWindowHours) || 24;
      if (hours >= 24 && hours % 24 === 0) {
        setSpinWindowUnit('days');
        setSpinWindowValue(String(hours / 24));
      } else {
        setSpinWindowUnit('hours');
        setSpinWindowValue(String(hours));
      }
    }
    if (payload?.spinTrackByIp != null) {
      setSpinTrackByIp(Boolean(payload.spinTrackByIp));
    }
  }, [appSettings]);

  const savePayments = useMutation({
    mutationFn: async () => {
      await adminFetch('/settings/payment', {
        method: 'PUT',
        body: JSON.stringify({
          paymentMethods: methods,
          activeOnlineGateway,
          payhereMerchantId: merchantId || undefined,
          ...(merchantSecret ? { payhereMerchantSecret: merchantSecret } : {}),
          payhereMode,
          ...(webxpayPublicKey ? { webxpayPublicKey } : {}),
          ...(webxpaySecretKey ? { webxpaySecretKey } : {}),
          webxpayApiUsername: webxpayApiUsername || undefined,
          ...(webxpayApiPassword ? { webxpayApiPassword } : {}),
          webxpayMode,
          webxpayReturnUrl: webxpayReturnUrl || undefined,
        }),
      });
      await adminFetch('/settings/app', {
        method: 'PUT',
        body: JSON.stringify({
          convenientFeeRate: parseFloat(deliveryConvenienceFeePercent) / 100,
          pickupConvenientFeeRate: parseFloat(pickupConvenienceFeePercent) / 100,
          gatewayFeeRate: parseFloat(gatewayFeePercent) / 100,
          deliveryPlatformFeeRate: parseFloat(deliveryPlatformFeePercent) / 100,
          commissionSlabs: [
            {
              upTo: parseFloat(commissionSlab1UpTo),
              rate: parseFloat(commissionSlab1RatePercent) / 100,
              label: `Up to LKR ${Number(commissionSlab1UpTo).toLocaleString('en-LK')}`,
            },
            {
              upTo: Number.MAX_SAFE_INTEGER,
              rate: parseFloat(commissionSlab2RatePercent) / 100,
              label: `Above LKR ${Number(commissionSlab1UpTo).toLocaleString('en-LK')}`,
            },
          ],
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payment-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-app-settings'] });
      setMerchantSecret('');
      setWebxpayPublicKey('');
      setWebxpaySecretKey('');
      setWebxpayApiPassword('');
      toast.success('Payment settings saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parsePickupMaxFromInput = (): number | null => {
    const raw = pickupMaxOrderAmount.trim();
    if (raw === '') return null;
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const savedPickupMaxOrderAmount =
    appSettings?.pickupMaxOrderAmount != null && appSettings.pickupMaxOrderAmount > 0
      ? appSettings.pickupMaxOrderAmount
      : null;

  const pickupMaxAmountChanged = parsePickupMaxFromInput() !== savedPickupMaxOrderAmount;

  const saveOperations = useMutation({
    mutationFn: async (password?: string) => {
      await adminFetch('/settings/app', {
        method: 'PUT',
        body: JSON.stringify({
          pickupAllowAddItemsPaidOnline,
          pickupAllowEditCashUnpaid,
          weeklyResetDay: weeklyResetDay === '' ? null : parseInt(weeklyResetDay, 10),
          ...(superAdmin
            ? {
                cancelWindowMinutes: Math.min(120, Math.max(1, parseInt(cancelWindowMinutes, 10) || 10)),
                pickupMaxOrderAmount: parsePickupMaxFromInput(),
                ...(password ? { password } : {}),
              }
            : {}),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-app-settings'] });
      toast.success('Operations settings saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSaveOperations = async () => {
    if (saveOperations.isPending) return;
    if (superAdmin && pickupMaxAmountChanged) {
      const nextAmount = parsePickupMaxFromInput();
      const confirmed = await confirmDialog({
        title: 'Confirm pickup order limit',
        message:
          nextAmount == null
            ? 'Remove the pickup order amount limit? Customers will be able to place pickup orders of any amount online.'
            : `Set the maximum pickup order amount to LKR ${nextAmount.toLocaleString()}? Pickup orders above this total cannot be confirmed on the website.`,
        confirmLabel: 'Continue',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;
      setPinGateOpen(true);
      return;
    }
    saveOperations.mutate(undefined);
  };

  const saveDeliverySettings = useMutation({
    mutationFn: async () => {
      await adminFetch('/settings/app', {
        method: 'PUT',
        body: JSON.stringify({
          maxCupsPerRider: parseInt(maxCupsPerRider, 10) || 20,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-app-settings'] });
      toast.success('Delivery settings saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMessaging = useMutation({
    mutationFn: async () => {
      await adminFetch('/settings/messaging', {
        method: 'PUT',
        body: JSON.stringify({
          whatsapp: {
            enabled: whatsappEnabled,
            phoneNumberId: whatsappPhoneNumberId,
            businessAccountId: whatsappBusinessAccountId,
            callbackUrl: whatsappWebhookUrl,
            ...(whatsappAccessToken ? { accessToken: whatsappAccessToken } : {}),
            ...(whatsappVerifyToken ? { verifyToken: whatsappVerifyToken } : {}),
          },
          sms: {
            enabled: smsEnabled,
            provider: smsProvider,
            userId: smsUserId,
            senderId: smsSenderId,
            baseUrl: smsBaseUrl,
            connectionTimeoutMs: parseInt(smsConnectionTimeoutMs, 10) || 30000,
            readTimeoutMs: parseInt(smsReadTimeoutMs, 10) || 30000,
            ...(smsApiKey ? { apiKey: smsApiKey } : {}),
          },
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-messaging-settings'] });
      setWhatsappAccessToken('');
      setWhatsappVerifyToken('');
      setSmsApiKey('');
      toast.success('Messaging settings saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAppSpin = useMutation({
    mutationFn: async () => {
      await adminFetch('/settings/app', {
        method: 'PUT',
        body: JSON.stringify({
          requireAppDownload,
          androidStoreUrl: androidStoreUrl.trim() || null,
          iosStoreUrl: iosStoreUrl.trim() || null,
          androidAppIconUrl: androidAppIconUrl.trim() || null,
          iosAppIconUrl: iosAppIconUrl.trim() || null,
          spinDurationSeconds: Math.min(20, Math.max(3, parseInt(spinDurationSeconds, 10) || 8)),
          spinsPerWindow: Math.min(10, Math.max(1, parseInt(spinsPerWindow, 10) || 1)),
          spinWindowHours: (() => {
            const n = Math.max(1, parseInt(spinWindowValue, 10) || 1);
            return spinWindowUnit === 'days' ? n * 24 : n;
          })(),
          spinTrackByIp,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-app-settings'] });
      toast.success('App & spin settings saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveZone = useMutation({
    mutationFn: () => {
      const body = {
        name: zoneForm.name,
        radiusKm: parseFloat(zoneForm.radiusKm),
        fee: parseInt(zoneForm.fee),
        minOrder: parseInt(zoneForm.minOrder) || 500,
      };
      return editingZoneId
        ? adminFetch(`/settings/delivery-zones/${editingZoneId}`, { method: 'PUT', body: JSON.stringify(body) })
        : adminFetch('/settings/delivery-zones', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      refetchZones();
      setZoneForm({ name: '', radiusKm: '', fee: '', minOrder: '500' });
      setEditingZoneId(null);
      toast.success('Delivery zone saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteZone = useMutation({
    mutationFn: (id: string) => adminFetch(`/settings/delivery-zones/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refetchZones(); toast.success('Zone deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBranchOrderingHours = useMutation({
    mutationFn: () =>
      adminFetch('/settings/branch-ordering-hours', {
        method: 'PUT',
        body: JSON.stringify({
          openTime: branchOpenTime,
          closeTime: branchCloseTime,
          onlineOrderStartTime: branchOnlineStart.trim() || null,
          onlineOrderStopTime: branchOnlineStop.trim() || null,
          pickupCutoffMinutes: parseInt(branchPickupCutoff, 10) || 50,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-ordering-hours'] });
      toast.success('Branch ordering hours saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTestPush = useMutation({
    mutationFn: () =>
      adminFetch('/admin/notifications/test-customer-push', {
        method: 'POST',
        body: JSON.stringify({
          phone: testPhone.trim(),
          title: testTitle.trim() || undefined,
          message: testMessage.trim() || undefined,
        }),
      }),
    onSuccess: (payload) => {
      setTestResult(payload);
      if (!payload.fcmConfigured) {
        toast.error('FCM is not configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON).');
        return;
      }
      if (payload.pushTokensTargeted === 0) {
        toast.error('Customer found, but no device has registered for push yet. Open the mobile app while logged in.');
        return;
      }
      toast.success(`Test push sent to ${payload.pushTokensSent}/${payload.pushTokensTargeted} device(s).`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!admin) return null;

  const methodKeys: MethodKey[] = ['PAYHERE', 'CASH_AT_COUNTER'];
  const pageLoading = superAdmin ? isLoading || !methods : appSettingsLoading || branchHoursLoading;

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-10">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-subtle p-3">
          <Settings size={22} className="text-brand" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-fg">Settings</h1>
          <p className="text-sm text-muted">
            {superAdmin
              ? 'Payment, delivery, operations, messaging, loyalty, and app settings'
              : 'Ordering hours, pickup queue, and delivery limits'}
          </p>
        </div>
      </div>

      {pageLoading ? (
        <div className="card p-8 text-center text-muted">Loading settings...</div>
      ) : (
        <div className="space-y-6">
          <Tabs value={resolvedTab} onValueChange={setActiveTab} className="w-full min-w-0">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-navy-light p-1.5">
              {superAdmin ? (
                <>
                  <TabsTrigger value="payments" className="h-auto flex-none gap-2 px-3 py-2">
                    <CreditCard size={16} />
                    Payments
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="h-auto flex-none gap-2 px-3 py-2">
                    <Truck size={16} />
                    Delivery
                  </TabsTrigger>
                  <TabsTrigger value="operations" className="h-auto flex-none gap-2 px-3 py-2">
                    <ShoppingBag size={16} />
                    Operations
                  </TabsTrigger>
                  <TabsTrigger value="messaging" className="h-auto flex-none gap-2 px-3 py-2">
                    <MessageCircle size={16} />
                    Messaging
                  </TabsTrigger>
                  <TabsTrigger value="loyalty" className="h-auto flex-none gap-2 px-3 py-2">
                    <Gift size={16} />
                    Loyalty
                  </TabsTrigger>
                  <TabsTrigger value="app" className="h-auto flex-none gap-2 px-3 py-2">
                    <Smartphone size={16} />
                    App & spin
                  </TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="hours" className="h-auto flex-none gap-2 px-3 py-2">
                    <Clock size={16} />
                    Ordering hours
                  </TabsTrigger>
                  <TabsTrigger value="operations" className="h-auto flex-none gap-2 px-3 py-2">
                    <ShoppingBag size={16} />
                    Operations
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="h-auto flex-none gap-2 px-3 py-2">
                    <Truck size={16} />
                    Delivery
                  </TabsTrigger>
                  <TabsTrigger value="messaging" className="h-auto flex-none gap-2 px-3 py-2">
                    <Bell size={16} />
                    Notifications
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </Tabs>

          {superAdmin && resolvedTab === 'payments' && methods && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-brand" />
              Payment methods
            </h2>
            <p className="text-xs text-muted mb-4">
              Enable or disable options shown at checkout. Disabled methods cannot be selected by customers.
            </p>
            <div className="space-y-4">
              {methodKeys.map((key) => {
                const m = methods[key];
                if (!m) return null;
                return (
                  <div key={key} className="p-4 rounded-xl border border-navy-border space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{m.label}</p>
                        <p className="text-xs text-muted font-mono">{key}</p>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-muted">{m.enabled ? 'On' : 'Off'}</span>
                        <input
                          type="checkbox"
                          checked={m.enabled}
                          onChange={(e) =>
                            setMethods((prev) =>
                              prev ? { ...prev, [key]: { ...prev[key], enabled: e.target.checked } } : prev
                            )
                          }
                          className="w-5 h-5 accent-brand"
                        />
                      </label>
                    </div>
                    <input
                      className="input-field text-sm"
                      value={m.label}
                      onChange={(e) =>
                        setMethods((prev) =>
                          prev ? { ...prev, [key]: { ...prev[key], label: e.target.value } } : prev
                        )
                      }
                      placeholder="Display label"
                    />
                    <div className="flex gap-2 flex-wrap">
                      {(['DELIVERY', 'TAKEAWAY'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            const modes = m.modes.includes(mode)
                              ? m.modes.filter((x) => x !== mode)
                              : [...m.modes, mode];
                            setMethods((prev) =>
                              prev ? { ...prev, [key]: { ...prev[key], modes } } : prev
                            );
                          }}
                          className={`chip text-xs ${m.modes.includes(mode) ? 'chip-active' : ''}`}
                        >
                          {mode === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {superAdmin && resolvedTab === 'delivery' && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Truck size={18} className="text-brand" />
              Delivery pricing (global)
            </h2>
            <p className="text-xs text-muted mb-4">Distance-based fees apply to all branches. Use radius 999 for out-of-range surcharge.</p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-border text-muted text-xs">
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Max km</th>
                    <th className="text-left py-2">Fee</th>
                    <th className="text-left py-2">Min order</th>
                    <th className="text-left py-2" />
                  </tr>
                </thead>
                <tbody>
                  {deliveryZones.map((z: any) => (
                    <tr key={z.id} className="border-b border-navy-border/50">
                      <td className="py-2 text-white">{z.name}</td>
                      <td className="py-2 text-muted">{z.radiusKm}</td>
                      <td className="py-2 text-brand">LKR {z.fee}</td>
                      <td className="py-2 text-muted">{z.minOrder}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="text-xs text-brand mr-2"
                          onClick={() => {
                            setEditingZoneId(z.id);
                            setZoneForm({
                              name: z.name,
                              radiusKm: String(z.radiusKm),
                              fee: String(z.fee),
                              minOrder: String(z.minOrder),
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="text-xs text-red-400" onClick={() => deleteZone.mutate(z.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid sm:grid-cols-4 gap-3">
              <input className="input-field text-sm" placeholder="Zone name" value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="input-field text-sm" type="number" placeholder="Max km" value={zoneForm.radiusKm} onChange={(e) => setZoneForm((f) => ({ ...f, radiusKm: e.target.value }))} />
              <input className="input-field text-sm" type="number" placeholder="Fee LKR" value={zoneForm.fee} onChange={(e) => setZoneForm((f) => ({ ...f, fee: e.target.value }))} />
              <input className="input-field text-sm" type="number" placeholder="Min order" value={zoneForm.minOrder} onChange={(e) => setZoneForm((f) => ({ ...f, minOrder: e.target.value }))} />
            </div>
            <button type="button" onClick={() => saveZone.mutate()} disabled={saveZone.isPending} className="btn-outline mt-3 px-4 py-2 text-sm">
              {editingZoneId ? 'Update zone' : 'Add zone'}
            </button>
          </div>
          )}

          {!superAdmin && resolvedTab === 'hours' && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Clock size={18} className="text-brand" />
              Online ordering hours
            </h2>
            <p className="text-xs text-muted mb-4">
              {branchStoreName
                ? `Control when customers can order from ${branchStoreName} on the website.`
                : 'Control when customers can place pickup and delivery orders on the website.'}
            </p>
            <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="text-xs text-muted block mb-1">Store open</label>
                <input className="input-field" type="time" value={branchOpenTime} onChange={(e) => setBranchOpenTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Store close</label>
                <input className="input-field" type="time" value={branchCloseTime} onChange={(e) => setBranchCloseTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Online orders start (optional)</label>
                <input className="input-field" type="time" value={branchOnlineStart} onChange={(e) => setBranchOnlineStart(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Online orders stop (optional)</label>
                <input className="input-field" type="time" value={branchOnlineStop} onChange={(e) => setBranchOnlineStop(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Pickup stops before close (minutes)</label>
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  max={180}
                  value={branchPickupCutoff}
                  onChange={(e) => setBranchPickupCutoff(e.target.value)}
                />
              </div>
            </div>
          </div>
          )}

          {resolvedTab === 'operations' && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
              <ShoppingBag size={18} className="text-brand" />
              Pickup queue — order editing
            </h2>
            <p className="text-xs text-muted mb-4">
              Control when staff can change pickup orders from the orders page before pickup is confirmed.
            </p>
            <div className="space-y-4">
              <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-white">Allow adding items — online payment (paid)</p>
                  <p className="text-xs text-muted mt-1">
                    When enabled, staff can add items to pickup orders paid online. Removals and quantity decreases stay blocked.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={pickupAllowAddItemsPaidOnline}
                  onChange={(e) => setPickupAllowAddItemsPaidOnline(e.target.checked)}
                  className="w-5 h-5 accent-brand mt-0.5 shrink-0"
                />
              </label>
              <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-white">Allow full edit — cash at counter (unpaid)</p>
                  <p className="text-xs text-muted mt-1">
                    When enabled, staff can change quantities, add items, or remove items on unpaid cash pickup orders.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={pickupAllowEditCashUnpaid}
                  onChange={(e) => setPickupAllowEditCashUnpaid(e.target.checked)}
                  className="w-5 h-5 accent-brand mt-0.5 shrink-0"
                />
              </label>
            </div>
          </div>
          )}

          {resolvedTab === 'delivery' && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Truck size={18} className="text-brand" />
              Delivery — rider capacity
            </h2>
            <p className="text-xs text-muted mb-3">
              Maximum total cups one rider can carry per delivery group when classifying orders.
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <input
                className="input-field"
                type="number"
                min={1}
                max={100}
                value={maxCupsPerRider}
                onChange={(e) => setMaxCupsPerRider(e.target.value)}
              />
              <span className="text-muted text-sm whitespace-nowrap">cups per rider</span>
            </div>
          </div>
          )}

          {resolvedTab === 'operations' && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
              <RefreshCw size={18} className="text-brand" />
              Weekly stock reset schedule
            </h2>
            <p className="text-xs text-muted mb-3">
              Choose which day of the week the branch performs its weekly stock reset.
              When you close the branch, you will be reminded the day before and prompted on the reset day.
            </p>
            <div className="max-w-xs">
              <label className="text-xs text-muted block mb-1">Reset day</label>
              <select
                className="input-field"
                value={weeklyResetDay}
                onChange={(e) => setWeeklyResetDay(e.target.value)}
              >
                {WEEKLY_RESET_DAY_OPTIONS.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          )}

          {superAdmin && resolvedTab === 'operations' && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2">Order cancellation window</h2>
            <p className="text-xs text-muted mb-3">
              How long after an order is placed customers can cancel with a full refund while the order is still in Received status.
            </p>
            <div className="max-w-xs">
              <label className="text-xs text-muted block mb-1">Cancel window (minutes)</label>
              <input
                className="input-field"
                type="number"
                min={1}
                max={120}
                value={cancelWindowMinutes}
                onChange={(e) => setCancelWindowMinutes(e.target.value)}
              />
            </div>
          </div>
          )}

          {superAdmin && resolvedTab === 'operations' && (
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2">Pickup order amount limit</h2>
            <p className="text-xs text-muted mb-3">
              Maximum payable total (LKR) for takeaway orders placed online. Leave empty or set 0 for no limit.
              Orders above this total cannot be confirmed on the website. Changing this amount requires confirmation and your admin PIN.
            </p>
            <div className="max-w-xs">
              <label className="text-xs text-muted block mb-1">Maximum pickup order amount (LKR)</label>
              <input
                className="input-field"
                type="number"
                min={0}
                step={1}
                value={pickupMaxOrderAmount}
                onChange={(e) => setPickupMaxOrderAmount(e.target.value)}
                placeholder="No limit"
              />
            </div>
          </div>
          )}

          {superAdmin && resolvedTab === 'payments' && (
          <>
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2">Convenience fees</h2>
            <p className="text-xs text-muted mb-3">
              Applied to online pickup and delivery orders as a percentage of item subtotal.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
              <div>
                <label className="text-xs text-muted block mb-1">Pickup convenience fee (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input-field"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={pickupConvenienceFeePercent}
                    onChange={(e) => setPickupConvenienceFeePercent(e.target.value)}
                  />
                  <span className="text-muted text-sm">%</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Delivery convenience fee (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input-field"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={deliveryConvenienceFeePercent}
                    onChange={(e) => setDeliveryConvenienceFeePercent(e.target.value)}
                  />
                  <span className="text-muted text-sm">%</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Payment gateway fee (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input-field"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={gatewayFeePercent}
                    onChange={(e) => setGatewayFeePercent(e.target.value)}
                  />
                  <span className="text-muted text-sm">%</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Applied to branch revenue when calculating payout gateway deductions.
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted block mb-1">Branch commission slabs</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <span className="text-[11px] text-muted">Net amount up to (LKR)</span>
                    <input
                      className="input-field mt-1"
                      type="number"
                      min="0"
                      value={commissionSlab1UpTo}
                      onChange={(e) => setCommissionSlab1UpTo(e.target.value)}
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-muted">Rate at/below threshold (%)</span>
                    <input
                      className="input-field mt-1"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={commissionSlab1RatePercent}
                      onChange={(e) => setCommissionSlab1RatePercent(e.target.value)}
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-muted">Rate above threshold (%)</span>
                    <input
                      className="input-field mt-1"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={commissionSlab2RatePercent}
                      onChange={(e) => setCommissionSlab2RatePercent(e.target.value)}
                    />
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Applied on the second payout of each two-window cycle using full-cycle net sales.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Delivery platform fee (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input-field"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={deliveryPlatformFeePercent}
                    onChange={(e) => setDeliveryPlatformFeePercent(e.target.value)}
                  />
                  <span className="text-muted text-sm">%</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Taken from delivery fees first in Delivery Wallet, before the payment gateway fee.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2">Online payment gateway</h2>
            <p className="text-xs text-muted mb-4">
              Choose one gateway for online checkout. Only one gateway can be active at a time.
            </p>
            <div className="flex gap-3 mb-6">
              <button
                type="button"
                onClick={() => setActiveOnlineGateway('PAYHERE')}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  activeOnlineGateway === 'PAYHERE'
                    ? 'border-brand bg-brand/10 text-white'
                    : 'border-navy-border text-muted hover:text-white'
                }`}
              >
                PayHere
              </button>
              <button
                type="button"
                onClick={() => setActiveOnlineGateway('WEBXPAY')}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  activeOnlineGateway === 'WEBXPAY'
                    ? 'border-brand bg-brand/10 text-white'
                    : 'border-navy-border text-muted hover:text-white'
                }`}
              >
                WebXPay
              </button>
            </div>

            {activeOnlineGateway === 'PAYHERE' ? (
              <>
                <h3 className="font-semibold text-white mb-2">PayHere credentials</h3>
                <p className="text-xs text-muted mb-4">
                  Use your{' '}
                  <a href="https://sandbox.payhere.lk" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    PayHere Sandbox
                  </a>{' '}
                  merchant ID and secret. Leave secret blank to keep the current value.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Environment</label>
                    <select
                      className="input-field"
                      value={payhereMode}
                      onChange={(e) => setPayhereMode(e.target.value as 'sandbox' | 'live')}
                    >
                      <option value="sandbox">Sandbox (testing)</option>
                      <option value="live">Live (production)</option>
                    </select>
                  </div>
                  <input
                    className="input-field"
                    placeholder="Merchant ID"
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                  />
                  <input
                    className="input-field"
                    type="password"
                    placeholder={
                      data?.payhere?.merchantSecretSet
                        ? 'Merchant secret (leave blank to keep current)'
                        : 'Merchant secret'
                    }
                    value={merchantSecret}
                    onChange={(e) => setMerchantSecret(e.target.value)}
                  />
                  {data?.payhere?.configured && activeOnlineGateway === 'PAYHERE' && (
                    <p className="text-xs text-green-400">✓ PayHere credentials configured</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-white mb-2">WebXPay credentials</h3>
                <p className="text-xs text-muted mb-4">
                  From{' '}
                  <a href="https://signup.webxpay.com/merchant-settings" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    WebXPay Dashboard → Settings → Integration Information
                  </a>
                  . Set the Return URL in WebXPay to your backend return endpoint (shown below).
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Environment</label>
                    <select
                      className="input-field"
                      value={webxpayMode}
                      onChange={(e) => setWebxpayMode(e.target.value as 'sandbox' | 'live')}
                    >
                      <option value="sandbox">Staging (testing)</option>
                      <option value="live">Live (production)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Public key</label>
                    <textarea
                      className="input-field min-h-[120px] resize-y font-mono text-xs"
                      placeholder={
                        data?.webxpay?.publicKeySet
                          ? 'Public key saved (paste to replace)'
                          : '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'
                      }
                      value={webxpayPublicKey}
                      onChange={(e) => setWebxpayPublicKey(e.target.value)}
                    />
                  </div>
                  <input
                    className="input-field"
                    type="password"
                    placeholder={
                      data?.webxpay?.secretKeySet
                        ? 'Secret key (leave blank to keep current)'
                        : 'Secret key'
                    }
                    value={webxpaySecretKey}
                    onChange={(e) => setWebxpaySecretKey(e.target.value)}
                  />
                  <input
                    className="input-field"
                    placeholder="API username (tokenization — optional)"
                    value={webxpayApiUsername}
                    onChange={(e) => setWebxpayApiUsername(e.target.value)}
                  />
                  <input
                    className="input-field"
                    type="password"
                    placeholder={
                      data?.webxpay?.apiPasswordSet
                        ? 'API password (leave blank to keep current)'
                        : 'API password (optional)'
                    }
                    value={webxpayApiPassword}
                    onChange={(e) => setWebxpayApiPassword(e.target.value)}
                  />
                  <div>
                    <label className="text-xs text-muted block mb-1">Return URL (set in WebXPay dashboard)</label>
                    <input
                      className="input-field font-mono text-xs"
                      placeholder={getWebxpayReturnUrlHint()}
                      value={webxpayReturnUrl}
                      onChange={(e) => setWebxpayReturnUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted mt-1">
                      Add this URL in WebXPay Dashboard → Settings → Return URL:{' '}
                      <code className="text-brand/80">{getWebxpayReturnUrlHint()}</code>
                    </p>
                  </div>
                  {data?.webxpay?.configured && activeOnlineGateway === 'WEBXPAY' && (
                    <p className="text-xs text-green-400">✓ WebXPay credentials configured</p>
                  )}
                </div>
              </>
            )}
          </div>
          <PlatformDiscountPaybackSettings />
          </>
          )}

          {superAdmin && resolvedTab === 'messaging' && (
          <>
          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
              <MessageCircle size={18} className="text-emerald-400" />
              WhatsApp ordering
            </h2>
            <p className="text-xs text-muted mb-4">
              Connect WhatsApp Business Cloud API so customers can order through WhatsApp.
              Orders appear in the admin panel with channel <span className="text-emerald-300">🟢 WhatsApp</span>.
              Leave access token / verify token blank to keep current values.
            </p>
            {whatsappLiveStatus?.token && (
              <div
                className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                  whatsappLiveStatus.token.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                    : 'border-red-500/40 bg-red-500/10 text-red-50'
                }`}
              >
                <p className="font-semibold">
                  Live token: {whatsappLiveStatus.token.status.toUpperCase()}
                  {whatsappLiveStatus.token.displayPhoneNumber
                    ? ` · ${whatsappLiveStatus.token.displayPhoneNumber}`
                    : ''}
                </p>
                <p className="mt-1 text-xs opacity-90">{whatsappLiveStatus.token.detail}</p>
                {!whatsappLiveStatus.token.ok && (
                  <p className="mt-2 text-xs opacity-90">
                    Meta temporary tokens expire in ~24 hours. Generate a new Access Token (or a permanent
                    System User token), paste it below, and Save. Also set CapRover env{' '}
                    <code className="text-white/80">WHATSAPP_ACCESS_TOKEN</code>.
                  </p>
                )}
                {whatsappLiveStatus.lastInbound && (
                  <p className="mt-2 text-xs opacity-80">
                    Last inbound ({whatsappLiveStatus.lastInbound.source}):{' '}
                    {new Date(whatsappLiveStatus.lastInbound.at).toLocaleString()} from{' '}
                    {whatsappLiveStatus.lastInbound.from}
                  </p>
                )}
              </div>
            )}
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-navy-border bg-navy-light/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">Enable WhatsApp orders</p>
                <p className="text-xs text-muted">
                  {whatsappConfigured
                    ? 'Credentials look complete'
                    : 'Add Phone Number ID and Access Token to finish setup'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={whatsappEnabled}
                onClick={() => setWhatsappEnabled((v) => !v)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  whatsappEnabled ? 'bg-emerald-500' : 'bg-navy-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                    whatsappEnabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            <div className="space-y-3 max-w-2xl">
              <div>
                <label className="text-xs text-muted block mb-1">Phone number ID</label>
                <input
                  className="input-field font-mono text-sm"
                  placeholder="WhatsApp Phone Number ID"
                  value={whatsappPhoneNumberId}
                  onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Business account ID</label>
                <input
                  className="input-field font-mono text-sm"
                  placeholder="WhatsApp Business Account ID (optional)"
                  value={whatsappBusinessAccountId}
                  onChange={(e) => setWhatsappBusinessAccountId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Access token</label>
                <input
                  className="input-field"
                  type="password"
                  placeholder={
                    whatsappAccessTokenSet
                      ? 'Access token saved (leave blank to keep current)'
                      : 'Permanent / system user access token'
                  }
                  value={whatsappAccessToken}
                  onChange={(e) => setWhatsappAccessToken(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Webhook verify token</label>
                <input
                  className="input-field"
                  type="password"
                  placeholder={
                    whatsappVerifyTokenSet
                      ? 'Verify token saved (leave blank to keep current)'
                      : 'Custom string you set in Meta webhook'
                  }
                  value={whatsappVerifyToken}
                  onChange={(e) => setWhatsappVerifyToken(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Webhook callback URL (Meta)</label>
                <input
                  className="input-field font-mono text-sm"
                  placeholder="https://bing-chun-ui2ow.ondigitalocean.app/api/whatsapp/webhook"
                  value={whatsappWebhookUrl}
                  onChange={(e) => setWhatsappWebhookUrl(e.target.value)}
                />
                <p className="text-[11px] text-muted mt-1">
                  Saved to DB and pasted in Meta → WhatsApp → Configuration. Use HTTPS (Meta rejects
                  plain http://). Verify token must match the value saved above.
                </p>
              </div>
              {whatsappEnabled && whatsappConfigured && (
                <p className="text-xs text-emerald-400">✓ WhatsApp ordering is enabled</p>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Phone size={18} className="text-brand" />
              SMS gateway (SMSlenz)
            </h2>
            <p className="text-xs text-muted mb-4">
              Used for login OTP, delivery codes, payment receipts, pickup-ready, and out-for-delivery texts.
              Leave the API key blank to keep the current value.
            </p>
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-navy-border bg-navy-light/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">Enable SMS sending</p>
                <p className="text-xs text-muted">
                  {smsConfigured
                    ? 'Credentials look complete'
                    : 'Add User ID, Sender ID, and API key to finish setup'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={smsEnabled}
                onClick={() => setSmsEnabled((v) => !v)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  smsEnabled ? 'bg-brand' : 'bg-navy-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                    smsEnabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            <div className="space-y-3 max-w-2xl">
              <div>
                <label className="text-xs text-muted block mb-1">Provider</label>
                <select
                  className="input-field"
                  value={smsProvider}
                  onChange={(e) => setSmsProvider(e.target.value === 'mock' ? 'mock' : 'smslenz')}
                >
                  <option value="smslenz">SMSlenz</option>
                  <option value="mock">Mock (log only, do not send)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Base URL</label>
                <input
                  className="input-field font-mono text-sm"
                  placeholder="https://smslenz.lk"
                  value={smsBaseUrl}
                  onChange={(e) => setSmsBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">User ID</label>
                <input
                  className="input-field font-mono text-sm"
                  placeholder="SMSlenz user ID"
                  value={smsUserId}
                  onChange={(e) => setSmsUserId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Sender ID</label>
                <input
                  className="input-field font-mono text-sm"
                  placeholder="Approved sender ID (case sensitive)"
                  value={smsSenderId}
                  onChange={(e) => setSmsSenderId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">API key</label>
                <input
                  className="input-field"
                  type="password"
                  placeholder={
                    smsApiKeySet
                      ? 'API key saved (leave blank to keep current)'
                      : 'SMSlenz API key'
                  }
                  value={smsApiKey}
                  onChange={(e) => setSmsApiKey(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Connect timeout (ms)</label>
                  <input
                    className="input-field font-mono text-sm"
                    inputMode="numeric"
                    value={smsConnectionTimeoutMs}
                    onChange={(e) => setSmsConnectionTimeoutMs(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Read timeout (ms)</label>
                  <input
                    className="input-field font-mono text-sm"
                    inputMode="numeric"
                    value={smsReadTimeoutMs}
                    onChange={(e) => setSmsReadTimeoutMs(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
              {smsEnabled && smsConfigured && smsProvider === 'smslenz' && (
                <p className="text-xs text-emerald-400">✓ SMS gateway is enabled</p>
              )}
            </div>
          </div>
          </>
          )}

          {resolvedTab === 'messaging' && (
          <div className="card p-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-fg">
              <Bell size={18} className="text-brand" />
              Test customer push notification
            </h2>
            <p className="mb-4 text-xs text-muted">
              Send a test push to a customer&apos;s phone. The customer must be logged into the mobile app
              and have allowed notifications so their FCM token is registered.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Customer phone</label>
                <input
                  className="input-field"
                  placeholder="07XXXXXXXX"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Title</label>
                <input
                  className="input-field"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Message</label>
                <textarea
                  className="input-field min-h-[88px] resize-y"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => sendTestPush.mutate()}
                disabled={sendTestPush.isPending || !testPhone.trim()}
                className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"
              >
                <Bell size={16} />
                {sendTestPush.isPending ? 'Sending…' : 'Send test notification'}
              </button>
              {testResult && (
                <div className="space-y-1 rounded-xl border border-navy-border p-3 text-xs">
                  {testResult.user && (
                    <p className="text-fg">
                      Customer: <span className="font-medium">{testResult.user.name}</span> ({testResult.user.phone})
                    </p>
                  )}
                  <p className="text-muted">FCM configured: {testResult.fcmConfigured ? 'Yes' : 'No'}</p>
                  <p className="text-muted">Devices targeted: {testResult.pushTokensTargeted}</p>
                  <p className="text-muted">Push sent: {testResult.pushTokensSent}</p>
                  <p className="text-muted">In-app socket: {testResult.socketEmitted ? 'Emitted' : 'Not connected'}</p>
                </div>
              )}
            </div>
          </div>
          )}

          {superAdmin && resolvedTab === 'loyalty' && <LoyaltyProgramSettings />}

          {superAdmin && resolvedTab === 'loyalty' && (
            <div className="card p-5">
              <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
                <Gift size={18} className="text-brand" />
                New customer journey
              </h2>
              <p className="text-xs text-muted mb-4">
                Configure the 1st-order discount, 2nd-order free gift, and 3rd-order Spin &amp; Win unlock.
                Branch-specific overrides are available under{' '}
                <a href="/admin/loyalty" className="text-brand hover:underline">Loyalty Rules</a>.
              </p>
              <LoyaltyCampaignDashboard branchMode={false} embedMode />
            </div>
          )}

          {superAdmin && resolvedTab === 'app' && (
            <div className="card p-5">
              <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
                <Smartphone size={18} className="text-brand" />
                Mobile app & spin claim
              </h2>
              <p className="text-xs text-muted mb-4">
                After winning on the spin wheel, mobile users can be sent to the app store. Desktop users can always claim on the web.
              </p>

              <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer mb-4">
                <div>
                  <p className="text-sm font-medium text-white">Require app download to claim (mobile)</p>
                  <p className="text-xs text-muted mt-1">
                    When off, Android and iPhone users claim on the website like desktop. When on, they are redirected to the store links below.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={requireAppDownload}
                  onChange={(e) => setRequireAppDownload(e.target.checked)}
                  className="w-5 h-5 accent-brand mt-0.5 shrink-0"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted block mb-1">Google Play Store URL</label>
                  <input
                    className="input-field"
                    type="url"
                    placeholder="https://play.google.com/store/apps/details?id=..."
                    value={androidStoreUrl}
                    onChange={(e) => setAndroidStoreUrl(e.target.value)}
                  />
                  <label className="text-xs text-muted block mb-1 mt-3">Android app icon URL (optional)</label>
                  <input
                    className="input-field"
                    type="url"
                    placeholder="https://..."
                    value={androidAppIconUrl}
                    onChange={(e) => setAndroidAppIconUrl(e.target.value)}
                  />
                  {androidAppIconUrl.trim() && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={androidAppIconUrl.trim()} alt="" className="mt-2 h-10 w-10 rounded-lg border border-navy-border object-cover" />
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Apple App Store URL</label>
                  <input
                    className="input-field"
                    type="url"
                    placeholder="https://apps.apple.com/app/..."
                    value={iosStoreUrl}
                    onChange={(e) => setIosStoreUrl(e.target.value)}
                  />
                  <label className="text-xs text-muted block mb-1 mt-3">iOS app icon URL (optional)</label>
                  <input
                    className="input-field"
                    type="url"
                    placeholder="https://..."
                    value={iosAppIconUrl}
                    onChange={(e) => setIosAppIconUrl(e.target.value)}
                  />
                  {iosAppIconUrl.trim() && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={iosAppIconUrl.trim()} alt="" className="mt-2 h-10 w-10 rounded-lg border border-navy-border object-cover" />
                  )}
                </div>
              </div>
            </div>
          )}

          {superAdmin && resolvedTab === 'app' && (
            <div className="card p-5">
              <h2 className="font-semibold text-white mb-2 flex items-center gap-2">
                <Dices size={18} className="text-brand" />
                Spin wheel
              </h2>
              <p className="text-xs text-muted mb-4">
                Control how long the wheel spins, how many times a customer can play, and when they can play again.
                Spins are counted by account, guest device, and IP address. For eligibility rules (first order, days, campaign dates), use{' '}
                <a href="/admin/spin" className="text-brand hover:underline">Spin Wheel</a>.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted block mb-1">Spin animation time (seconds)</label>
                  <input
                    className="input-field"
                    type="number"
                    min={3}
                    max={20}
                    value={spinDurationSeconds}
                    onChange={(e) => setSpinDurationSeconds(e.target.value)}
                  />
                  <p className="text-[11px] text-muted mt-1">How long the wheel turns before it stops. 8 seconds is a good default.</p>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Spins allowed in the window</label>
                  <input
                    className="input-field"
                    type="number"
                    min={1}
                    max={10}
                    value={spinsPerWindow}
                    onChange={(e) => setSpinsPerWindow(e.target.value)}
                  />
                  <p className="text-[11px] text-muted mt-1">Usually 1 — one spin per customer in the window below.</p>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Wait time before they can spin again</label>
                  <div className="flex gap-2">
                    <input
                      className="input-field flex-1"
                      type="number"
                      min={1}
                      max={spinWindowUnit === 'days' ? 30 : 720}
                      value={spinWindowValue}
                      onChange={(e) => setSpinWindowValue(e.target.value)}
                    />
                    <select
                      className="input-field w-28"
                      value={spinWindowUnit}
                      onChange={(e) => setSpinWindowUnit(e.target.value === 'days' ? 'days' : 'hours')}
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-muted mt-1">Example: 1 day + 1 spin = once per day.</p>
                </div>
                <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-navy-border cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-white">Count by IP address</p>
                    <p className="text-xs text-muted mt-1">
                      Same Wi-Fi / IP cannot keep spinning by clearing the browser. Keep this on.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={spinTrackByIp}
                    onChange={(e) => setSpinTrackByIp(e.target.checked)}
                    className="w-5 h-5 accent-brand mt-0.5 shrink-0"
                  />
                </label>
              </div>
            </div>
          )}

          {(
            (resolvedTab === 'hours' && !superAdmin) ||
            (resolvedTab === 'payments' && superAdmin) ||
            resolvedTab === 'delivery' ||
            resolvedTab === 'operations' ||
            (resolvedTab === 'messaging' && superAdmin) ||
            (resolvedTab === 'app' && superAdmin)
          ) && (
          <div className="sticky bottom-4 z-10 pt-2">
          {resolvedTab === 'hours' && !superAdmin && (
            <TabSaveButton
              onClick={() => saveBranchOrderingHours.mutate()}
              pending={saveBranchOrderingHours.isPending}
              label="Save ordering hours"
            />
          )}
          {resolvedTab === 'payments' && superAdmin && (
            <TabSaveButton
              onClick={() => savePayments.mutate()}
              pending={savePayments.isPending}
              label="Save payment settings"
            />
          )}
          {resolvedTab === 'delivery' && (
            <TabSaveButton
              onClick={() => saveDeliverySettings.mutate()}
              pending={saveDeliverySettings.isPending}
              label="Save delivery settings"
            />
          )}
          {resolvedTab === 'operations' && (
            <TabSaveButton
              onClick={() => void handleSaveOperations()}
              pending={saveOperations.isPending}
              label="Save operations settings"
            />
          )}
          {resolvedTab === 'messaging' && superAdmin && (
            <TabSaveButton
              onClick={() => saveMessaging.mutate()}
              pending={saveMessaging.isPending}
              label="Save messaging settings"
            />
          )}
          {resolvedTab === 'app' && superAdmin && (
            <TabSaveButton
              onClick={() => saveAppSpin.mutate()}
              pending={saveAppSpin.isPending}
              label="Save app & spin settings"
            />
          )}
          </div>
          )}
        </div>
      )}

      <AdminPinGateModal
        open={pinGateOpen}
        onClose={() => {
          if (!saveOperations.isPending) setPinGateOpen(false);
        }}
        onVerified={(pin) => {
          saveOperations.mutate(pin);
        }}
        apiBase={getApiBaseUrl()}
        busy={saveOperations.isPending}
        titleId="pickup-max-pin-title"
        inputId="pickup-max-pin"
        description="Enter your admin PIN to confirm this pickup order amount limit."
      />
    </div>
  );
}
