export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  sortOrder: number;
  _count?: { products: number };
}

export interface Topping {
  id: string;
  name: string;
  extraPrice: number;
  isAvailable: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  ingredients?: string;
  basePrice: number;
  cost?: number;
  imageUrl?: string;
  imageUrls?: string[];
  tag?: string;
  isAvailable: boolean;
  category: { id: string; name: string; slug: string };
  toppings: { topping: Topping }[];
  storeAvailability?: ProductStoreAvailability;
  avgRating?: number | null;
  ratingCount?: number;
  wishlistCount?: number;
  isOutOfStock?: boolean;
}

export type ProductSortMode = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'popular';

export interface DailySpecial {
  id: string;
  specialPrice: number;
  startsAt: string;
  endsAt: string;
  product: Product;
}

export interface ProductStoreAvailability {
  atSelectedStore: boolean;
  branchStock?: {
    quantity: number;
    inStock: boolean;
    weeklyBaseQty?: number;
    isLowStock?: boolean;
    isOutOfStock?: boolean;
    isComingSoon?: boolean;
  };
  fulfillmentStore?: {
    id: string;
    name: string;
    addressLine: string;
    city: string;
    distanceKm: number;
    stock?: number;
  };
}

export interface CartItem {
  id: string;
  productId: string;
  product: { id: string; name: string; imageUrl?: string; basePrice: number };
  size: 'REGULAR' | 'LARGE';
  quantity: number;
  unitPrice: number;
  toppings: { topping: Topping }[];
}

export interface Cart {
  id: string;
  orderMode: 'DELIVERY' | 'TAKEAWAY';
  storeId?: string;
  items: CartItem[];
  subtotal: number;
}

export interface Store {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  phone?: string;
  openTime: string;
  closeTime: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
  isActive: boolean;
  isBusy: boolean;
  branchClosedAt?: string | null;
  distanceKm?: number;
  deliveryZones?: DeliveryZone[];
}

export interface ReverseGeocodeResult {
  address: string;
  lat: number;
  lng: number;
}

export interface DeliveryZone {
  id: string;
  storeId: string;
  name: string;
  radiusKm: number;
  fee: number;
  minOrder: number;
}

export interface DeliveryBranchOption {
  id: string;
  name: string;
  addressLine: string;
  lat: number;
  lng: number;
  openTime: string;
  closeTime: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
  distanceKm: number;
  fee: number;
  suggested: boolean;
  branchClosed?: boolean;
}

export interface DeliveryValidation {
  eligible: boolean;
  deliverable?: boolean;
  reason?: 'out-of-range' | 'branch-cannot-serve';
  message?: string;
  store?: {
    id: string;
    name: string;
    address: string;
    openTime?: string;
    closeTime?: string;
    onlineOrderStartTime?: string | null;
    onlineOrderStopTime?: string | null;
    pickupCutoffMinutes?: number;
    branchClosedAt?: string | null;
    lat?: number;
    lng?: number;
  };
  zone?: { id: string; name: string; fee: number; minOrder: number };
  distanceKm?: number;
  estimatedMinutes?: number;
  suggestedBranches?: DeliveryBranchOption[];
  nearestBranch?: { id: string; name: string; distanceKm: number };
}

export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type OrderMode = 'DELIVERY' | 'TAKEAWAY';
export type PaymentMethod = 'CARD' | 'PAYHERE' | 'CASH_AT_COUNTER' | 'LOYALTY_POINTS';

export interface OrderStatusEvent {
  id: string;
  status: OrderStatus;
  note?: string;
  actorAdminId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  createdAt: string;
}

export interface Refund {
  id: string;
  orderId: string;
  customerId?: string;
  customerName?: string;
  submittedBy?: 'CUSTOMER' | 'BRANCH_ADMIN';
  cancellationReason: string;
  customReasonText?: string;
  cancelledWithinWindow: boolean;
  salesTotal: number;
  deliveryFee: number;
  convenienceFee: number;
  orderTotal: number;
  refundPercentage?: number | null;
  refundAmount?: number | null;
  penaltyAmount?: number | null;
  returningSubtotal?: number | null;
  notReturningSubtotal?: number | null;
  returningDeliveryFee?: number | null;
  returningConvenienceFee?: number | null;
  nonRefundableDeliveryFee?: number | null;
  nonRefundableConvenienceFee?: number | null;
  additionalGatewayFee?: number | null;
  cancelReasonConfigId?: string | null;
  configuredMinPercentage?: number | null;
  configuredMaxPercentage?: number | null;
  exceededRange?: boolean;
  exceededRangeReason?: string | null;
  cancelledAtStatus?: OrderStatus | null;
  configuredStatusRefundPercentage?: number | null;
  status: 'RECEIVED' | 'COMPLETE' | 'REJECTED';
  adminNotes?: string;
  processedByAdminId?: string;
  processedAt?: string;
  paidAt?: string | null;
  paidByAdminId?: string | null;
  paymentNote?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: Order;
}

