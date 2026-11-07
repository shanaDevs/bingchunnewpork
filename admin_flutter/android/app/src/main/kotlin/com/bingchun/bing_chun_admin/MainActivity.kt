package com.bingchun.bing_chun_admin

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val channelName = "com.bingchun.bing_chun_admin/bluetooth_printer"
    private val printer = ThermalPrinter()
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var pendingPermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "hasPermission" -> result.success(hasBluetoothConnectPermission())
                "requestPermission" -> requestBluetoothPermission(result)
                "isBluetoothOn" -> {
                    val adapter = BluetoothAdapter.getDefaultAdapter()
                    result.success(adapter != null && adapter.isEnabled)
                }
                "listBonded" -> {
                    if (!hasBluetoothConnectPermission()) {
                        result.error("PERMISSION", "Bluetooth permission required", null)
                        return@setMethodCallHandler
                    }
                    val adapter = BluetoothAdapter.getDefaultAdapter()
                    result.success(ThermalPrinter.bondedDevices(adapter))
                }
                "connect" -> {
                    val mac = call.argument<String>("mac")
                    if (mac.isNullOrBlank()) {
                        result.error("ARG", "mac required", null)
                        return@setMethodCallHandler
                    }
                    if (!hasBluetoothConnectPermission()) {
                        result.error("PERMISSION", "Bluetooth permission required", null)
                        return@setMethodCallHandler
                    }
                    io.execute {
                        val ok = printer.connect(mac)
                        main.post { result.success(ok) }
                    }
                }
                "disconnect" -> {
                    io.execute {
                        printer.disconnect()
                        main.post { result.success(null) }
                    }
                }
                "printReceipt" -> {
                    val title = call.argument<String>("title") ?: ""
                    val body = call.argument<String>("body") ?: ""
                    val footer = call.argument<String>("footer") ?: ""
                    io.execute {
                        try {
                            printer.printReceipt(title, body, footer)
                            main.post { result.success(true) }
                        } catch (e: Exception) {
                            main.post { result.error("PRINT", e.message, null) }
                        }
                    }
                }
                "feedAndCut" -> {
                    io.execute {
                        try {
                            printer.feedAndCut()
                            main.post { result.success(true) }
                        } catch (e: Exception) {
                            main.post { result.error("CUT", e.message, null) }
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun requestBluetoothPermission(result: MethodChannel.Result) {
        if (hasBluetoothConnectPermission()) {
            result.success(true)
            return
        }
        pendingPermissionResult = result
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.BLUETOOTH_CONNECT),
            REQ_BT_CONNECT,
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_BT_CONNECT) return
        val ok = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        pendingPermissionResult?.success(ok)
        pendingPermissionResult = null
    }

    override fun onDestroy() {
        io.execute { printer.disconnect() }
        super.onDestroy()
    }

    companion object {
        private const val REQ_BT_CONNECT = 48201
    }
}
