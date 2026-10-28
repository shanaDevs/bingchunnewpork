package lk.bingchun.delivery

import android.app.Application
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import lk.bingchun.delivery.core.AppContainer
import lk.bingchun.delivery.core.RuntimeConfig
import org.osmdroid.config.Configuration

class BingChunApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        SingletonImageLoader.setSafe {
            ImageLoader.Builder(it)
                .components { add(OkHttpNetworkFetcherFactory()) }
                .build()
        }
        RuntimeConfig.init(this)
        container = AppContainer(this)
        // Start GPS + internet monitoring early so the lock overlay is ready on first frame.
        container.deviceRequirements.start()

        // osmdroid needs a user agent + cache dir before any MapView is created.
        Configuration.getInstance().apply {
            userAgentValue = packageName
            osmdroidBasePath = cacheDir
            osmdroidTileCache = cacheDir.resolve("osmdroid-tiles")
        }
    }
}
