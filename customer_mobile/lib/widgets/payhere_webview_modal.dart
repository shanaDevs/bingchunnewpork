import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/mascot_images.dart';
import '../theme/bc_theme.dart';

enum PaymentResult { success, cancelled, failed }

class PayHereWebViewModal extends StatefulWidget {
  final String initialUrl;

  const PayHereWebViewModal({
    super.key,
    required this.initialUrl,
  });

  static Future<PaymentResult?> show(BuildContext context, String initialUrl) {
    return showModalBottomSheet<PaymentResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      enableDrag: false, // Prevent accidental dismissal by dragging down
      builder: (context) => PayHereWebViewModal(initialUrl: initialUrl),
    );
  }

  @override
  State<PayHereWebViewModal> createState() => _PayHereWebViewModalState();
}

class _PayHereWebViewModalState extends State<PayHereWebViewModal> {
  late final WebViewController _controller;
  double _progress = 0.0;
  String? _error;
  bool _showRedirectSplash = true;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            setState(() {
              _progress = progress / 100.0;
            });
          },
          onPageStarted: (String url) {
            debugPrint("WebView started loading: $url");
            if (_isGatewayHost(url)) {
              setState(() => _showRedirectSplash = false);
            }
            _handleReturnUrl(url);
          },
          onPageFinished: (String url) {
            debugPrint("WebView finished loading: $url");
            if (_isGatewayHost(url)) {
              setState(() => _showRedirectSplash = false);
            }
            _handleReturnUrl(url);
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint("WebView Resource Error: ${error.description} (Code: ${error.errorCode}, Type: ${error.errorType})");
            
            // Ignore aborted/cancelled loads from custom navigation intercepts
            if (error.errorCode == -999 || 
                error.errorCode == -3 || 
                error.description.toLowerCase().contains('abort') ||
                error.description.toLowerCase().contains('cancel')) {
              return;
            }

            // Only capture main frame errors that prevent the page from rendering
            if (error.isForMainFrame == true) {
              setState(() {
                _error = "${error.description} (Code: ${error.errorCode})";
              });
            }
          },
          onNavigationRequest: (NavigationRequest request) {
            debugPrint("WebView Navigating to: ${request.url}");
            if (_handleReturnUrl(request.url)) {
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..setUserAgent(
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      )
      ..loadRequest(
        Uri.parse(widget.initialUrl),
        headers: {
          'Referer': 'https://bing-chung.mp.dartcodes.com/',
          'Origin': 'https://bing-chung.mp.dartcodes.com',
        },
      );
  }

  bool _isGatewayHost(String url) {
    final lower = url.toLowerCase();
    return lower.contains('payhere.lk') ||
        lower.contains('webxpay') ||
        lower.contains('/payments/payhere') ||
        lower.contains('/payments/webxpay');
  }

  /// Returns true when navigation was consumed (sheet closed).
  bool _handleReturnUrl(String url) {
    if (!mounted || _closed) return false;
    final lower = url.toLowerCase();
    final uri = Uri.tryParse(url);

    // Don't treat the gateway checkout pages themselves as cancel/success.
    final isCheckoutPage = (lower.contains('/payments/payhere/') &&
            !lower.contains('payhere-return')) ||
        (lower.contains('/payments/webxpay/') && !lower.contains('webxpay-return')) ||
        lower.contains('payhere.lk/pay/') ||
        lower.contains('webxpay.com');
    if (isCheckoutPage) {
      return false;
    }

    if (lower.contains('payment=failed') ||
        lower.contains('payment=cancel') ||
        (lower.contains('/checkout') && !lower.contains('payhere') && !lower.contains('webxpay'))) {
      _closed = true;
      Navigator.of(context).pop(PaymentResult.cancelled);
      return true;
    }

    if (lower.contains('/order/') ||
        lower.contains('/track/') ||
        lower.contains('payhere-return') ||
        lower.contains('webxpay-return') ||
        (uri?.queryParameters['payment'] == 'success')) {
      _closed = true;
      Navigator.of(context).pop(PaymentResult.success);
      return true;
    }

    return false;
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final height = mediaQuery.size.height * 0.85;
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Container(
      height: height,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            // Top Control Bar
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: context.bc.border, width: 1.5),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.lock_outline, color: BcColors.brand, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'Secure Online Payment',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: onSurface,
                          fontSize: 15,
                        ),
                      ),
                    ],
                  ),
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(PaymentResult.cancelled),
                    child: Text(
                      'Cancel',
                      style: TextStyle(
                        color: bc.mutedText,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Browser-style loading bar
            if (_progress < 1.0 && _error == null)
              LinearProgressIndicator(
                value: _progress,
                color: BcColors.brand,
                backgroundColor: context.bc.border,
                minHeight: 3,
              ),
            
            // WebView Content or Error View
            Expanded(
              child: _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.warning_amber_rounded, color: BcColors.error, size: 48),
                            const SizedBox(height: 16),
                            Text(
                              'Failed to load payment page',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Theme.of(context).colorScheme.onSurface,
                                  fontSize: 16,
                                ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: context.bc.mutedText,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 24),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                ElevatedButton.icon(
                                  onPressed: () {
                                    setState(() {
                                      _error = null;
                                      _progress = 0.0;
                                    });
                                    _controller.loadRequest(
                                      Uri.parse(widget.initialUrl),
                                      headers: {
                                        'Referer': 'https://bing-chung.mp.dartcodes.com/',
                                        'Origin': 'https://bing-chung.mp.dartcodes.com',
                                      },
                                    );
                                  },
                                  icon: const Icon(Icons.refresh),
                                  label: const Text('Try Again'),
                                ),
                                const SizedBox(width: 12),
                                OutlinedButton.icon(
                                  onPressed: () async {
                                    final uri = Uri.parse(widget.initialUrl);
                                    try {
                                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                                    } catch (e) {
                                      debugPrint("Could not launch externally: $e");
                                    }
                                  },
                                  icon: const Icon(Icons.open_in_new),
                                  label: const Text('Open in Browser'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    )
                  : Stack(
                      fit: StackFit.expand,
                      children: [
                        WebViewWidget(controller: _controller),
                        if (_showRedirectSplash)
                          ColoredBox(
                            color: const Color(0xFF080B18),
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Image.asset(
                                      MascotImages.thinkingLoading,
                                      width: 200,
                                      height: 200,
                                      fit: BoxFit.contain,
                                      errorBuilder: (_, __, ___) => Image.asset(
                                        MascotImages.thinking,
                                        width: 200,
                                        height: 200,
                                        fit: BoxFit.contain,
                                      ),
                                    ),
                                    const SizedBox(height: 20),
                                    const SizedBox(
                                      width: 28,
                                      height: 28,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2.5,
                                        color: BcColors.brand,
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Text(
                                      'Opening secure payment…',
                                      style: TextStyle(
                                        color: context.bc.mutedText,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
