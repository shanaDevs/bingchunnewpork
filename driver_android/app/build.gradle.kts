plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

// FCM activates only when the Firebase config for lk.bingchun.bing_chun_delivery
// is present (download it from the Firebase console into app/google-services.json).
// Without it the build still works and push registration silently no-ops.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "lk.bingchun.delivery"
    compileSdk = 35

    defaultConfig {
        // Keep the Flutter app id so a Kotlin build can replace the Flutter install.
        applicationId = "lk.bingchun.bing_chun_delivery"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.0.1-deviceqa"

        // Mirrors the Flutter --dart-define surface (Env.dart). Overridable per build type.
        buildConfigField("String", "CORE_API_BASE_URL", "\"https://bing-chung-b.mp.dartcodes.com/api\"")
        buildConfigField("String", "DELIVERY_API_BASE_URL", "\"https://bing-chung-b.mp.dartcodes.com/delivery-api\"")
        buildConfigField("String", "STORE_ID", "\"\"")
    }

    buildTypes {
        debug {
            // USB debugging: adb reverse tcp:4000 tcp:4000 && adb reverse tcp:4100 tcp:4100
            // then 127.0.0.1 on the phone is this PC. Override via 5-tap logo for LAN IPs.
            buildConfigField("String", "CORE_API_BASE_URL", "\"http://127.0.0.1:4000/api\"")
            buildConfigField("String", "DELIVERY_API_BASE_URL", "\"http://127.0.0.1:4100/delivery-api\"")
            // Leave branch unset so PIN login can resolve drivers from any branch.
            // If a PIN is shared across branches, the app shows the branch picker.
            buildConfigField("String", "STORE_ID", "\"\"")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-process:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material3:material3-window-size-class")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.4")
    implementation("androidx.core:core-splashscreen:1.0.1")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.moshi:moshi:1.15.1")
    ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.1")

    // Secure storage
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Location
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Realtime
    implementation("io.socket:socket.io-client:2.1.0") {
        exclude(group = "org.json", module = "json")
    }

    // Push (inert until google-services.json is added)
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-messaging")

    // Maps (OpenStreetMap — no API key)
    implementation("org.osmdroid:osmdroid-android:6.1.20")

    // Profile / license images
    implementation("io.coil-kt.coil3:coil-compose:3.0.4")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.0.4")

    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.compose.ui:ui-tooling-preview")
}
