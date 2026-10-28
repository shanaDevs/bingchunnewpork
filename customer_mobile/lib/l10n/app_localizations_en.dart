// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Bing Chun';

  @override
  String get tabHome => 'Home';

  @override
  String get tabMenu => 'Menu';

  @override
  String get tabOrders => 'Orders';

  @override
  String get tabAccount => 'Account';

  @override
  String get cupLabel => 'Cup';

  @override
  String get splashTagline => 'Your cup, your way';

  @override
  String get loginTitle => 'Sign in';

  @override
  String get loginSubtitle => 'We\'ll send a 6-digit code to your mobile.';

  @override
  String get phoneLabel => 'Mobile number';

  @override
  String get phoneHint => '07XXXXXXXX';

  @override
  String get phoneInvalid => 'Enter a valid Sri Lankan mobile number.';

  @override
  String get sendOtp => 'Send code';

  @override
  String get otpTitle => 'Enter code';

  @override
  String get otpSubtitle => 'Sign in with the OTP sent to your phone.';

  @override
  String get otpInvalid => 'Enter the 6-digit code.';

  @override
  String get verifyOtp => 'Verify';

  @override
  String get resendOtp => 'Resend code';

  @override
  String get registerTitle => 'Create account';

  @override
  String get registerSubtitle =>
      'New to Bing Chun? Verify your phone to get started.';

  @override
  String get nameLabel => 'Your name';

  @override
  String get nameHint => 'At least 2 characters';

  @override
  String get nameTooShort => 'Name must be at least 2 characters.';

  @override
  String get continueAction => 'Continue';

  @override
  String get alreadyHaveAccount => 'Already have an account? Sign in';

  @override
  String get newHere => 'New here? Create an account';

  @override
  String get existingPhone =>
      'This number is already registered. Sign in instead.';

  @override
  String get unknownPhone =>
      'No account for this number. Create one to continue.';

  @override
  String get logout => 'Sign out';

  @override
  String get logoutConfirm => 'Sign out of Bing Chun?';

  @override
  String get cancel => 'Cancel';

  @override
  String get retry => 'Retry';

  @override
  String get goHome => 'Go home';

  @override
  String get notFoundTitle => 'Page not found';

  @override
  String get notFoundBody => 'That link isn\'t available in the app.';

  @override
  String get comingSoon => 'Coming soon';

  @override
  String get homePlaceholder =>
      'Choose Delivery or Takeaway and browse the menu in the next update.';

  @override
  String get menuPlaceholder => 'Your branch menu will appear here.';

  @override
  String get ordersPlaceholder => 'Your orders will appear here.';

  @override
  String get accountSignedIn => 'Signed in';

  @override
  String get accountGuestTitle => 'You\'re browsing as a guest';

  @override
  String get accountGuestBody =>
      'Sign in to see orders, addresses, and rewards.';

  @override
  String get continueBrowsing => 'Continue browsing';

  @override
  String get offlineBlock => 'Connect to the internet to continue.';

  @override
  String get genericError => 'Something went wrong. Please try again.';

  @override
  String get otpRateLimited =>
      'Too many OTP requests. Please try again after 15 minutes.';

  @override
  String get cupEmpty => 'Your cup is empty';

  @override
  String get browseMenu => 'Browse menu';

  @override
  String get heroBadge => 'Since 2012';

  @override
  String get heroTitleLead => 'Freshly Brewed';

  @override
  String get heroTitleAccent => 'Bubble Tea & Ice Cream';

  @override
  String get heroSubtitle => 'Premium ingredients, crafted with love';

  @override
  String get orderNow => 'Order Now';

  @override
  String get viewMenu => 'View Menu';

  @override
  String get mostPopular => 'Most Popular';

  @override
  String get viewAll => 'View All';

  @override
  String get todaysOffers => 'Today\'s Offers';

  @override
  String get searchMenu => 'Search drinks';

  @override
  String get allItems => 'All Items';

  @override
  String get outOfStock => 'Out of stock';

  @override
  String get lowStock => 'Low stock';

  @override
  String get noProducts => 'No drinks just now.';

  @override
  String get noDrinksBody => 'The menu is empty right now.';

  @override
  String heroBadgeStores(int count) {
    return 'Since 2012 · $count stores';
  }

  @override
  String get heroTask => 'Freshly brewed bubble tea & ice cream';

  @override
  String get chooseFulfillment => 'Choose how you get your cup';

  @override
  String get modeDelivery => 'Delivery';

  @override
  String get modeTakeaway => 'Takeaway';

  @override
  String get notNow => 'Not now';

  @override
  String get howYouGetCup => 'How will you get your cup?';

  @override
  String get orderModeStepBadge => 'STEP 1 OF 2';

  @override
  String get orderModeTitle => 'How would you like to order?';

  @override
  String get orderModeSubtitle =>
      'Choose delivery or pickup — like Pizza Hut, quick and easy.';

  @override
  String get orderModeDeliverySub => 'Hot & fresh to your door';

  @override
  String get orderModeTakeawaySub => 'Pick up from a store';

  @override
  String get selectDelivery => 'Select Delivery';

  @override
  String get selectPickup => 'Select Pickup';

  @override
  String get skipForNow => 'Skip for now — you can set this later';

  @override
  String get closeSheet => 'Close';

  @override
  String get searchMenuTooltip => 'Search menu';

  @override
  String get todaysSpecial => 'Today\'s special';

  @override
  String get specialCheckoutNote => 'Checkout charges the regular price.';

  @override
  String get storesTitle => 'Stores';

  @override
  String storesCount(int count) {
    return '$count locations';
  }

  @override
  String get offlineSavedMenu => 'You\'re offline. Showing saved menu.';

  @override
  String get saveWishlist => 'Save to wishlist';

  @override
  String get removeWishlist => 'Remove from wishlist';

  @override
  String get signInToWishlist => 'Sign in to save favourites.';

  @override
  String get addToCup => 'Add to cup';

  @override
  String get promotionsTitle => 'Offers';

  @override
  String get viewAllOffers => 'View all';

  @override
  String get pickTakeawayStore => 'Choose a store';

  @override
  String get orderModeStep2Badge => 'STEP 2 OF 2';

  @override
  String get takeawayTitle => 'Choose your pickup store';

  @override
  String get takeawaySubtitle =>
      'We\'ll select the closest branch. You can switch to another anytime.';

  @override
  String get findingNearestStore => 'Finding the nearest outlet...';

  @override
  String get locationDeniedHint =>
      'Allow location to pick the closest store, or choose a branch below.';

  @override
  String get locationUnavailable =>
      'Couldn\'t get your location. Choose a store below.';

  @override
  String get useMyLocation => 'Use my location';

  @override
  String get nearestChip => 'Nearest';

  @override
  String get nearestToYou => 'Nearest to you';

  @override
  String get otherBranches => 'Or choose another store';

  @override
  String get allBranches => 'All branches';

  @override
  String get takeawaySearchHint => 'Search a store or area';

  @override
  String get confirmPickup => 'Confirm pickup';

  @override
  String confirmPickupFrom(String name) {
    return 'Confirm pickup from $name';
  }

  @override
  String get noStores => 'No branches available.';

  @override
  String get deliveryPinTitle => 'Delivery pin';

  @override
  String get deliveryPinBody =>
      'Confirm a pin on the map to set delivery. We never assume a city for you.';

  @override
  String get busyBadge => 'Busy';

  @override
  String get addToCupTitle => 'Add to cup';

  @override
  String get qtyLabel => 'Quantity';

  @override
  String menuLoaded(int count) {
    return 'Menu loaded, $count drinks';
  }

  @override
  String cupItems(int count) {
    return 'Cup, $count items';
  }

  @override
  String get wishlistTitle => 'Wishlist';

  @override
  String get allCategories => 'All';

  @override
  String get offerPrev => 'Previous offer';

  @override
  String get offerNext => 'Next offer';

  @override
  String get deliverySearchHint => 'Search an address in Sri Lanka';

  @override
  String get deliveryNotFound => 'Could not find this address.';

  @override
  String get confirmDelivery => 'Confirm delivery';

  @override
  String deliveryFee(String amount) {
    return 'Delivery fee $amount';
  }

  @override
  String deliveryMinOrder(String amount) {
    return 'Minimum order $amount';
  }

  @override
  String get changeFulfillment => 'Change';

  @override
  String get subtotal => 'Subtotal';

  @override
  String get deliveryFeeLabel => 'Delivery fee';

  @override
  String get total => 'Total';

  @override
  String get proceedCheckout => 'Proceed to Checkout';

  @override
  String get checkoutTitle => 'Checkout';

  @override
  String get contactDetails => 'Contact';

  @override
  String get paymentMethod => 'Payment';

  @override
  String get placeOrder => 'Place order';

  @override
  String get signInToPlace => 'Verify your mobile number to place this order.';

  @override
  String get noPaymentMethods => 'No payment methods available for this order.';

  @override
  String get convenienceFee => 'Convenience fee';

  @override
  String get pickupTime => 'Pickup time';

  @override
  String pickupInMinutes(int minutes) {
    return 'In $minutes min';
  }

  @override
  String get payOnlineTitle => 'Pay online';

  @override
  String get continueToPayment => 'Continue to payment';

  @override
  String get openingPayment => 'Opening secure payment…';

  @override
  String get cancelPayment => 'Cancel payment';

  @override
  String get paymentOpenFailed => 'Could not open the payment page.';

  @override
  String get paymentStayInCup =>
      'Close without paying keeps your items in the cup. This will not place the order again.';

  @override
  String get orderPlacedTitle => 'Order placed';

  @override
  String get orderPlacedBody => 'Your order number';

  @override
  String get spinTitle => 'Spin & Win';

  @override
  String get spinSriLanka => 'Sri Lanka';

  @override
  String get spinTryYourLuck => 'Try your luck!';

  @override
  String get spinSubtitle => 'Spin for free delivery, gifts & discounts.';

  @override
  String get spinSubtitlePractice => 'One more spin — your reward is waiting!';

  @override
  String get spinSubtitleCooldown => 'Your daily spin is on cooldown.';

  @override
  String get spinNow => 'Spin Now';

  @override
  String get spinning => 'Spinning…';

  @override
  String get spinAgain => 'Spin Again';

  @override
  String get spinYouWon => 'You won';

  @override
  String get spinTryAgain => 'Try Again!';

  @override
  String get spinTryAgainBody => 'Spin once more for your real prize.';

  @override
  String get spinBetterLuck => 'Better luck next time';

  @override
  String get spinUnavailable => 'Spin unavailable';

  @override
  String spinCooldown(String when) {
    return 'You can spin again after $when';
  }

  @override
  String get spinFooter => 'One spin per day. Rewards expire in 7 days.';

  @override
  String get spinHide => 'Hide';

  @override
  String get spinUseAtCheckout => 'Use at checkout';

  @override
  String get spinContinueShopping => 'Continue shopping';

  @override
  String get spinNotConfigured => 'Spin wheel is not configured yet.';

  @override
  String get spinDiscount => 'Spin discount';

  @override
  String get spinFreeDelivery => 'Free delivery';

  @override
  String get spinGift => 'Gift';

  @override
  String get spinChipPercent => '% Off';

  @override
  String get spinChipDelivery => 'Free Delivery';

  @override
  String get spinChipGifts => 'Gifts';

  @override
  String get spinChipCash => 'Cash Off';

  @override
  String get spinResult => 'Result';

  @override
  String get spinClose => 'Close';

  @override
  String get limitedTime => 'Limited time';

  @override
  String get trustRatings => 'Ratings';

  @override
  String get trustRatingsValue => '4.9';

  @override
  String get trustDelivery => 'Fast Delivery';

  @override
  String get trustDeliveryValue => '20 Min';

  @override
  String get trustStores => 'Stores nationwide';

  @override
  String get trustCustomers => 'Happy Customers';

  @override
  String get trustCustomersValue => '100K+';

  @override
  String storeCountPlus(int count) {
    return '$count+';
  }

  @override
  String get myRewards => 'My Rewards';

  @override
  String get availablePoints => 'Available Points';

  @override
  String get redeemNow => 'Redeem Now';

  @override
  String tierProgressTo(String amount, String tier) {
    return '$amount to $tier';
  }

  @override
  String get findAStore => 'Find a Store Near You';

  @override
  String kmAway(String km) {
    return '$km km away';
  }

  @override
  String get getDirections => 'Get Directions';

  @override
  String get lovedByEveryone => 'Loved by Everyone';

  @override
  String get reviewChamath =>
      'Best bubble tea in Sri Lanka! The brown sugar boba is absolutely amazing.';

  @override
  String get reviewChamathAuthor => 'Chamath N.';

  @override
  String get reviewDilani =>
      'Super fast delivery and the drinks always arrive fresh. My go-to treat!';

  @override
  String get reviewDilaniAuthor => 'Dilani P.';

  @override
  String get reviewKasun =>
      'Love the strawberry mango tea — perfect balance of sweet and tangy.';

  @override
  String get reviewKasunAuthor => 'Kasun R.';

  @override
  String get menuHeroLead => 'Discover Your';

  @override
  String get menuHeroPerfect => 'Perfect';

  @override
  String get menuHeroAccent => 'Bubble Tea';

  @override
  String get menuHeroSubtitle =>
      'Handcrafted drinks, islandwide stores — made for your cup.';

  @override
  String showingItems(int count) {
    return 'Showing $count items';
  }

  @override
  String get sortAndFilter => 'Sort & tags';

  @override
  String get sortLabel => 'Sort';

  @override
  String get tagLabel => 'Tags';

  @override
  String get sortNameAsc => 'A-Z';

  @override
  String get sortNameDesc => 'Z-A';

  @override
  String get sortPriceLow => 'Price low to high';

  @override
  String get sortPriceHigh => 'Price high to low';

  @override
  String get sortTopRated => 'Top Rated';

  @override
  String get sortNewest => 'Newest';

  @override
  String get gridView => 'Grid view';

  @override
  String get listView => 'List view';

  @override
  String get tagAll => 'All';

  @override
  String get tagNew => 'New';

  @override
  String get tagBestSeller => 'Best Seller';

  @override
  String get tagPopular => 'Popular';

  @override
  String get tagClassic => 'Classic';

  @override
  String get tagSignature => 'Signature';

  @override
  String get tagRs200 => 'Rs.200 Only';

  @override
  String fromPrice(String amount) {
    return 'From $amount';
  }

  @override
  String get basePrice => 'Base price';

  @override
  String get toppingsLabel => 'Toppings';

  @override
  String branchAvailable(int count) {
    return '$count available at your branch';
  }

  @override
  String addForPrice(String amount) {
    return 'Add · $amount';
  }

  @override
  String get decreaseQty => 'Decrease quantity';

  @override
  String get increaseQty => 'Increase quantity';

  @override
  String get checkoutStepFulfillment => 'Fulfillment';

  @override
  String get checkoutStepContact => 'Contact';

  @override
  String get checkoutStepPayment => 'Payment';

  @override
  String get checkoutStepSummary => 'Summary';

  @override
  String get deliveringFrom => 'Delivering from';

  @override
  String get pickingUpFrom => 'Picking up from';

  @override
  String etaMinutes(int minutes) {
    return '$minutes min';
  }

  @override
  String get orderSummary => 'Order Summary';

  @override
  String get discountLabel => 'Discount';

  @override
  String get convenienceFeeOfItems => 'Convenience fee (7.5% of items)';

  @override
  String get promoApplied => 'Promo applied';

  @override
  String get applyPromo => 'Apply promo';

  @override
  String get verifyPhoneToPlace => 'Verify phone to place order';

  @override
  String get payAndPlaceOrder => 'Pay & Place Order';

  @override
  String get placingOrder => 'Placing Order...';

  @override
  String get securedCheckout => 'Secured checkout';

  @override
  String get guestCheckoutHelper =>
      'Verify your mobile number in step 2 to enable checkout.';

  @override
  String get checkoutFullName => 'Full Name *';

  @override
  String get checkoutMobile => 'Mobile Number * (07XXXXXXXX)';

  @override
  String get checkoutEmailOptional => 'Email (optional)';

  @override
  String get checkoutCheckingAccount => 'Checking your account…';

  @override
  String get checkoutNewNumberHint =>
      'New number — verify with OTP before placing your order.';

  @override
  String get checkoutExistingHint =>
      'Enter your 10-digit mobile number. Existing accounts sign in automatically.';

  @override
  String get checkoutSendOtp => 'Send OTP';

  @override
  String get checkoutOtpHint => '6-digit OTP';

  @override
  String get checkoutVerifyOtp => 'Verify OTP';

  @override
  String get checkoutSignedInHint =>
      'Signed in — your orders appear in order history.';
}
