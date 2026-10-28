# Moshi / Retrofit models are accessed reflectively — keep data classes.
-keep class lk.bingchun.delivery.data.model.** { *; }
-keepclassmembers class lk.bingchun.delivery.data.model.** { *; }

# socket.io-client
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# OkHttp / Okio
-dontwarn okhttp3.**
-dontwarn okio.**
