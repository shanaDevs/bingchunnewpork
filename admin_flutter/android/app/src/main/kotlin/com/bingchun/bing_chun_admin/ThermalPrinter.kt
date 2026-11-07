package com.bingchun.bing_chun_admin

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothSocket
import android.util.Log
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

/**
 * ESC/POS over classic Bluetooth SPP — same approach as SUN IFORCE
 * [ThermalPrinterImpl] (BIXOLON-style 80 mm / Font A / 48 columns).
 */
class ThermalPrinter {
    private var bluetoothSocket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null

    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    private val reset = byteArrayOf(0x1B, 0x40)
    private val fontA = byteArrayOf(0x1B, 0x4D, 0x00)
    private val alignLeft = byteArrayOf(0x1B, 0x61, 0x00)
    private val alignCenter = byteArrayOf(0x1B, 0x61, 0x01)
    private val boldOn = byteArrayOf(0x1B, 0x45, 0x01)
    private val boldOff = byteArrayOf(0x1B, 0x45, 0x00)
    private val largeOn = byteArrayOf(0x1B, 0x21, 0x10)
    private val normalText = byteArrayOf(0x1B, 0x21, 0x00)
    private val feedLine = byteArrayOf(0x0A)
    private val feedAndCut = byteArrayOf(0x1D, 0x56, 0x42, 0x03)

    @SuppressLint("MissingPermission")
    fun connect(mac: String): Boolean {
        disconnect()
        return try {
            val adapter = BluetoothAdapter.getDefaultAdapter()
                ?: throw IOException("Bluetooth adapter unavailable")
            if (!adapter.isEnabled) throw IOException("Bluetooth is off")
            val device = adapter.getRemoteDevice(mac)
            bluetoothSocket = device.createRfcommSocketToServiceRecord(sppUuid)
            bluetoothSocket?.connect()
            outputStream = bluetoothSocket?.outputStream
            outputStream?.write(reset)
            outputStream?.write(fontA)
            outputStream?.flush()
            Log.d(TAG, "Connected to ${device.name} ($mac)")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Connect failed", e)
            disconnect()
            false
        }
    }

    fun disconnect() {
        try {
            outputStream?.close()
            bluetoothSocket?.close()
        } catch (_: IOException) {
        } finally {
            outputStream = null
            bluetoothSocket = null
        }
    }

    fun printReceipt(title: String, body: String, footer: String) {
        val out = outputStream ?: throw IOException("Printer not connected")
        out.write(fontA)

        if (title.isNotBlank()) {
            out.write(alignCenter)
            out.write(boldOn)
            out.write(largeOn)
            out.write(("$title\n").toByteArray(Charsets.UTF_8))
            out.write(normalText)
            out.write(boldOff)
            out.write(feedLine)
        }

        out.write(alignLeft)
        for (rawLine in body.split("\n")) {
            var line = rawLine
            var center = false
            var bold = false
            var large = false
            when {
                line.startsWith("[TITLE]") -> {
                    line = line.removePrefix("[TITLE]")
                    center = true
                    bold = true
                    large = true
                }
                line.startsWith("[B]") -> {
                    line = line.removePrefix("[B]")
                    bold = true
                }
                line.startsWith("[C]") -> {
                    line = line.removePrefix("[C]")
                    center = true
                }
            }
            out.write(if (center) alignCenter else alignLeft)
            if (bold) out.write(boldOn)
            out.write(if (large) largeOn else normalText)
            out.write(("$line\n").toByteArray(Charsets.UTF_8))
            if (large) out.write(normalText)
            if (bold) out.write(boldOff)
            out.write(alignLeft)
            out.flush()
            Thread.sleep(20)
        }
        out.write(feedLine)

        if (footer.isNotBlank()) {
            out.write(alignCenter)
            out.write(normalText)
            for (fLine in footer.split("\n")) {
                out.write(("${fLine.take(48)}\n").toByteArray(Charsets.UTF_8))
                out.flush()
                Thread.sleep(20)
            }
        }
        out.write(feedLine)
        out.flush()
    }

    fun feedAndCut() {
        val out = outputStream ?: return
        repeat(2) { out.write(feedLine) }
        out.flush()
        Thread.sleep(40)
        out.write(feedAndCut)
        out.flush()
        Thread.sleep(100)
    }

    companion object {
        private const val TAG = "ThermalPrinter"

        @SuppressLint("MissingPermission")
        fun bondedDevices(adapter: BluetoothAdapter?): List<Map<String, String>> {
            if (adapter == null) return emptyList()
            return adapter.bondedDevices.orEmpty().map { d ->
                mapOf(
                    "name" to (d.name ?: "Unknown"),
                    "address" to d.address,
                )
            }.sortedBy { it["name"] }
        }
    }
}
