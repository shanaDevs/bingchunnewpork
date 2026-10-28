import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en')];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'Bing Chun'**
  String get appName;

  /// No description provided for @tabHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get tabHome;

  /// No description provided for @tabMenu.
  ///
  /// In en, this message translates to:
  /// **'Menu'**
  String get tabMenu;

  /// No description provided for @tabOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get tabOrders;

  /// No description provided for @tabAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get tabAccount;

  /// No description provided for @cupLabel.
  ///
  /// In en, this message translates to:
  /// **'Cup'**
  String get cupLabel;

  /// No description provided for @splashTagline.
  ///
  /// In en, this message translates to:
  /// **'Your cup, your way'**
  String get splashTagline;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get loginTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'We\'ll send a 6-digit code to your mobile.'**
  String get loginSubtitle;

  /// No description provided for @phoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get phoneLabel;

  /// No description provided for @phoneHint.
  ///
  /// In en, this message translates to:
  /// **'07XXXXXXXX'**
  String get phoneHint;

  /// No description provided for @phoneInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid Sri Lankan mobile number.'**
  String get phoneInvalid;

  /// No description provided for @sendOtp.
  ///
  /// In en, this message translates to:
  /// **'Send code'**
  String get sendOtp;

  /// No description provided for @otpTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter code'**
  String get otpTitle;

  /// No description provided for @otpSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in with the OTP sent to your phone.'**
  String get otpSubtitle;

  /// No description provided for @otpInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code.'**
  String get otpInvalid;

  /// No description provided for @verifyOtp.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get verifyOtp;

  /// No description provided for @resendOtp.
  ///
  /// In en, this message translates to:
  /// **'Resend code'**
  String get resendOtp;

  /// No description provided for @registerTitle.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get registerTitle;

  /// No description provided for @registerSubtitle.
  ///
  /// In en, this message translates to:
  /// **'New to Bing Chun? Verify your phone to get started.'**
  String get registerSubtitle;

  /// No description provided for @nameLabel.
  ///
  /// In en, this message translates to:
  /// **'Your name'**
  String get nameLabel;

  /// No description provided for @nameHint.
  ///
  /// In en, this message translates to:
  /// **'At least 2 characters'**
  String get nameHint;

  /// No description provided for @nameTooShort.
  ///
  /// In en, this message translates to:
  /// **'Name must be at least 2 characters.'**
  String get nameTooShort;

  /// No description provided for @continueAction.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueAction;

  /// No description provided for @alreadyHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'Already have an account? Sign in'**
  String get alreadyHaveAccount;

  /// No description provided for @newHere.
  ///
  /// In en, this message translates to:
  /// **'New here? Create an account'**
  String get newHere;

  /// No description provided for @existingPhone.
  ///
  /// In en, this message translates to:
  /// **'This number is already registered. Sign in instead.'**
  String get existingPhone;

  /// No description provided for @unknownPhone.
  ///
  /// In en, this message translates to:
  /// **'No account for this number. Create one to continue.'**
  String get unknownPhone;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get logout;

  /// No description provided for @logoutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Sign out of Bing Chun?'**
  String get logoutConfirm;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @goHome.
  ///
  /// In en, this message translates to:
  /// **'Go home'**
  String get goHome;

  /// No description provided for @notFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Page not found'**
  String get notFoundTitle;

  /// No description provided for @notFoundBody.
  ///
  /// In en, this message translates to:
  /// **'That link isn\'t available in the app.'**
  String get notFoundBody;

  /// No description provided for @comingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get comingSoon;

  /// No description provided for @homePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Choose Delivery or Takeaway and browse the menu in the next update.'**
  String get homePlaceholder;

  /// No description provided for @menuPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Your branch menu will appear here.'**
  String get menuPlaceholder;

  /// No description provided for @ordersPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Your orders will appear here.'**
  String get ordersPlaceholder;

  /// No description provided for @accountSignedIn.
  ///
  /// In en, this message translates to:
  /// **'Signed in'**
  String get accountSignedIn;

  /// No description provided for @accountGuestTitle.
  ///
  /// In en, this message translates to:
  /// **'You\'re browsing as a guest'**
  String get accountGuestTitle;

  /// No description provided for @accountGuestBody.
  ///
  /// In en, this message translates to:
  /// **'Sign in to see orders, addresses, and rewards.'**
  String get accountGuestBody;

  /// No description provided for @continueBrowsing.
  ///
  /// In en, this message translates to:
  /// **'Continue browsing'**
  String get continueBrowsing;

  /// No description provided for @offlineBlock.
  ///
  /// In en, this message translates to:
  /// **'Connect to the internet to continue.'**
  String get offlineBlock;

  /// No description provided for @genericError.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Please try again.'**
  String get genericError;

  /// No description provided for @otpRateLimited.
  ///
  /// In en, this message translates to:
  /// **'Too many OTP requests. Please try again after 15 minutes.'**
  String get otpRateLimited;

  /// No description provided for @cupEmpty.
  ///
  /// In en, this message translates to:
  /// **'Your cup is empty'**
  String get cupEmpty;

  /// No description provided for @browseMenu.
  ///
  /// In en, this message translates to:
  /// **'Browse menu'**
  String get browseMenu;

  /// No description provided for @heroBadge.
  ///
  /// In en, this message translates to:
  /// **'Since 2012'**
  String get heroBadge;

  /// No description provided for @heroTitleLead.
  ///
  /// In en, this message translates to:
  /// **'Freshly Brewed'**
  String get heroTitleLead;

  /// No description provided for @heroTitleAccent.
  ///
  /// In en, this message translates to:
  /// **'Bubble Tea & Ice Cream'**
  String get heroTitleAccent;

  /// No description provided for @heroSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Premium ingredients, crafted with love'**
  String get heroSubtitle;

  /// No description provided for @orderNow.
  ///
  /// In en, this message translates to:
  /// **'Order Now'**
  String get orderNow;

  /// No description provided for @viewMenu.
  ///
  /// In en, this message translates to:
  /// **'View Menu'**
  String get viewMenu;

  /// No description provided for @mostPopular.
  ///
  /// In en, this message translates to:
  /// **'Most Popular'**
  String get mostPopular;

  /// No description provided for @viewAll.
  ///
  /// In en, this message translates to:
  /// **'View All'**
  String get viewAll;

  /// No description provided for @todaysOffers.
  ///
  /// In en, this message translates to:
  /// **'Today\'s Offers'**
  String get todaysOffers;

  /// No description provided for @searchMenu.
  ///
  /// In en, this message translates to:
  /// **'Search drinks'**
  String get searchMenu;

  /// No description provided for @allItems.
  ///
  /// In en, this message translates to:
  /// **'All Items'**
  String get allItems;

  /// No description provided for @outOfStock.
  ///
  /// In en, this message translates to:
  /// **'Out of stock'**
  String get outOfStock;

  /// No description provided for @lowStock.
  ///
  /// In en, this message translates to:
  /// **'Low stock'**
  String get lowStock;

  /// No description provided for @noProducts.
  ///
  /// In en, this message translates to:
  /// **'No drinks just now.'**
  String get noProducts;

  /// No description provided for @noDrinksBody.
  ///
  /// In en, this message translates to:
  /// **'The menu is empty right now.'**
  String get noDrinksBody;

  /// No description provided for @heroBadgeStores.
  ///
  /// In en, this message translates to:
  /// **'Since 2012 · {count} stores'**
  String heroBadgeStores(int count);

  /// No description provided for @heroTask.
  ///
  /// In en, this message translates to:
  /// **'Freshly brewed bubble tea & ice cream'**
  String get heroTask;

  /// No description provided for @chooseFulfillment.
  ///
  /// In en, this message translates to:
  /// **'Choose how you get your cup'**
  String get chooseFulfillment;

  /// No description provided for @modeDelivery.
  ///
  /// In en, this message translates to:
  /// **'Delivery'**
  String get modeDelivery;

  /// No description provided for @modeTakeaway.
  ///
  /// In en, this message translates to:
  /// **'Takeaway'**
  String get modeTakeaway;

  /// No description provided for @notNow.
  ///
  /// In en, this message translates to:
  /// **'Not now'**
  String get notNow;

  /// No description provided for @howYouGetCup.
  ///
  /// In en, this message translates to:
  /// **'How will you get your cup?'**
  String get howYouGetCup;

  /// No description provided for @orderModeStepBadge.
  ///
  /// In en, this message translates to:
  /// **'STEP 1 OF 2'**
  String get orderModeStepBadge;

  /// No description provided for @orderModeTitle.
  ///
  /// In en, this message translates to:
  /// **'How would you like to order?'**
  String get orderModeTitle;

  /// No description provided for @orderModeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose delivery or pickup — like Pizza Hut, quick and easy.'**
  String get orderModeSubtitle;

  /// No description provided for @orderModeDeliverySub.
  ///
  /// In en, this message translates to:
  /// **'Hot & fresh to your door'**
  String get orderModeDeliverySub;

  /// No description provided for @orderModeTakeawaySub.
  ///
  /// In en, this message translates to:
  /// **'Pick up from a store'**
  String get orderModeTakeawaySub;

  /// No description provided for @selectDelivery.
  ///
  /// In en, this message translates to:
  /// **'Select Delivery'**
  String get selectDelivery;

  /// No description provided for @selectPickup.
  ///
  /// In en, this message translates to:
  /// **'Select Pickup'**
  String get selectPickup;

  /// No description provided for @skipForNow.
  ///
  /// In en, this message translates to:
  /// **'Skip for now — you can set this later'**
  String get skipForNow;

  /// No description provided for @closeSheet.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get closeSheet;

  /// No description provided for @searchMenuTooltip.
  ///
  /// In en, this message translates to:
  /// **'Search menu'**
  String get searchMenuTooltip;

  /// No description provided for @todaysSpecial.
  ///
  /// In en, this message translates to:
  /// **'Today\'s special'**
  String get todaysSpecial;

  /// No description provided for @specialCheckoutNote.
  ///
  /// In en, this message translates to:
  /// **'Checkout charges the regular price.'**
  String get specialCheckoutNote;

  /// No description provided for @storesTitle.
  ///
  /// In en, this message translates to:
  /// **'Stores'**
  String get storesTitle;

  /// No description provided for @storesCount.
  ///
  /// In en, this message translates to:
  /// **'{count} locations'**
  String storesCount(int count);

  /// No description provided for @offlineSavedMenu.
  ///
  /// In en, this message translates to:
  /// **'You\'re offline. Showing saved menu.'**
  String get offlineSavedMenu;

  /// No description provided for @saveWishlist.
  ///
  /// In en, this message translates to:
  /// **'Save to wishlist'**
  String get saveWishlist;

  /// No description provided for @removeWishlist.
  ///
  /// In en, this message translates to:
  /// **'Remove from wishlist'**
  String get removeWishlist;

  /// No description provided for @signInToWishlist.
  ///
  /// In en, this message translates to:
  /// **'Sign in to save favourites.'**
  String get signInToWishlist;

  /// No description provided for @addToCup.
  ///
  /// In en, this message translates to:
  /// **'Add to cup'**
  String get addToCup;

  /// No description provided for @promotionsTitle.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get promotionsTitle;

  /// No description provided for @viewAllOffers.
  ///
  /// In en, this message translates to:
  /// **'View all'**
  String get viewAllOffers;

  /// No description provided for @pickTakeawayStore.
  ///
  /// In en, this message translates to:
  /// **'Choose a store'**
  String get pickTakeawayStore;

  /// No description provided for @orderModeStep2Badge.
  ///
  /// In en, this message translates to:
  /// **'STEP 2 OF 2'**
  String get orderModeStep2Badge;

  /// No description provided for @takeawayTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose your pickup store'**
  String get takeawayTitle;

  /// No description provided for @takeawaySubtitle.
  ///
  /// In en, this message translates to:
  /// **'We\'ll select the closest branch. You can switch to another anytime.'**
  String get takeawaySubtitle;

  /// No description provided for @findingNearestStore.
  ///
  /// In en, this message translates to:
  /// **'Finding the nearest outlet...'**
  String get findingNearestStore;

  /// No description provided for @locationDeniedHint.
  ///
  /// In en, this message translates to:
  /// **'Allow location to pick the closest store, or choose a branch below.'**
  String get locationDeniedHint;

  /// No description provided for @locationUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t get your location. Choose a store below.'**
  String get locationUnavailable;

  /// No description provided for @useMyLocation.
  ///
  /// In en, this message translates to:
  /// **'Use my location'**
  String get useMyLocation;

  /// No description provided for @nearestChip.
  ///
  /// In en, this message translates to:
  /// **'Nearest'**
  String get nearestChip;

  /// No description provided for @nearestToYou.
  ///
  /// In en, this message translates to:
  /// **'Nearest to you'**
  String get nearestToYou;

  /// No description provided for @otherBranches.
  ///
  /// In en, this message translates to:
  /// **'Or choose another store'**
  String get otherBranches;

  /// No description provided for @allBranches.
  ///
  /// In en, this message translates to:
  /// **'All branches'**
  String get allBranches;

  /// No description provided for @takeawaySearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search a store or area'**
  String get takeawaySearchHint;

  /// No description provided for @confirmPickup.
  ///
  /// In en, this message translates to:
  /// **'Confirm pickup'**
  String get confirmPickup;

  /// No description provided for @confirmPickupFrom.
  ///
  /// In en, this message translates to:
  /// **'Confirm pickup from {name}'**
  String confirmPickupFrom(String name);

  /// No description provided for @noStores.
  ///
  /// In en, this message translates to:
  /// **'No branches available.'**
  String get noStores;

  /// No description provided for @deliveryPinTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivery pin'**
  String get deliveryPinTitle;

  /// No description provided for @deliveryPinBody.
  ///
  /// In en, this message translates to:
  /// **'Confirm a pin on the map to set delivery. We never assume a city for you.'**
  String get deliveryPinBody;

  /// No description provided for @busyBadge.
  ///
  /// In en, this message translates to:
  /// **'Busy'**
  String get busyBadge;

  /// No description provided for @addToCupTitle.
  ///
  /// In en, this message translates to:
  /// **'Add to cup'**
  String get addToCupTitle;

  /// No description provided for @qtyLabel.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get qtyLabel;

  /// No description provided for @menuLoaded.
  ///
  /// In en, this message translates to:
  /// **'Menu loaded, {count} drinks'**
  String menuLoaded(int count);

  /// No description provided for @cupItems.
  ///
  /// In en, this message translates to:
  /// **'Cup, {count} items'**
  String cupItems(int count);

  /// No description provided for @wishlistTitle.
  ///
  /// In en, this message translates to:
  /// **'Wishlist'**
  String get wishlistTitle;

  /// No description provided for @allCategories.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get allCategories;

  /// No description provided for @offerPrev.
  ///
  /// In en, this message translates to:
  /// **'Previous offer'**
  String get offerPrev;

  /// No description provided for @offerNext.
  ///
  /// In en, this message translates to:
  /// **'Next offer'**
  String get offerNext;

  /// No description provided for @deliverySearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search an address in Sri Lanka'**
  String get deliverySearchHint;

  /// No description provided for @deliveryNotFound.
  ///
  /// In en, this message translates to:
  /// **'Could not find this address.'**
  String get deliveryNotFound;

  /// No description provided for @confirmDelivery.
  ///
  /// In en, this message translates to:
  /// **'Confirm delivery'**
  String get confirmDelivery;

  /// No description provided for @deliveryFee.
  ///
  /// In en, this message translates to:
  /// **'Delivery fee {amount}'**
  String deliveryFee(String amount);

  /// No description provided for @deliveryMinOrder.
  ///
  /// In en, this message translates to:
  /// **'Minimum order {amount}'**
  String deliveryMinOrder(String amount);

  /// No description provided for @changeFulfillment.
  ///
  /// In en, this message translates to:
  /// **'Change'**
  String get changeFulfillment;

  /// No description provided for @subtotal.
  ///
  /// In en, this message translates to:
  /// **'Subtotal'**
  String get subtotal;

  /// No description provided for @deliveryFeeLabel.
  ///
  /// In en, this message translates to:
  /// **'Delivery fee'**
  String get deliveryFeeLabel;

  /// No description provided for @total.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get total;

  /// No description provided for @proceedCheckout.
  ///
  /// In en, this message translates to:
  /// **'Proceed to Checkout'**
  String get proceedCheckout;

  /// No description provided for @checkoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Checkout'**
  String get checkoutTitle;

  /// No description provided for @contactDetails.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get contactDetails;

  /// No description provided for @paymentMethod.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get paymentMethod;

  /// No description provided for @placeOrder.
  ///
  /// In en, this message translates to:
  /// **'Place order'**
  String get placeOrder;

  /// No description provided for @signInToPlace.
  ///
  /// In en, this message translates to:
  /// **'Verify your mobile number to place this order.'**
  String get signInToPlace;

  /// No description provided for @noPaymentMethods.
  ///
  /// In en, this message translates to:
  /// **'No payment methods available for this order.'**
  String get noPaymentMethods;

  /// No description provided for @convenienceFee.
  ///
  /// In en, this message translates to:
  /// **'Convenience fee'**
  String get convenienceFee;

  /// No description provided for @pickupTime.
  ///
  /// In en, this message translates to:
  /// **'Pickup time'**
  String get pickupTime;

  /// No description provided for @pickupInMinutes.
  ///
  /// In en, this message translates to:
  /// **'In {minutes} min'**
  String pickupInMinutes(int minutes);

  /// No description provided for @payOnlineTitle.
  ///
  /// In en, this message translates to:
  /// **'Pay online'**
  String get payOnlineTitle;

  /// No description provided for @continueToPayment.
  ///
  /// In en, this message translates to:
  /// **'Continue to payment'**
  String get continueToPayment;

  /// No description provided for @openingPayment.
  ///
  /// In en, this message translates to:
  /// **'Opening secure payment…'**
  String get openingPayment;

  /// No description provided for @cancelPayment.
  ///
  /// In en, this message translates to:
  /// **'Cancel payment'**
  String get cancelPayment;

  /// No description provided for @paymentOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open the payment page.'**
  String get paymentOpenFailed;

  /// No description provided for @paymentStayInCup.
  ///
  /// In en, this message translates to:
  /// **'Close without paying keeps your items in the cup. This will not place the order again.'**
  String get paymentStayInCup;

  /// No description provided for @orderPlacedTitle.
  ///
  /// In en, this message translates to:
  /// **'Order placed'**
  String get orderPlacedTitle;

  /// No description provided for @orderPlacedBody.
  ///
  /// In en, this message translates to:
  /// **'Your order number'**
  String get orderPlacedBody;

  /// No description provided for @spinTitle.
  ///
  /// In en, this message translates to:
  /// **'Spin & Win'**
  String get spinTitle;

  /// No description provided for @spinSriLanka.
  ///
  /// In en, this message translates to:
  /// **'Sri Lanka'**
  String get spinSriLanka;

  /// No description provided for @spinTryYourLuck.
  ///
  /// In en, this message translates to:
  /// **'Try your luck!'**
  String get spinTryYourLuck;

  /// No description provided for @spinSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Spin for free delivery, gifts & discounts.'**
  String get spinSubtitle;

  /// No description provided for @spinSubtitlePractice.
  ///
  /// In en, this message translates to:
  /// **'One more spin — your reward is waiting!'**
  String get spinSubtitlePractice;

  /// No description provided for @spinSubtitleCooldown.
  ///
  /// In en, this message translates to:
  /// **'Your daily spin is on cooldown.'**
  String get spinSubtitleCooldown;

  /// No description provided for @spinNow.
  ///
  /// In en, this message translates to:
  /// **'Spin Now'**
  String get spinNow;

  /// No description provided for @spinning.
  ///
  /// In en, this message translates to:
  /// **'Spinning…'**
  String get spinning;

  /// No description provided for @spinAgain.
  ///
  /// In en, this message translates to:
  /// **'Spin Again'**
  String get spinAgain;

  /// No description provided for @spinYouWon.
  ///
  /// In en, this message translates to:
  /// **'You won'**
  String get spinYouWon;

  /// No description provided for @spinTryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try Again!'**
  String get spinTryAgain;

  /// No description provided for @spinTryAgainBody.
  ///
  /// In en, this message translates to:
  /// **'Spin once more for your real prize.'**
  String get spinTryAgainBody;

  /// No description provided for @spinBetterLuck.
  ///
  /// In en, this message translates to:
  /// **'Better luck next time'**
  String get spinBetterLuck;

  /// No description provided for @spinUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Spin unavailable'**
  String get spinUnavailable;

  /// No description provided for @spinCooldown.
  ///
  /// In en, this message translates to:
  /// **'You can spin again after {when}'**
  String spinCooldown(String when);

  /// No description provided for @spinFooter.
  ///
  /// In en, this message translates to:
  /// **'One spin per day. Rewards expire in 7 days.'**
  String get spinFooter;

  /// No description provided for @spinHide.
  ///
  /// In en, this message translates to:
  /// **'Hide'**
  String get spinHide;

  /// No description provided for @spinUseAtCheckout.
  ///
  /// In en, this message translates to:
  /// **'Use at checkout'**
  String get spinUseAtCheckout;

  /// No description provided for @spinContinueShopping.
  ///
  /// In en, this message translates to:
  /// **'Continue shopping'**
  String get spinContinueShopping;

  /// No description provided for @spinNotConfigured.
  ///
  /// In en, this message translates to:
  /// **'Spin wheel is not configured yet.'**
  String get spinNotConfigured;

  /// No description provided for @spinDiscount.
  ///
  /// In en, this message translates to:
  /// **'Spin discount'**
  String get spinDiscount;

  /// No description provided for @spinFreeDelivery.
  ///
  /// In en, this message translates to:
  /// **'Free delivery'**
  String get spinFreeDelivery;

  /// No description provided for @spinGift.
  ///
  /// In en, this message translates to:
  /// **'Gift'**
  String get spinGift;

  /// No description provided for @spinChipPercent.
  ///
  /// In en, this message translates to:
  /// **'% Off'**
  String get spinChipPercent;

  /// No description provided for @spinChipDelivery.
  ///
  /// In en, this message translates to:
  /// **'Free Delivery'**
  String get spinChipDelivery;

  /// No description provided for @spinChipGifts.
  ///
  /// In en, this message translates to:
  /// **'Gifts'**
  String get spinChipGifts;

  /// No description provided for @spinChipCash.
  ///
  /// In en, this message translates to:
  /// **'Cash Off'**
  String get spinChipCash;

  /// No description provided for @spinResult.
  ///
  /// In en, this message translates to:
  /// **'Result'**
  String get spinResult;

  /// No description provided for @spinClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get spinClose;

  /// No description provided for @limitedTime.
  ///
  /// In en, this message translates to:
  /// **'Limited time'**
  String get limitedTime;

  /// No description provided for @trustRatings.
  ///
  /// In en, this message translates to:
  /// **'Ratings'**
  String get trustRatings;

  /// No description provided for @trustRatingsValue.
  ///
  /// In en, this message translates to:
  /// **'4.9'**
  String get trustRatingsValue;

  /// No description provided for @trustDelivery.
  ///
  /// In en, this message translates to:
  /// **'Fast Delivery'**
  String get trustDelivery;

  /// No description provided for @trustDeliveryValue.
  ///
  /// In en, this message translates to:
  /// **'20 Min'**
  String get trustDeliveryValue;

  /// No description provided for @trustStores.
  ///
  /// In en, this message translates to:
  /// **'Stores nationwide'**
  String get trustStores;

  /// No description provided for @trustCustomers.
  ///
  /// In en, this message translates to:
  /// **'Happy Customers'**
  String get trustCustomers;

  /// No description provided for @trustCustomersValue.
  ///
  /// In en, this message translates to:
  /// **'100K+'**
  String get trustCustomersValue;

  /// No description provided for @storeCountPlus.
  ///
  /// In en, this message translates to:
  /// **'{count}+'**
  String storeCountPlus(int count);

  /// No description provided for @myRewards.
  ///
  /// In en, this message translates to:
  /// **'My Rewards'**
  String get myRewards;

  /// No description provided for @availablePoints.
  ///
  /// In en, this message translates to:
  /// **'Available Points'**
  String get availablePoints;

  /// No description provided for @redeemNow.
  ///
  /// In en, this message translates to:
  /// **'Redeem Now'**
  String get redeemNow;

  /// No description provided for @tierProgressTo.
  ///
  /// In en, this message translates to:
  /// **'{amount} to {tier}'**
  String tierProgressTo(String amount, String tier);

  /// No description provided for @findAStore.
  ///
  /// In en, this message translates to:
  /// **'Find a Store Near You'**
  String get findAStore;

  /// No description provided for @kmAway.
  ///
  /// In en, this message translates to:
  /// **'{km} km away'**
  String kmAway(String km);

  /// No description provided for @getDirections.
  ///
  /// In en, this message translates to:
  /// **'Get Directions'**
  String get getDirections;

  /// No description provided for @lovedByEveryone.
  ///
  /// In en, this message translates to:
  /// **'Loved by Everyone'**
  String get lovedByEveryone;

  /// No description provided for @reviewChamath.
  ///
  /// In en, this message translates to:
  /// **'Best bubble tea in Sri Lanka! The brown sugar boba is absolutely amazing.'**
  String get reviewChamath;

  /// No description provided for @reviewChamathAuthor.
  ///
  /// In en, this message translates to:
  /// **'Chamath N.'**
  String get reviewChamathAuthor;

  /// No description provided for @reviewDilani.
  ///
  /// In en, this message translates to:
  /// **'Super fast delivery and the drinks always arrive fresh. My go-to treat!'**
  String get reviewDilani;

  /// No description provided for @reviewDilaniAuthor.
  ///
  /// In en, this message translates to:
  /// **'Dilani P.'**
  String get reviewDilaniAuthor;

  /// No description provided for @reviewKasun.
  ///
  /// In en, this message translates to:
  /// **'Love the strawberry mango tea — perfect balance of sweet and tangy.'**
  String get reviewKasun;

  /// No description provided for @reviewKasunAuthor.
  ///
  /// In en, this message translates to:
  /// **'Kasun R.'**
  String get reviewKasunAuthor;

  /// No description provided for @menuHeroLead.
  ///
  /// In en, this message translates to:
  /// **'Discover Your'**
  String get menuHeroLead;

  /// No description provided for @menuHeroPerfect.
  ///
  /// In en, this message translates to:
  /// **'Perfect'**
  String get menuHeroPerfect;

  /// No description provided for @menuHeroAccent.
  ///
  /// In en, this message translates to:
  /// **'Bubble Tea'**
  String get menuHeroAccent;

  /// No description provided for @menuHeroSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Handcrafted drinks, islandwide stores — made for your cup.'**
  String get menuHeroSubtitle;

  /// No description provided for @showingItems.
  ///
  /// In en, this message translates to:
  /// **'Showing {count} items'**
  String showingItems(int count);

  /// No description provided for @sortAndFilter.
  ///
  /// In en, this message translates to:
  /// **'Sort & tags'**
  String get sortAndFilter;

  /// No description provided for @sortLabel.
  ///
  /// In en, this message translates to:
  /// **'Sort'**
  String get sortLabel;

  /// No description provided for @tagLabel.
  ///
  /// In en, this message translates to:
  /// **'Tags'**
  String get tagLabel;

  /// No description provided for @sortNameAsc.
  ///
  /// In en, this message translates to:
  /// **'A-Z'**
  String get sortNameAsc;

  /// No description provided for @sortNameDesc.
  ///
  /// In en, this message translates to:
  /// **'Z-A'**
  String get sortNameDesc;

  /// No description provided for @sortPriceLow.
  ///
  /// In en, this message translates to:
  /// **'Price low to high'**
  String get sortPriceLow;

  /// No description provided for @sortPriceHigh.
  ///
  /// In en, this message translates to:
  /// **'Price high to low'**
  String get sortPriceHigh;

  /// No description provided for @sortTopRated.
  ///
  /// In en, this message translates to:
  /// **'Top Rated'**
  String get sortTopRated;

  /// No description provided for @sortNewest.
  ///
  /// In en, this message translates to:
  /// **'Newest'**
  String get sortNewest;

  /// No description provided for @gridView.
  ///
  /// In en, this message translates to:
  /// **'Grid view'**
  String get gridView;

  /// No description provided for @listView.
  ///
  /// In en, this message translates to:
  /// **'List view'**
  String get listView;

  /// No description provided for @tagAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get tagAll;

  /// No description provided for @tagNew.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get tagNew;

  /// No description provided for @tagBestSeller.
  ///
  /// In en, this message translates to:
  /// **'Best Seller'**
  String get tagBestSeller;

  /// No description provided for @tagPopular.
  ///
  /// In en, this message translates to:
  /// **'Popular'**
  String get tagPopular;

  /// No description provided for @tagClassic.
  ///
  /// In en, this message translates to:
  /// **'Classic'**
  String get tagClassic;

  /// No description provided for @tagSignature.
  ///
  /// In en, this message translates to:
  /// **'Signature'**
  String get tagSignature;

  /// No description provided for @tagRs200.
  ///
  /// In en, this message translates to:
  /// **'Rs.200 Only'**
  String get tagRs200;

  /// No description provided for @fromPrice.
  ///
  /// In en, this message translates to:
  /// **'From {amount}'**
  String fromPrice(String amount);

  /// No description provided for @basePrice.
  ///
  /// In en, this message translates to:
  /// **'Base price'**
  String get basePrice;

  /// No description provided for @toppingsLabel.
  ///
  /// In en, this message translates to:
  /// **'Toppings'**
  String get toppingsLabel;

  /// No description provided for @branchAvailable.
  ///
  /// In en, this message translates to:
  /// **'{count} available at your branch'**
  String branchAvailable(int count);

  /// No description provided for @addForPrice.
  ///
  /// In en, this message translates to:
  /// **'Add · {amount}'**
  String addForPrice(String amount);

  /// No description provided for @decreaseQty.
  ///
  /// In en, this message translates to:
  /// **'Decrease quantity'**
  String get decreaseQty;

  /// No description provided for @increaseQty.
  ///
  /// In en, this message translates to:
  /// **'Increase quantity'**
  String get increaseQty;

  /// No description provided for @checkoutStepFulfillment.
  ///
  /// In en, this message translates to:
  /// **'Fulfillment'**
  String get checkoutStepFulfillment;

  /// No description provided for @checkoutStepContact.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get checkoutStepContact;

  /// No description provided for @checkoutStepPayment.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get checkoutStepPayment;

  /// No description provided for @checkoutStepSummary.
  ///
  /// In en, this message translates to:
  /// **'Summary'**
  String get checkoutStepSummary;

  /// No description provided for @deliveringFrom.
  ///
  /// In en, this message translates to:
  /// **'Delivering from'**
  String get deliveringFrom;

  /// No description provided for @pickingUpFrom.
  ///
  /// In en, this message translates to:
  /// **'Picking up from'**
  String get pickingUpFrom;

  /// No description provided for @etaMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min'**
  String etaMinutes(int minutes);

  /// No description provided for @orderSummary.
  ///
  /// In en, this message translates to:
  /// **'Order Summary'**
  String get orderSummary;

  /// No description provided for @discountLabel.
  ///
  /// In en, this message translates to:
  /// **'Discount'**
  String get discountLabel;

  /// No description provided for @convenienceFeeOfItems.
  ///
  /// In en, this message translates to:
  /// **'Convenience fee (7.5% of items)'**
  String get convenienceFeeOfItems;

  /// No description provided for @promoApplied.
  ///
  /// In en, this message translates to:
  /// **'Promo applied'**
  String get promoApplied;

  /// No description provided for @applyPromo.
  ///
  /// In en, this message translates to:
  /// **'Apply promo'**
  String get applyPromo;

  /// No description provided for @verifyPhoneToPlace.
  ///
  /// In en, this message translates to:
  /// **'Verify phone to place order'**
  String get verifyPhoneToPlace;

  /// No description provided for @payAndPlaceOrder.
  ///
  /// In en, this message translates to:
  /// **'Pay & Place Order'**
  String get payAndPlaceOrder;

  /// No description provided for @placingOrder.
  ///
  /// In en, this message translates to:
  /// **'Placing Order...'**
  String get placingOrder;

  /// No description provided for @securedCheckout.
  ///
  /// In en, this message translates to:
  /// **'Secured checkout'**
  String get securedCheckout;

  /// No description provided for @guestCheckoutHelper.
  ///
  /// In en, this message translates to:
  /// **'Verify your mobile number in step 2 to enable checkout.'**
  String get guestCheckoutHelper;

  /// No description provided for @checkoutFullName.
  ///
  /// In en, this message translates to:
  /// **'Full Name *'**
  String get checkoutFullName;

  /// No description provided for @checkoutMobile.
  ///
  /// In en, this message translates to:
  /// **'Mobile Number * (07XXXXXXXX)'**
  String get checkoutMobile;

  /// No description provided for @checkoutEmailOptional.
  ///
  /// In en, this message translates to:
  /// **'Email (optional)'**
  String get checkoutEmailOptional;

  /// No description provided for @checkoutCheckingAccount.
  ///
  /// In en, this message translates to:
  /// **'Checking your account…'**
  String get checkoutCheckingAccount;

  /// No description provided for @checkoutNewNumberHint.
  ///
  /// In en, this message translates to:
  /// **'New number — verify with OTP before placing your order.'**
  String get checkoutNewNumberHint;

  /// No description provided for @checkoutExistingHint.
  ///
  /// In en, this message translates to:
  /// **'Enter your 10-digit mobile number. Existing accounts sign in automatically.'**
  String get checkoutExistingHint;

  /// No description provided for @checkoutSendOtp.
  ///
  /// In en, this message translates to:
  /// **'Send OTP'**
  String get checkoutSendOtp;

  /// No description provided for @checkoutOtpHint.
  ///
  /// In en, this message translates to:
  /// **'6-digit OTP'**
  String get checkoutOtpHint;

  /// No description provided for @checkoutVerifyOtp.
  ///
  /// In en, this message translates to:
  /// **'Verify OTP'**
  String get checkoutVerifyOtp;

  /// No description provided for @checkoutSignedInHint.
  ///
  /// In en, this message translates to:
  /// **'Signed in — your orders appear in order history.'**
  String get checkoutSignedInHint;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
