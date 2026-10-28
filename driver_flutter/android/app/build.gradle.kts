import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// FCM activates only when the Firebase config is present (download it from the
// Firebase console into android/app/google-services.json). Without it the build
// still works and push registration silently no-ops — same as driver_android.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Release signing: android/key.properties (git-ignored) holds storeFile / storePassword /
// keyAlias / keyPassword for the upload key. storeFile is relative to android/app/.
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val hasReleaseKey = keystoreProperties.getProperty("storeFile") != null

// Never ship a debug-signed release: fail release builds when the key is missing.
if (!hasReleaseKey && gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }) {
    throw GradleException(
        "Release signing key not found. Create android/key.properties (see " +
            "https://docs.flutter.dev/deployment/android#reference-the-keystore-from-the-app).",
    )
}

android {
    namespace = "lk.bingchun.bing_chun_driver"
    // permission_handler_android 14 requires compiling against API 37.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // Must match the Firebase Android app in google-services.json (project bing-chun-driver).
        // The Kotlin `namespace` above stays lk.bingchun.* — only the install/package id changed.
        applicationId = "com.bingchun.bing_chun_driver"
        minSdk = 26
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Same as driver_android: no R8. Shrinking strips the JNI methods
            // shared_preferences_android calls, which crashes startup in release.
            isMinifyEnabled = false
            isShrinkResources = false
            if (hasReleaseKey) signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    // AppCompat themes are required by the biometric prompt (local_auth) on Android 8.
    implementation("androidx.appcompat:appcompat:1.7.0")
}

flutter {
    source = "../.."
}
