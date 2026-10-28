/// Pickup orders above this subtotal (LKR) must be paid online.
const int pickupOnlinePaymentThreshold = 1000;

bool requiresOnlinePaymentForPickup(int subtotal) =>
    subtotal >= pickupOnlinePaymentThreshold;