export interface Order {
  id: string;
  orderNumber: string;
  trackToken?: string;
  orderMode: OrderMode;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  paymentFailureReason?: string | null;
  subtotal: number;
  deliveryFee: number;
  convenientFee: number;
  discount: number;
  loyaltyDiscount: number;
  total: number;
  prepaidAmount?: number;
  cashReceivedAmount?: number | null;
  changeGivenAmount?: number | null;
  promoCode?: string;
  qrCode?: string;
  pickupTime?: string;
  queuePosition?: number | null;
  scheduledPickupAt?: string | null;
  estimatedMinutes: number;
  store: { id: string; name: string; addressLine: string; lat: number; lng: number };
  address?: { addressLine: string; city: string };
  items: OrderItem[];
  statusEvents: OrderStatusEvent[];
  guestName?: string | null;
  guestPhone?: string | null;
  user?: { name: string; phone: string } | null;
  /** Sales channel: WEB | APP | POS | WHATSAPP | TELEGRAM */
  channel?: string | null;
  deliveryAddressLine?: string | null;
  deliveryCity?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  /** Present while a delivery OTP is live — also pushed over socket as `deliveryCode`. */
  deliveryCode?: string | null;
  deliveryPhase?: 'TO_OUTLET' | 'TO_CUSTOMER' | null;
  deliveryPickedUp?: boolean;
  deliveryPickedUpAt?: string | null;
  driverLocation?: {
    lat: number;
    lng: number;
    heading?: number | null;
    speedKph?: number | null;
    recordedAt?: string;
  } | null;
  assignedDriver?: {
    id: string;
    name: string;
    phone?: string | null;
    vehicleType?: string | null;
    vehicleNumber?: string | null;
    vehicleColor?: string | null;
    profilePhotoUrl?: string | null;
  } | null;
  processedByAdminId?: string | null;
  processedByName?: string | null;
  processedAt?: string | null;
  createdAt: string;
  canCancel?: boolean;
  cancelWindowEndsAt?: string | null;
  cancelRefundTier?: 'full' | 'partial' | null;
  cancelWindowExpired?: boolean;
  cancelWindowMinutes?: number;
  cancelRefundPercentage?: number | null;
  estimatedCancelRefund?: number | null;
  canEdit?: boolean;
  canAddItems?: boolean;
  editMode?: 'full' | 'add_only' | null;
  balanceDue?: number;
  platformRating?: {
    stars: number;
    comment: string | null;
    createdAt: string;
  } | null;
  riderRating?: {
    stars: number;
    comment: string | null;
    createdAt: string;
  } | null;
  refund?: Refund;
  cancelledBy?: string | null;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  product?: { imageUrl?: string | null };
  size: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  toppings: { toppingName: string; extraPrice: number }[];
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  loyaltyPoints: number;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  isPhoneVerified?: boolean;
  needsPhoneNumber?: boolean;
  /** Soft-deleted accounts can sign in but are limited to the profile page. */
  isDeleted?: boolean;
}

export interface Address {
  id: string;
  label: string;
  addressLine: string;
  city: string;
  district: string;
  lat?: number;
  lng?: number;
  isDefault: boolean;
}

export interface PromoCode {
  id?: string;
  code: string;
  title?: string;
  description?: string;
  discountType: string;
  discountValue: number;
  minOrderValue: number;
  maxUses?: number;
  usedCount?: number;
  isActive?: boolean;
  expiresAt?: string;
  criteria?: string[];
  ownership?: string;
  branchSharePct?: number | null;
  platformSharePct?: number | null;
  branchShareSplits?: Record<string, { branchSharePct: number; platformSharePct: number }> | null;
  cardDesign?: import('@/lib/promotionCardDesign').PromotionCardDesignSet;
  promotionKind?: string;
  promotionRules?: import('@/lib/promotionTypes').PromotionRules;
  sortOrder?: number;
  showOnHome?: boolean;
}

export interface AddressAutocomplete {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
}

export type DriverDutyStatus = 'ONLINE' | 'ON_DELIVERY' | 'OFF_DUTY';

export interface DriverBranch {
  id: string;
  name: string;
  city?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone?: string | null;
  nicNumber?: string | null;
  address?: string | null;
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  vehicleColor?: string | null;
  licenseNumber?: string | null;
  disabilities?: string | null;
  profilePhotoUrl?: string | null;
  licenseImageUrl?: string | null;
  isActive: boolean;
  dutyStatus: DriverDutyStatus;
  pinLookup?: string | null;
  lastLoginAt?: string | null;
  store?: DriverBranch | null;
  accessibleStores: DriverBranch[];
  completedJobCount: number;
  totalDeliveryFees: number;
  avgRiderRating: number | null;
  riderRatingCount: number;
  meritPoints?: number;
  meritStatus?: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'WARNING' | 'CRITICAL';
}

export interface DriverRating {
  id: string;
  orderNumber: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

export interface DriverRatingsPayload {
  average: number | null;
  count: number;
  ratings: DriverRating[];
}
