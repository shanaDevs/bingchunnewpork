import Flutter
import GoogleMaps
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Show ride alerts while the app is in the foreground (flutter_local_notifications).
    UNUserNotificationCenter.current().delegate = self as UNUserNotificationCenterDelegate
    if let key = Self.googleMapsApiKey() {
      GMSServices.provideAPIKey(key)
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// GOOGLE_MAPS_API_KEY from driver_flutter/.env, bundled as a Flutter asset (see pubspec.yaml).
  private static func googleMapsApiKey() -> String? {
    let assetKey = FlutterDartProject.lookupKey(forAsset: ".env")
    guard let path = Bundle.main.path(forResource: assetKey, ofType: nil),
          let text = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
    for line in text.split(whereSeparator: \.isNewline) {
      let parts = line.split(separator: "=", maxSplits: 1)
      if parts.count == 2, parts[0].trimmingCharacters(in: .whitespaces) == "GOOGLE_MAPS_API_KEY" {
        let value = parts[1].trimmingCharacters(in: .whitespaces)
        return value.isEmpty ? nil : value
      }
    }
    return nil
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
