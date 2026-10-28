package lk.bingchun.delivery.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Encrypted key/value storage — port of mobile/lib/core/storage/secure_storage.dart.
 * Keeps the same logical keys so behavior matches the Flutter app.
 */
class SecureStore(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "bc_delivery_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().apply { if (value == null) remove(KEY_TOKEN) else putString(KEY_TOKEN, value) }.apply()

    var driverJson: String?
        get() = prefs.getString(KEY_DRIVER, null)
        set(value) = prefs.edit().apply { if (value == null) remove(KEY_DRIVER) else putString(KEY_DRIVER, value) }.apply()

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_DRIVER).apply()
    }

    companion object {
        private const val KEY_TOKEN = "bc_delivery_token"
        private const val KEY_DRIVER = "bc_delivery_driver"
    }
}
