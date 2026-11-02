-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "delivery";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."OrderMode" AS ENUM ('DELIVERY', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "public"."BatchStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'WRITTEN_OFF', 'FROZEN');

-- CreateEnum
CREATE TYPE "public"."BatchType" AS ENUM ('NORMAL', 'EMERGENCY', 'RESET');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."CancelReason" AS ENUM ('OUT_OF_STOCK', 'CUSTOMER_REQUEST', 'PAYMENT_OR_SYSTEM_ISSUE');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CARD', 'PAYHERE', 'CASH_ON_DELIVERY', 'CASH_AT_COUNTER', 'LOYALTY_POINTS');

-- CreateEnum
CREATE TYPE "public"."PaymentGateway" AS ENUM ('PAYHERE', 'WEBXPAY');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."OrderChannel" AS ENUM ('WEB', 'APP', 'POS', 'WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "public"."MessagingChannel" AS ENUM ('WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "public"."ConversationState" AS ENUM ('NEW', 'SELECTING_STORE', 'BROWSING_PRODUCTS', 'SELECTING_PRODUCT', 'ADDING_PRODUCT', 'VIEWING_CART', 'CHECKOUT', 'COLLECTING_CUSTOMER_DETAILS', 'SELECTING_PAYMENT', 'CONFIRMING_ORDER', 'ORDER_CREATED', 'TRACKING_ORDER');

-- CreateEnum
CREATE TYPE "public"."ChannelMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "public"."MessageSenderType" AS ENUM ('CUSTOMER', 'BOT', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "delivery"."DeliveryJobStatus" AS ENUM ('SCHEDULED', 'ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING', 'COMPLETED', 'CANCELLED', 'VEHICLE_FAILURE');

-- CreateEnum
CREATE TYPE "public"."DriverDutyStatus" AS ENUM ('ONLINE', 'ON_DELIVERY', 'OFF_DUTY');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "public"."ProductSize" AS ENUM ('REGULAR', 'LARGE');

-- CreateEnum
CREATE TYPE "public"."StockChangeType" AS ENUM ('ORDER_DEDUCTION', 'ORDER_RESTORATION', 'MANUAL_ADJUSTMENT', 'WEEKLY_RESET', 'BATCH_RECEIVED', 'BATCH_ADJUSTMENT', 'WASTAGE', 'EXPIRY_WRITE_OFF');

-- CreateEnum
CREATE TYPE "public"."StoreProductReservationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."WalletTransactionType" AS ENUM ('ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT', 'REFUND', 'PAYOUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."SettlementStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."SettlementPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CHECK', 'ONLINE');

-- CreateEnum
CREATE TYPE "public"."WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PlatformSettlementStatus" AS ENUM ('OPEN', 'SETTLED');

-- CreateEnum
CREATE TYPE "public"."DeliveryAttemptOutcome" AS ENUM ('DELIVERED', 'CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'REFUSED', 'PAYMENT_FAILED', 'OTHER', 'VEHICLE_FAILURE');

-- CreateEnum
CREATE TYPE "public"."DeliveryDomainState" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'PICKED_UP', 'EN_ROUTE', 'ARRIVED', 'AWAITING_OTP', 'DELIVERED', 'FAILED', 'RETURNED_TO_STORE');

-- CreateEnum
CREATE TYPE "public"."RefundStatus" AS ENUM ('RECEIVED', 'COMPLETE', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."RefundSubmittedBy" AS ENUM ('CUSTOMER', 'BRANCH_ADMIN');

-- CreateEnum
CREATE TYPE "public"."SpinOfferType" AS ENUM ('PERCENTAGE', 'FIXED', 'FREE_DELIVERY', 'GIFT', 'NO_PRIZE');

-- CreateEnum
CREATE TYPE "public"."MeritEventType" AS ENUM ('INITIAL', 'LATE_DELIVERY', 'CANCEL_BEFORE_PICKUP', 'CONFIRMED_COMPLAINT', 'SERIOUS_VIOLATION', 'RECOVERY_BONUS', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."MeritStatusBand" AS ENUM ('EXCELLENT', 'GOOD', 'AVERAGE', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."DriverComplaintStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."DriverBranchRequestType" AS ENUM ('ADD_BRANCH', 'CHANGE_BRANCH', 'REMOVE_BRANCH');

-- CreateEnum
CREATE TYPE "public"."DriverBranchRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."JasonLedgerType" AS ENUM ('INVESTMENT', 'EXPENSE');

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "facebookId" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT true,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifySms" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "bannedAt" TIMESTAMP(3),
    "bannedReason" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "referredByUserId" TEXT,
    "wishlistShareToken" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_channels" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "public"."MessagingChannel" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_sessions" (
    "id" TEXT NOT NULL,
    "channel" "public"."MessagingChannel" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "customerId" TEXT,
    "storeId" TEXT,
    "state" "public"."ConversationState" NOT NULL DEFAULT 'NEW',
    "cartJson" JSONB NOT NULL DEFAULT '[]',
    "contextJson" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."channel_messages" (
    "id" TEXT NOT NULL,
    "channel" "public"."MessagingChannel" NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "direction" "public"."ChannelMessageDirection" NOT NULL,
    "senderType" "public"."MessageSenderType" NOT NULL DEFAULT 'CUSTOMER',
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "payload" JSONB,
    "bodyText" TEXT,
    "orderId" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ORDER_STATUS',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNumber" TEXT,
    "status" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."otp_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "openTime" TEXT NOT NULL DEFAULT '09:00',
    "closeTime" TEXT NOT NULL DEFAULT '23:00',
    "onlineOrderStartTime" TEXT,
    "onlineOrderStopTime" TEXT,
    "pickupCutoffMinutes" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBusy" BOOLEAN NOT NULL DEFAULT false,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "deliveryOtpRequired" BOOLEAN NOT NULL DEFAULT false,
    "completionRadiusM" INTEGER,
    "platformDiscountPaybackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "branchClosedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_zones" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "fee" INTEGER NOT NULL,
    "minOrder" INTEGER NOT NULL DEFAULT 500,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "ingredients" TEXT,
    "basePrice" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "imageUrls" JSONB,
    "tag" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isDeliveryAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isCombo" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."product_ratings" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" VARCHAR(100),
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wishlist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_specials" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "specialPrice" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_specials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."store_products" (
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "weeklyBaseQty" INTEGER NOT NULL DEFAULT 0,
    "weeklyRemainingQty" INTEGER NOT NULL DEFAULT 0,
    "weeklyTargetQty" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER,
    "onlineOutOfStockThreshold" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "branchDeactivatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_products_pkey" PRIMARY KEY ("storeId","productId")
);

-- CreateTable
CREATE TABLE "public"."store_product_reservations" (
    "id" TEXT NOT NULL,
    "reservationUuid" TEXT NOT NULL,
    "userId" TEXT,
    "cartId" TEXT,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderId" TEXT,
    "status" "public"."StoreProductReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_product_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stock_audit_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "changeType" "public"."StockChangeType" NOT NULL,
    "qtyBefore" INTEGER NOT NULL,
    "qtyChange" INTEGER NOT NULL,
    "qtyAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "adminUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stock_batches" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "batchType" "public"."BatchType" NOT NULL DEFAULT 'NORMAL',
    "batchGroupId" TEXT,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "receivedQty" INTEGER NOT NULL,
    "remainingQty" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "unitCost" INTEGER,
    "expiryDate" TIMESTAMP(3),
    "status" "public"."BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stock_batch_groups" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "resetDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batch_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stock_batch_allocations" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reversedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batch_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stock_batch_counters" (
    "storeId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_batch_counters_pkey" PRIMARY KEY ("storeId","dateKey")
);

-- CreateTable
CREATE TABLE "public"."toppings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "extraPrice" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "toppings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."product_toppings" (
    "productId" TEXT NOT NULL,
    "toppingId" TEXT NOT NULL,

    CONSTRAINT "product_toppings_pkey" PRIMARY KEY ("productId","toppingId")
);

-- CreateTable
CREATE TABLE "public"."carts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderMode" "public"."OrderMode" NOT NULL DEFAULT 'DELIVERY',
    "storeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cart_items" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" "public"."ProductSize" NOT NULL DEFAULT 'REGULAR',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cart_item_toppings" (
    "cartItemId" TEXT NOT NULL,
    "toppingId" TEXT NOT NULL,

    CONSTRAINT "cart_item_toppings_pkey" PRIMARY KEY ("cartItemId","toppingId")
);

-- CreateTable
CREATE TABLE "public"."orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "trackToken" TEXT,
    "idempotencyKey" TEXT,
    "userId" TEXT,
    "guestName" TEXT,
    "guestPhone" TEXT,
    "guestEmail" TEXT,
    "storeId" TEXT NOT NULL,
    "deliveryZoneId" TEXT,
    "addressId" TEXT,
    "orderMode" "public"."OrderMode" NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "paymentMethod" "public"."PaymentMethod" NOT NULL,
    "paymentGateway" "public"."PaymentGateway",
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentRef" TEXT,
    "paymentFailureReason" TEXT,
    "subtotal" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "convenientFee" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "loyaltyDiscount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "prepaidAmount" INTEGER NOT NULL DEFAULT 0,
    "onlineChargeAmount" INTEGER,
    "cashReceivedAmount" INTEGER,
    "changeGivenAmount" INTEGER,
    "promoCode" TEXT,
    "qrCode" TEXT,
    "pickupTime" TEXT,
    "queuePosition" INTEGER,
    "scheduledPickupAt" TIMESTAMP(3),
    "pickupReminderSent" BOOLEAN NOT NULL DEFAULT false,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "deliveryAddressLine" TEXT,
    "deliveryCity" TEXT,
    "deliveryDistrict" TEXT,
    "deliveryLat" DOUBLE PRECISION,
    "deliveryLng" DOUBLE PRECISION,
    "platform" INTEGER NOT NULL DEFAULT 0,
    "channel" "public"."OrderChannel" NOT NULL DEFAULT 'WEB',
    "cancelReason" "public"."CancelReason",
    "cancelledBy" TEXT,
    "cancelledAtStatus" "public"."OrderStatus",
    "cancelWindowStartsAt" TIMESTAMP(3),
    "processedByAdminId" TEXT,
    "processedByName" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."platform_ratings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "stars" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."rider_ratings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "userId" TEXT,
    "stars" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "size" "public"."ProductSize" NOT NULL DEFAULT 'REGULAR',
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_item_toppings" (
    "orderItemId" TEXT NOT NULL,
    "toppingId" TEXT NOT NULL,
    "toppingName" TEXT NOT NULL,
    "extraPrice" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_item_toppings_pkey" PRIMARY KEY ("orderItemId","toppingId")
);

-- CreateTable
CREATE TABLE "public"."order_status_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "public"."OrderStatus" NOT NULL,
    "note" TEXT,
    "actorAdminId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "promotionKind" TEXT,
    "promotionRules" JSONB,
    "usageLimits" JSONB,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" INTEGER NOT NULL,
    "minOrderValue" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "criteria" JSONB,
    "ownership" TEXT,
    "contributionSource" TEXT DEFAULT 'JASON',
    "branchSharePct" INTEGER,
    "platformSharePct" INTEGER,
    "branchShareSplits" JSONB,
    "cardDesign" JSONB,
    "storeIds" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "showOnHome" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."promotion_usages" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "promoCodeId" TEXT,
    "promoCode" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "ownership" TEXT NOT NULL,
    "contributionSource" TEXT DEFAULT 'JASON',
    "branchSharePct" INTEGER NOT NULL DEFAULT 0,
    "platformSharePct" INTEGER NOT NULL DEFAULT 100,
    "promotionKind" TEXT,
    "promotionRules" JSONB,
    "orderSubtotal" INTEGER NOT NULL,
    "totalDiscountAmount" INTEGER NOT NULL,
    "branchShareAmount" INTEGER NOT NULL DEFAULT 0,
    "platformShareAmount" INTEGER NOT NULL DEFAULT 0,
    "offerDetails" JSONB,
    "platformPaybackEligible" BOOLEAN NOT NULL DEFAULT false,
    "platformPaybackAmount" INTEGER NOT NULL DEFAULT 0,
    "platformPaybackSettledAt" TIMESTAMP(3),
    "platformPaybackWithdrawalId" TEXT,
    "platformPaybackReversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loyalty_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "type" "public"."NotificationType" NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."admin_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pinLookup" TEXT,
    "phone" TEXT,
    "nicNumber" TEXT,
    "address" TEXT,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "vehicleColor" TEXT,
    "licenseNumber" TEXT,
    "disabilities" TEXT,
    "profilePhotoUrl" TEXT,
    "licenseImageUrl" TEXT,
    "dutyStatus" "public"."DriverDutyStatus" NOT NULL DEFAULT 'OFF_DUTY',
    "meritPoints" INTEGER NOT NULL DEFAULT 100,
    "consecutiveSuccessfulDeliveries" INTEGER NOT NULL DEFAULT 0,
    "roleId" TEXT NOT NULL,
    "storeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "menu" TEXT NOT NULL,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_jobs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "driverId" TEXT,
    "title" TEXT NOT NULL,
    "rideCode" TEXT,
    "status" "delivery"."DeliveryJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "returnStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalCups" INTEGER,
    "estimatedDistanceKm" DOUBLE PRECISION,
    "estimatedMinutes" INTEGER,
    "totalDistanceKm" DOUBLE PRECISION,
    "totalDeliveryFees" DECIMAL(20,4),
    "actualDistanceKm" DOUBLE PRECISION,
    "actualRoute" TEXT,
    "completedLat" DOUBLE PRECISION,
    "completedLng" DOUBLE PRECISION,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "pickupLabel" TEXT,
    "riderRatingSum" INTEGER NOT NULL DEFAULT 0,
    "riderRatingCount" INTEGER NOT NULL DEFAULT 0,
    "broadcastedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_job_orders" (
    "jobId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_job_orders_pkey" PRIMARY KEY ("jobId","orderId")
);

-- CreateTable
CREATE TABLE "public"."admin_notifications" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NEW_ORDER',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "orderId" TEXT,
    "productId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "paymentMethods" JSONB NOT NULL,
    "activeOnlineGateway" TEXT NOT NULL DEFAULT 'PAYHERE',
    "payhereMerchantId" TEXT,
    "payhereMerchantSecret" TEXT,
    "payhereMode" TEXT NOT NULL DEFAULT 'sandbox',
    "webxpayPublicKey" TEXT,
    "webxpaySecretKey" TEXT,
    "webxpayApiUsername" TEXT,
    "webxpayApiPassword" TEXT,
    "webxpayMode" TEXT NOT NULL DEFAULT 'sandbox',
    "webxpayReturnUrl" TEXT,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAccessToken" TEXT,
    "whatsappPhoneNumberId" TEXT,
    "whatsappBusinessAccountId" TEXT,
    "whatsappVerifyToken" TEXT,
    "whatsappCallbackUrl" TEXT,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsProvider" TEXT NOT NULL DEFAULT 'smslenz',
    "smsUserId" TEXT,
    "smsApiKey" TEXT,
    "smsSenderId" TEXT,
    "smsBaseUrl" TEXT,
    "smsConnectionTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "smsReadTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loyalty_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pointsPerLkr" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "redeemValue" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "maxRedeemPct" INTEGER NOT NULL DEFAULT 100,
    "minOrderToEarn" INTEGER NOT NULL DEFAULT 200,
    "referralBonusPoints" INTEGER NOT NULL DEFAULT 100,
    "customerRedeemEnabled" BOOLEAN NOT NULL DEFAULT true,
    "checkoutRedeemEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minPointsToRedeem" INTEGER NOT NULL DEFAULT 100,
    "tiersJson" JSONB,
    "redeemRewardsJson" JSONB,
    "upcomingOffersJson" JSONB,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."app_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "convenientFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.075,
    "pickupConvenientFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "gatewayFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.019,
    "deliveryPlatformFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickupAllowAddItemsPaidOnline" BOOLEAN NOT NULL DEFAULT true,
    "pickupAllowEditCashUnpaid" BOOLEAN NOT NULL DEFAULT true,
    "maxCupsPerRider" INTEGER NOT NULL DEFAULT 20,
    "deliveryMilestone1Orders" INTEGER NOT NULL DEFAULT 50,
    "deliveryMilestone2Orders" INTEGER NOT NULL DEFAULT 150,
    "deliveryMilestone3Orders" INTEGER NOT NULL DEFAULT 300,
    "requireAppDownload" BOOLEAN NOT NULL DEFAULT true,
    "androidStoreUrl" VARCHAR(512),
    "iosStoreUrl" VARCHAR(512),
    "androidAppIconUrl" VARCHAR(512),
    "iosAppIconUrl" VARCHAR(512),
    "spinDurationSeconds" INTEGER NOT NULL DEFAULT 8,
    "spinsPerWindow" INTEGER NOT NULL DEFAULT 1,
    "spinWindowHours" INTEGER NOT NULL DEFAULT 24,
    "spinTrackByIp" BOOLEAN NOT NULL DEFAULT true,
    "spinEnabled" BOOLEAN NOT NULL DEFAULT true,
    "spinFirstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "spinRequireLogin" BOOLEAN NOT NULL DEFAULT false,
    "spinDaysOfWeekJson" JSONB,
    "spinTimeStart" VARCHAR(5),
    "spinTimeEnd" VARCHAR(5),
    "spinStartsAt" TIMESTAMP(3),
    "spinExpiresAt" TIMESTAMP(3),
    "spinMaxPerDay" INTEGER,
    "spinMaxPerCustomer" INTEGER,
    "spinDisplayJson" JSONB,
    "spinCriteriaJson" JSONB,
    "cancelWindowMinutes" INTEGER NOT NULL DEFAULT 10,
    "branchCompletionRadiusM" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."store_wallets" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "totalEarnings" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "totalWithdrawn" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "lastSettledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."store_withdrawals" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "status" "public"."WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paymentMethod" "public"."SettlementPaymentMethod",
    "proofUrl" TEXT,
    "checkNumber" TEXT,
    "checkDate" TIMESTAMP(3),
    "invoiceRef" TEXT,
    "invoiceUrl" TEXT,
    "invoiceData" JSONB,
    "breakdown" JSONB,
    "isAdvance" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "walletTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_payouts" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "status" "public"."WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "requestedById" TEXT NOT NULL,
    "breakdown" JSONB,
    "rejectionReason" TEXT,
    "paymentMethod" "public"."SettlementPaymentMethod",
    "proofUrl" TEXT,
    "checkNumber" TEXT,
    "checkDate" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wallet_transactions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "public"."WalletTransactionType" NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "balanceAfter" DECIMAL(20,4) NOT NULL,
    "paymentMethod" "public"."PaymentMethod",
    "paymentRef" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "createdById" TEXT,
    "settledAt" TIMESTAMP(3),
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."commission_settlements" (
    "id" TEXT NOT NULL,
    "statementRef" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "status" "public"."SettlementStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "paymentMethod" "public"."SettlementPaymentMethod" NOT NULL,
    "receiptUrl" TEXT,
    "breakdown" JSONB NOT NULL,
    "totalCommission" DECIMAL(20,4) NOT NULL,
    "totalProviderFee" DECIMAL(20,4) NOT NULL,
    "platformPaybackAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "submittedById" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "storeWithdrawalId" TEXT,
    "invoiceRef" TEXT,
    "invoiceUrl" TEXT,
    "invoiceData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."platform_earnings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeWithdrawalId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "calendarMonth" TEXT NOT NULL,
    "commissionAmount" DECIMAL(20,4) NOT NULL,
    "convenienceFeeAmount" DECIMAL(20,4) NOT NULL,
    "platformPaybackAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "sharedPromoContributionAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "loyaltyDiscountAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "netPlatformCommissionAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "completedRefundConvenienceAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "rejectedRefundConvenienceAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "netPlatformEarningsAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "eligibleProviderAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "gatewayDeductionAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "totalEarned" DECIMAL(20,4) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."platform_monthly_settlements" (
    "id" TEXT NOT NULL,
    "calendarMonth" TEXT NOT NULL,
    "totalCommission" DECIMAL(20,4) NOT NULL,
    "totalConvenienceFee" DECIMAL(20,4) NOT NULL,
    "totalEarned" DECIMAL(20,4) NOT NULL,
    "status" "public"."PlatformSettlementStatus" NOT NULL DEFAULT 'OPEN',
    "settledAt" TIMESTAMP(3),
    "settledByAdminId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_monthly_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_access_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedById" TEXT,
    "changedByName" TEXT,
    "reason" TEXT,
    "ordersAtChange" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."platform_payback_setting_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "previousValue" BOOLEAN NOT NULL,
    "newValue" BOOLEAN NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_payback_setting_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."driver_locations" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "jobId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "batteryPct" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."driver_shifts" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."driver_devices" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT,
    "fcmToken" TEXT,
    "refreshTokenHash" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_attempts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "outcome" "public"."DeliveryAttemptOutcome" NOT NULL,
    "note" TEXT,
    "photoUrl" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_otps" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "jobId" TEXT,
    "driverId" TEXT,
    "state" "public"."DeliveryDomainState" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_outbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loyalty_campaigns" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "offer1Enabled" BOOLEAN NOT NULL DEFAULT true,
    "offer1DiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "offer1DiscountValue" INTEGER NOT NULL DEFAULT 20,
    "offer1WebDiscountValue" INTEGER NOT NULL DEFAULT 20,
    "offer1AppDiscountValue" INTEGER NOT NULL DEFAULT 30,
    "offer1MinSubtotal" INTEGER NOT NULL DEFAULT 0,
    "offer2Enabled" BOOLEAN NOT NULL DEFAULT true,
    "offer2DiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "offer2DiscountValue" INTEGER NOT NULL DEFAULT 5,
    "offer2RewardType" TEXT NOT NULL DEFAULT 'GIFT',
    "offer2GiftProductId" TEXT,
    "offer2WindowDays" INTEGER NOT NULL DEFAULT 7,
    "offer2MinSubtotal" INTEGER NOT NULL DEFAULT 0,
    "offer3Enabled" BOOLEAN NOT NULL DEFAULT true,
    "offer3RequiredOrders" INTEGER NOT NULL DEFAULT 3,
    "offer3MinOrderAmount" INTEGER NOT NULL DEFAULT 1000,
    "offer3WinChanceNumerator" INTEGER NOT NULL DEFAULT 1,
    "offer3WinChanceDenominator" INTEGER NOT NULL DEFAULT 10,
    "offer3OptionAMinEach" INTEGER NOT NULL DEFAULT 1500,
    "offer3OptionBCombinedMin" INTEGER NOT NULL DEFAULT 4500,
    "offer3MatchMode" TEXT NOT NULL DEFAULT 'A_OR_B',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "ownership" TEXT DEFAULT 'PLATFORM',
    "contributionSource" TEXT DEFAULT 'JASON',
    "branchSharePct" INTEGER DEFAULT 0,
    "platformSharePct" INTEGER DEFAULT 100,
    "branchShareSplits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."spin_wheel_offers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "offerType" "public"."SpinOfferType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "color" TEXT NOT NULL DEFAULT '#307ef2',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minOrderValue" INTEGER NOT NULL DEFAULT 0,
    "giftProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "spin_wheel_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."spin_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestKey" TEXT,
    "clientIp" TEXT,
    "offerId" TEXT NOT NULL,
    "claimCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "spin_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cancel_reason_configs" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "minRefundPercentage" DOUBLE PRECISION NOT NULL,
    "maxRefundPercentage" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancel_reason_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_status_refund_configs" (
    "id" TEXT NOT NULL,
    "orderStatus" "public"."OrderStatus" NOT NULL,
    "refundPercentage" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_status_refund_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "submittedBy" "public"."RefundSubmittedBy" NOT NULL DEFAULT 'CUSTOMER',
    "cancellationReason" TEXT NOT NULL,
    "customReasonText" TEXT,
    "cancelledWithinWindow" BOOLEAN NOT NULL DEFAULT false,
    "salesTotal" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "convenienceFee" INTEGER NOT NULL DEFAULT 0,
    "orderTotal" INTEGER NOT NULL,
    "refundPercentage" DOUBLE PRECISION,
    "refundAmount" INTEGER,
    "penaltyAmount" INTEGER,
    "returningSubtotal" INTEGER,
    "notReturningSubtotal" INTEGER,
    "returningDeliveryFee" INTEGER,
    "returningConvenienceFee" INTEGER,
    "nonRefundableDeliveryFee" INTEGER,
    "nonRefundableConvenienceFee" INTEGER,
    "additionalGatewayFee" INTEGER,
    "cancelReasonConfigId" TEXT,
    "configuredMinPercentage" DOUBLE PRECISION,
    "configuredMaxPercentage" DOUBLE PRECISION,
    "exceededRange" BOOLEAN NOT NULL DEFAULT false,
    "exceededRangeReason" TEXT,
    "cancelledAtStatus" "public"."OrderStatus",
    "configuredStatusRefundPercentage" DOUBLE PRECISION,
    "status" "public"."RefundStatus" NOT NULL DEFAULT 'RECEIVED',
    "adminNotes" TEXT,
    "processedByAdminId" TEXT,
    "processedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidByAdminId" TEXT,
    "paymentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."delivery_job_rejections" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_job_rejections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."driver_complaints" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."DriverComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."driver_branch_requests" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "public"."DriverBranchRequestType" NOT NULL,
    "fromStoreId" TEXT,
    "toStoreId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "public"."DriverBranchRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_branch_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."merit_point_history" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "previousPoints" INTEGER NOT NULL,
    "changedPoints" INTEGER NOT NULL,
    "newPoints" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "eventType" "public"."MeritEventType" NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merit_point_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery"."rider_profiles" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "pinLookup" TEXT,
    "phone" TEXT,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "vehicleColor" TEXT,
    "licenseNumber" TEXT,
    "disabilities" TEXT,
    "profilePhotoUrl" TEXT,
    "licenseImageUrl" TEXT,
    "dutyStatus" "public"."DriverDutyStatus" NOT NULL DEFAULT 'OFF_DUTY',
    "meritPoints" INTEGER NOT NULL DEFAULT 100,
    "consecutiveSuccessfulDeliveries" INTEGER NOT NULL DEFAULT 0,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."jason_ledger_entries" (
    "id" TEXT NOT NULL,
    "type" "public"."JasonLedgerType" NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "storeId" TEXT,
    "storeWithdrawalId" TEXT,
    "balanceBefore" DECIMAL(20,4),
    "balanceAfter" DECIMAL(20,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jason_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customer_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_adminuseraccessiblestores" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "public"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "public"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "public"."users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_facebookId_key" ON "public"."users"("facebookId");

-- CreateIndex
CREATE UNIQUE INDEX "users_wishlistShareToken_key" ON "public"."users"("wishlistShareToken");

-- CreateIndex
CREATE INDEX "users_referredByUserId_idx" ON "public"."users"("referredByUserId");

-- CreateIndex
CREATE INDEX "users_bannedAt_idx" ON "public"."users"("bannedAt");

-- CreateIndex
CREATE INDEX "customer_channels_customerId_idx" ON "public"."customer_channels"("customerId");

-- CreateIndex
CREATE INDEX "customer_channels_phoneNumber_idx" ON "public"."customer_channels"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "customer_channels_channel_externalUserId_key" ON "public"."customer_channels"("channel", "externalUserId");

-- CreateIndex
CREATE INDEX "conversation_sessions_state_expiresAt_idx" ON "public"."conversation_sessions"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "conversation_sessions_customerId_idx" ON "public"."conversation_sessions"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_sessions_channel_externalUserId_key" ON "public"."conversation_sessions"("channel", "externalUserId");

-- CreateIndex
CREATE INDEX "channel_messages_channel_externalUserId_createdAt_idx" ON "public"."channel_messages"("channel", "externalUserId", "createdAt");

-- CreateIndex
CREATE INDEX "channel_messages_channel_externalUserId_senderType_createdA_idx" ON "public"."channel_messages"("channel", "externalUserId", "senderType", "createdAt");

-- CreateIndex
CREATE INDEX "channel_messages_channel_direction_processed_createdAt_idx" ON "public"."channel_messages"("channel", "direction", "processed", "createdAt");

-- CreateIndex
CREATE INDEX "channel_messages_orderId_idx" ON "public"."channel_messages"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_messages_channel_externalMessageId_key" ON "public"."channel_messages"("channel", "externalMessageId");

-- CreateIndex
CREATE INDEX "customer_notifications_userId_read_idx" ON "public"."customer_notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "customer_notifications_userId_createdAt_idx" ON "public"."customer_notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "public"."stores"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "public"."categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "public"."categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "public"."products"("slug");

-- CreateIndex
CREATE INDEX "product_ratings_productId_createdAt_idx" ON "public"."product_ratings"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "product_ratings_productId_stars_idx" ON "public"."product_ratings"("productId", "stars");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_userId_productId_key" ON "public"."wishlist_items"("userId", "productId");

-- CreateIndex
CREATE INDEX "daily_specials_isActive_startsAt_endsAt_idx" ON "public"."daily_specials"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "store_product_reservations_reservationUuid_idx" ON "public"."store_product_reservations"("reservationUuid");

-- CreateIndex
CREATE INDEX "store_product_reservations_storeId_productId_status_idx" ON "public"."store_product_reservations"("storeId", "productId", "status");

-- CreateIndex
CREATE INDEX "store_product_reservations_status_expiresAt_idx" ON "public"."store_product_reservations"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "store_product_reservations_userId_status_idx" ON "public"."store_product_reservations"("userId", "status");

-- CreateIndex
CREATE INDEX "store_product_reservations_orderId_idx" ON "public"."store_product_reservations"("orderId");

-- CreateIndex
CREATE INDEX "stock_audit_logs_storeId_productId_idx" ON "public"."stock_audit_logs"("storeId", "productId");

-- CreateIndex
CREATE INDEX "stock_audit_logs_createdAt_idx" ON "public"."stock_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "stock_audit_logs_changeType_idx" ON "public"."stock_audit_logs"("changeType");

-- CreateIndex
CREATE INDEX "stock_audit_logs_batchId_idx" ON "public"."stock_audit_logs"("batchId");

-- CreateIndex
CREATE INDEX "stock_batches_storeId_productId_status_receivedAt_idx" ON "public"."stock_batches"("storeId", "productId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "stock_batches_batchGroupId_idx" ON "public"."stock_batches"("batchGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_storeId_batchNumber_key" ON "public"."stock_batches"("storeId", "batchNumber");

-- CreateIndex
CREATE INDEX "stock_batch_groups_storeId_resetDate_idx" ON "public"."stock_batch_groups"("storeId", "resetDate");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batch_groups_storeId_batchNumber_key" ON "public"."stock_batch_groups"("storeId", "batchNumber");

-- CreateIndex
CREATE INDEX "stock_batch_allocations_orderId_idx" ON "public"."stock_batch_allocations"("orderId");

-- CreateIndex
CREATE INDEX "stock_batch_allocations_batchId_idx" ON "public"."stock_batch_allocations"("batchId");

-- CreateIndex
CREATE INDEX "stock_batch_allocations_storeId_productId_idx" ON "public"."stock_batch_allocations"("storeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "toppings_name_key" ON "public"."toppings"("name");

-- CreateIndex
CREATE UNIQUE INDEX "carts_userId_key" ON "public"."carts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "public"."orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_trackToken_key" ON "public"."orders"("trackToken");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "public"."orders"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "orders_paymentRef_key" ON "public"."orders"("paymentRef");

-- CreateIndex
CREATE INDEX "orders_storeId_status_orderMode_idx" ON "public"."orders"("storeId", "status", "orderMode");

-- CreateIndex
CREATE INDEX "orders_storeId_status_createdAt_idx" ON "public"."orders"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_storeId_createdAt_idx" ON "public"."orders"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_storeId_paymentStatus_createdAt_idx" ON "public"."orders"("storeId", "paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "orders_userId_createdAt_idx" ON "public"."orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_paymentStatus_createdAt_idx" ON "public"."orders"("paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "orders_channel_createdAt_idx" ON "public"."orders"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "orders_storeId_processedByAdminId_createdAt_idx" ON "public"."orders"("storeId", "processedByAdminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_ratings_orderId_key" ON "public"."platform_ratings"("orderId");

-- CreateIndex
CREATE INDEX "platform_ratings_createdAt_idx" ON "public"."platform_ratings"("createdAt");

-- CreateIndex
CREATE INDEX "platform_ratings_stars_idx" ON "public"."platform_ratings"("stars");

-- CreateIndex
CREATE UNIQUE INDEX "rider_ratings_orderId_key" ON "delivery"."rider_ratings"("orderId");

-- CreateIndex
CREATE INDEX "rider_ratings_driverId_idx" ON "delivery"."rider_ratings"("driverId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "public"."order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_status_events_orderId_createdAt_idx" ON "public"."order_status_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_events_actorAdminId_idx" ON "public"."order_status_events"("actorAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "public"."promo_codes"("code");

-- CreateIndex
CREATE INDEX "promotion_usages_orderId_idx" ON "public"."promotion_usages"("orderId");

-- CreateIndex
CREATE INDEX "promotion_usages_promoCodeId_idx" ON "public"."promotion_usages"("promoCodeId");

-- CreateIndex
CREATE INDEX "promotion_usages_storeId_createdAt_idx" ON "public"."promotion_usages"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "promotion_usages_storeId_platformPaybackSettledAt_idx" ON "public"."promotion_usages"("storeId", "platformPaybackSettledAt");

-- CreateIndex
CREATE INDEX "promotion_usages_promoCode_createdAt_idx" ON "public"."promotion_usages"("promoCode", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_userId_createdAt_idx" ON "public"."loyalty_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_orderId_type_idx" ON "public"."loyalty_transactions"("orderId", "type");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "public"."notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_sent_createdAt_idx" ON "public"."notifications"("sent", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "public"."admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_pinLookup_idx" ON "public"."admin_users"("pinLookup");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_storeId_pinLookup_key" ON "public"."admin_users"("storeId", "pinLookup");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_adminUserId_menu_key" ON "public"."permissions"("adminUserId", "menu");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_jobs_rideCode_key" ON "delivery"."delivery_jobs"("rideCode");

-- CreateIndex
CREATE INDEX "delivery_jobs_storeId_status_idx" ON "delivery"."delivery_jobs"("storeId", "status");

-- CreateIndex
CREATE INDEX "delivery_jobs_driverId_status_idx" ON "delivery"."delivery_jobs"("driverId", "status");

-- CreateIndex
CREATE INDEX "delivery_jobs_status_completedAt_idx" ON "delivery"."delivery_jobs"("status", "completedAt");

-- CreateIndex
CREATE INDEX "delivery_jobs_storeId_status_scheduledAt_idx" ON "delivery"."delivery_jobs"("storeId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "admin_notifications_adminUserId_read_idx" ON "public"."admin_notifications"("adminUserId", "read");

-- CreateIndex
CREATE INDEX "admin_notifications_storeId_createdAt_idx" ON "public"."admin_notifications"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_notifications_productId_idx" ON "public"."admin_notifications"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "store_wallets_storeId_key" ON "public"."store_wallets"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "store_withdrawals_walletTransactionId_key" ON "public"."store_withdrawals"("walletTransactionId");

-- CreateIndex
CREATE INDEX "store_withdrawals_storeId_createdAt_idx" ON "public"."store_withdrawals"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "store_withdrawals_storeId_status_idx" ON "public"."store_withdrawals"("storeId", "status");

-- CreateIndex
CREATE INDEX "delivery_payouts_createdAt_idx" ON "delivery"."delivery_payouts"("createdAt");

-- CreateIndex
CREATE INDEX "delivery_payouts_status_idx" ON "delivery"."delivery_payouts"("status");

-- CreateIndex
CREATE INDEX "delivery_payouts_periodTo_idx" ON "delivery"."delivery_payouts"("periodTo");

-- CreateIndex
CREATE INDEX "wallet_tx_store_created" ON "public"."wallet_transactions"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_tx_type" ON "public"."wallet_transactions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_tx_order_type" ON "public"."wallet_transactions"("orderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "commission_settlements_statementRef_key" ON "public"."commission_settlements"("statementRef");

-- CreateIndex
CREATE UNIQUE INDEX "commission_settlements_storeWithdrawalId_key" ON "public"."commission_settlements"("storeWithdrawalId");

-- CreateIndex
CREATE INDEX "commission_settlement_store_period" ON "public"."commission_settlements"("storeId", "periodFrom", "periodTo");

-- CreateIndex
CREATE UNIQUE INDEX "platform_earnings_storeWithdrawalId_key" ON "public"."platform_earnings"("storeWithdrawalId");

-- CreateIndex
CREATE INDEX "platform_earnings_calendarMonth_idx" ON "public"."platform_earnings"("calendarMonth");

-- CreateIndex
CREATE INDEX "platform_earnings_storeId_calendarMonth_idx" ON "public"."platform_earnings"("storeId", "calendarMonth");

-- CreateIndex
CREATE INDEX "platform_earnings_settlementId_idx" ON "public"."platform_earnings"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_monthly_settlements_calendarMonth_key" ON "public"."platform_monthly_settlements"("calendarMonth");

-- CreateIndex
CREATE INDEX "delivery_access_logs_storeId_createdAt_idx" ON "delivery"."delivery_access_logs"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "platform_payback_setting_logs_storeId_createdAt_idx" ON "public"."platform_payback_setting_logs"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "driver_locations_driverId_recordedAt_idx" ON "delivery"."driver_locations"("driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "driver_locations_jobId_recordedAt_idx" ON "delivery"."driver_locations"("jobId", "recordedAt");

-- CreateIndex
CREATE INDEX "driver_shifts_driverId_startedAt_idx" ON "delivery"."driver_shifts"("driverId", "startedAt");

-- CreateIndex
CREATE INDEX "driver_shifts_storeId_startedAt_idx" ON "delivery"."driver_shifts"("storeId", "startedAt");

-- CreateIndex
CREATE INDEX "driver_devices_deviceId_idx" ON "delivery"."driver_devices"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_devices_driverId_deviceId_key" ON "delivery"."driver_devices"("driverId", "deviceId");

-- CreateIndex
CREATE INDEX "delivery_attempts_orderId_createdAt_idx" ON "delivery"."delivery_attempts"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_attempts_jobId_idx" ON "delivery"."delivery_attempts"("jobId");

-- CreateIndex
CREATE INDEX "delivery_otps_orderId_idx" ON "delivery"."delivery_otps"("orderId");

-- CreateIndex
CREATE INDEX "delivery_events_orderId_createdAt_idx" ON "delivery"."delivery_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_events_jobId_createdAt_idx" ON "delivery"."delivery_events"("jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_outbox_idempotencyKey_key" ON "delivery"."delivery_outbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "delivery_outbox_deliveredAt_nextRetryAt_idx" ON "delivery"."delivery_outbox"("deliveredAt", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_campaigns_storeId_key" ON "public"."loyalty_campaigns"("storeId");

-- CreateIndex
CREATE INDEX "spin_wheel_offers_storeId_isActive_idx" ON "public"."spin_wheel_offers"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "spin_results_claimCode_key" ON "public"."spin_results"("claimCode");

-- CreateIndex
CREATE INDEX "spin_results_userId_status_idx" ON "public"."spin_results"("userId", "status");

-- CreateIndex
CREATE INDEX "spin_results_guestKey_status_idx" ON "public"."spin_results"("guestKey", "status");

-- CreateIndex
CREATE INDEX "spin_results_clientIp_createdAt_idx" ON "public"."spin_results"("clientIp", "createdAt");

-- CreateIndex
CREATE INDEX "spin_results_claimCode_idx" ON "public"."spin_results"("claimCode");

-- CreateIndex
CREATE UNIQUE INDEX "cancel_reason_configs_value_key" ON "public"."cancel_reason_configs"("value");

-- CreateIndex
CREATE UNIQUE INDEX "order_status_refund_configs_orderStatus_key" ON "public"."order_status_refund_configs"("orderStatus");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_orderId_key" ON "public"."refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "public"."refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_customerId_status_idx" ON "public"."refunds"("customerId", "status");

-- CreateIndex
CREATE INDEX "refunds_status_createdAt_idx" ON "public"."refunds"("status", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_job_rejections_jobId_rejectedAt_idx" ON "delivery"."delivery_job_rejections"("jobId", "rejectedAt");

-- CreateIndex
CREATE INDEX "delivery_job_rejections_driverId_rejectedAt_idx" ON "delivery"."delivery_job_rejections"("driverId", "rejectedAt");

-- CreateIndex
CREATE INDEX "driver_complaints_orderId_idx" ON "delivery"."driver_complaints"("orderId");

-- CreateIndex
CREATE INDEX "driver_complaints_driverId_createdAt_idx" ON "delivery"."driver_complaints"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "driver_complaints_storeId_status_createdAt_idx" ON "delivery"."driver_complaints"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "driver_branch_requests_driverId_status_idx" ON "delivery"."driver_branch_requests"("driverId", "status");

-- CreateIndex
CREATE INDEX "driver_branch_requests_status_createdAt_idx" ON "delivery"."driver_branch_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "merit_point_history_driverId_createdAt_idx" ON "delivery"."merit_point_history"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "merit_point_history_orderId_idx" ON "delivery"."merit_point_history"("orderId");

-- CreateIndex
CREATE INDEX "merit_point_history_eventType_createdAt_idx" ON "delivery"."merit_point_history"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rider_profiles_adminUserId_key" ON "delivery"."rider_profiles"("adminUserId");

-- CreateIndex
CREATE INDEX "rider_profiles_pinLookup_idx" ON "delivery"."rider_profiles"("pinLookup");

-- CreateIndex
CREATE INDEX "jason_ledger_entries_type_occurredAt_idx" ON "public"."jason_ledger_entries"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "jason_ledger_entries_occurredAt_idx" ON "public"."jason_ledger_entries"("occurredAt");

-- CreateIndex
CREATE INDEX "jason_ledger_entries_storeWithdrawalId_idx" ON "public"."jason_ledger_entries"("storeWithdrawalId");

-- CreateIndex
CREATE INDEX "customer_audit_logs_customerId_createdAt_idx" ON "public"."customer_audit_logs"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_adminuseraccessiblestores_AB_unique" ON "public"."_adminuseraccessiblestores"("A", "B");

-- CreateIndex
CREATE INDEX "_adminuseraccessiblestores_B_index" ON "public"."_adminuseraccessiblestores"("B");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_channels" ADD CONSTRAINT "customer_channels_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_sessions" ADD CONSTRAINT "conversation_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_sessions" ADD CONSTRAINT "conversation_sessions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."channel_messages" ADD CONSTRAINT "channel_messages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_notifications" ADD CONSTRAINT "customer_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."otp_records" ADD CONSTRAINT "otp_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_zones" ADD CONSTRAINT "delivery_zones_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_ratings" ADD CONSTRAINT "product_ratings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_ratings" ADD CONSTRAINT "product_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_specials" ADD CONSTRAINT "daily_specials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_products" ADD CONSTRAINT "store_products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_products" ADD CONSTRAINT "store_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_product_reservations" ADD CONSTRAINT "store_product_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_product_reservations" ADD CONSTRAINT "store_product_reservations_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "public"."carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_product_reservations" ADD CONSTRAINT "store_product_reservations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_product_reservations" ADD CONSTRAINT "store_product_reservations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_product_reservations" ADD CONSTRAINT "store_product_reservations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_audit_logs" ADD CONSTRAINT "stock_audit_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_audit_logs" ADD CONSTRAINT "stock_audit_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_audit_logs" ADD CONSTRAINT "stock_audit_logs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_audit_logs" ADD CONSTRAINT "stock_audit_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_audit_logs" ADD CONSTRAINT "stock_audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batches" ADD CONSTRAINT "stock_batches_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batches" ADD CONSTRAINT "stock_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batches" ADD CONSTRAINT "stock_batches_batchGroupId_fkey" FOREIGN KEY ("batchGroupId") REFERENCES "public"."stock_batch_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batches" ADD CONSTRAINT "stock_batches_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batch_groups" ADD CONSTRAINT "stock_batch_groups_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batch_groups" ADD CONSTRAINT "stock_batch_groups_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batch_allocations" ADD CONSTRAINT "stock_batch_allocations_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."stock_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batch_allocations" ADD CONSTRAINT "stock_batch_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batch_allocations" ADD CONSTRAINT "stock_batch_allocations_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "public"."order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stock_batch_counters" ADD CONSTRAINT "stock_batch_counters_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_toppings" ADD CONSTRAINT "product_toppings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_toppings" ADD CONSTRAINT "product_toppings_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "public"."toppings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carts" ADD CONSTRAINT "carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "public"."carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cart_item_toppings" ADD CONSTRAINT "cart_item_toppings_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "public"."cart_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cart_item_toppings" ADD CONSTRAINT "cart_item_toppings_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "public"."toppings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_processedByAdminId_fkey" FOREIGN KEY ("processedByAdminId") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery"."delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "public"."addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_ratings" ADD CONSTRAINT "platform_ratings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_ratings" ADD CONSTRAINT "platform_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."rider_ratings" ADD CONSTRAINT "rider_ratings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."rider_ratings" ADD CONSTRAINT "rider_ratings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."rider_ratings" ADD CONSTRAINT "rider_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_item_toppings" ADD CONSTRAINT "order_item_toppings_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "public"."order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_item_toppings" ADD CONSTRAINT "order_item_toppings_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "public"."toppings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_status_events" ADD CONSTRAINT "order_status_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_status_events" ADD CONSTRAINT "order_status_events_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotion_usages" ADD CONSTRAINT "promotion_usages_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotion_usages" ADD CONSTRAINT "promotion_usages_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "public"."promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotion_usages" ADD CONSTRAINT "promotion_usages_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."promotion_usages" ADD CONSTRAINT "promotion_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_users" ADD CONSTRAINT "admin_users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_users" ADD CONSTRAINT "admin_users_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."permissions" ADD CONSTRAINT "permissions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_jobs" ADD CONSTRAINT "delivery_jobs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_jobs" ADD CONSTRAINT "delivery_jobs_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_job_orders" ADD CONSTRAINT "delivery_job_orders_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery"."delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_job_orders" ADD CONSTRAINT "delivery_job_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_notifications" ADD CONSTRAINT "admin_notifications_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_wallets" ADD CONSTRAINT "store_wallets_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_withdrawals" ADD CONSTRAINT "store_withdrawals_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."store_withdrawals" ADD CONSTRAINT "store_withdrawals_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "public"."wallet_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."commission_settlements" ADD CONSTRAINT "commission_settlements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."commission_settlements" ADD CONSTRAINT "commission_settlements_storeWithdrawalId_fkey" FOREIGN KEY ("storeWithdrawalId") REFERENCES "public"."store_withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_earnings" ADD CONSTRAINT "platform_earnings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_earnings" ADD CONSTRAINT "platform_earnings_storeWithdrawalId_fkey" FOREIGN KEY ("storeWithdrawalId") REFERENCES "public"."store_withdrawals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_earnings" ADD CONSTRAINT "platform_earnings_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "public"."platform_monthly_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_access_logs" ADD CONSTRAINT "delivery_access_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_payback_setting_logs" ADD CONSTRAINT "platform_payback_setting_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."driver_locations" ADD CONSTRAINT "driver_locations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."driver_shifts" ADD CONSTRAINT "driver_shifts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."driver_devices" ADD CONSTRAINT "driver_devices_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_attempts" ADD CONSTRAINT "delivery_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_attempts" ADD CONSTRAINT "delivery_attempts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_otps" ADD CONSTRAINT "delivery_otps_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_events" ADD CONSTRAINT "delivery_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_campaigns" ADD CONSTRAINT "loyalty_campaigns_offer2GiftProductId_fkey" FOREIGN KEY ("offer2GiftProductId") REFERENCES "public"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."spin_wheel_offers" ADD CONSTRAINT "spin_wheel_offers_giftProductId_fkey" FOREIGN KEY ("giftProductId") REFERENCES "public"."products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."spin_wheel_offers" ADD CONSTRAINT "spin_wheel_offers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."spin_results" ADD CONSTRAINT "spin_results_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."spin_wheel_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."spin_results" ADD CONSTRAINT "spin_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refunds" ADD CONSTRAINT "refunds_cancelReasonConfigId_fkey" FOREIGN KEY ("cancelReasonConfigId") REFERENCES "public"."cancel_reason_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_job_rejections" ADD CONSTRAINT "delivery_job_rejections_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery"."delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."delivery_job_rejections" ADD CONSTRAINT "delivery_job_rejections_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."driver_complaints" ADD CONSTRAINT "driver_complaints_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."driver_complaints" ADD CONSTRAINT "driver_complaints_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."driver_branch_requests" ADD CONSTRAINT "driver_branch_requests_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."merit_point_history" ADD CONSTRAINT "merit_point_history_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery"."merit_point_history" ADD CONSTRAINT "merit_point_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_audit_logs" ADD CONSTRAINT "customer_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."customer_audit_logs" ADD CONSTRAINT "customer_audit_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_adminuseraccessiblestores" ADD CONSTRAINT "_adminuseraccessiblestores_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_adminuseraccessiblestores" ADD CONSTRAINT "_adminuseraccessiblestores_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
