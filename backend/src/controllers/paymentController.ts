import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { getPaymentSettings, isValidPayHereCredentials, isValidWebXPayCredentials } from '../lib/paymentSettings';
import { buildPayHereCheckoutFields } from '../integrations/paymentAdapter';
import { resolveFrontendUrl, CUSTOMER_SHOP_URL, isProductionDeployment } from '../lib/resolveFrontendUrl';
import { buildPayhereReturnUrl, payhereNotifyUrl, serverRootUrl } from '../lib/payhereUrls';
import { processPayHerePaymentNotification } from '../lib/payherePayment';
import { buildWebXPayCheckoutFields, lockOnlineChargeAmount, processWebXPayReturn, verifyWebXPayReturn } from '../lib/webxpayPayment';
import { getOrderPaymentFailureReason } from '../lib/orderSchema';
import { buildOrderTrackPath, readTrackToken } from '../lib/orderAccess';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paymentFailedRedirect(path: string, reason?: string | null): string {
  const params = new URLSearchParams({ payment: 'failed' });
  if (reason?.trim()) params.set('reason', reason.trim());
  return `${path}?${params.toString()}`;
}

function checkoutPaymentFailedRedirect(frontendBase: string, reason?: string | null): string {
  return paymentFailedRedirect(`${frontendBase.replace(/\/$/, '')}/checkout`, reason);
}

function paymentReturnShop(req: Request): string {
  if (isProductionDeployment()) return CUSTOMER_SHOP_URL;
  return resolveFrontendUrl(req);
}

/** API origin without `/api` — static mascots live at `/mascots`, not `/api/mascots`. */
function pickPayhereParam(req: Request, key: string): string | undefined {
  const fromQuery = req.query[key];
  const fromBody = (req.body as Record<string, unknown> | undefined)?.[key];
  const raw =
    (typeof fromQuery === 'string' ? fromQuery : undefined) ??
    (typeof fromBody === 'string' || typeof fromBody === 'number' ? String(fromBody) : undefined);
  return raw?.trim() || undefined;
}

function orderTrackPath(frontendBase: string, order: { trackToken: string | null; orderNumber: string }): string {
  if (order.trackToken) {
    return `${frontendBase.replace(/\/$/, '')}${buildOrderTrackPath(order.trackToken)}`;
  }
  return `${frontendBase.replace(/\/$/, '')}/order/${encodeURIComponent(order.orderNumber)}`;
}

/** PayHere browser return — verify payment server-side, then redirect to order page. */
export async function payhereReturnPage(req: Request, res: Response, next: NextFunction) {
  try {
    const orderNumber = String(req.params.orderNumber || '');
    const frontendBase = paymentReturnShop(req);
    const order = await prisma.order.findFirst({
      where: { orderNumber },
      select: { trackToken: true, orderNumber: true, paymentStatus: true },
    });
    if (!order) return res.redirect(`${frontendBase}/checkout?payment=error`);
    const orderPath = orderTrackPath(frontendBase, order);

    if (order.paymentStatus === 'PAID') {
      return res.redirect(`${orderPath}?paid=1`);
    }

    const payload = {
      merchant_id: pickPayhereParam(req, 'merchant_id'),
      order_id: pickPayhereParam(req, 'order_id') ?? orderNumber,
      payment_id: pickPayhereParam(req, 'payment_id'),
      payhere_amount: pickPayhereParam(req, 'payhere_amount'),
      payhere_currency: pickPayhereParam(req, 'payhere_currency'),
      status_code: pickPayhereParam(req, 'status_code'),
      md5sig: pickPayhereParam(req, 'md5sig'),
      status_message: pickPayhereParam(req, 'status_message'),
    };

    if (!payload.md5sig || payload.status_code == null) {
      return res.redirect(checkoutPaymentFailedRedirect(frontendBase, 'Payment was not completed'));
    }

    const result = await processPayHerePaymentNotification(payload);
    if (result === 'PAID') return res.redirect(`${orderPath}?paid=1`);

    const refreshed = await prisma.order.findFirst({
      where: { orderNumber },
      select: { paymentStatus: true },
    });
    if (refreshed?.paymentStatus === 'PAID') {
      return res.redirect(`${orderPath}?paid=1`);
    }

    if (result === 'FAILED' || result === 'INVALID') {
      const reason = await getOrderPaymentFailureReason(orderNumber);
      return res.redirect(checkoutPaymentFailedRedirect(frontendBase, reason));
    }
    return res.redirect(`${orderPath}?payment=pending`);
  } catch (err) {
    next(err);
  }
}

/** Inline mascot so WebView never depends on a second network fetch. */
function payhereLoadingMascotSrc(): string {
  const publicDir = path.join(__dirname, '..', '..', 'public', 'mascots');
  const candidates = ['thinking-loading.png', 'thinking.png', 'loading.png'];
  for (const name of candidates) {
    const file = path.join(publicDir, name);
    if (fs.existsSync(file)) {
      const b64 = fs.readFileSync(file).toString('base64');
      return `data:image/png;base64,${b64}`;
    }
  }
  return `${serverRootUrl()}/mascots/thinking.png`;
}

async function loadPayhereCheckoutContext(req: Request, orderNumber: string) {
  const trackToken = readTrackToken(req);
  const order = await prisma.order.findFirst({
    where: { orderNumber },
    include: { store: { select: { name: true } } },
  });

  if (!order) throw new AppError('Order not found', 404);
  if (!trackToken || !order.trackToken || trackToken !== order.trackToken) {
    throw new AppError('Valid track token required', 403);
  }
  if (order.paymentMethod !== 'PAYHERE' && order.paymentMethod !== 'CARD') {
    throw new AppError('This order does not use online payment', 400);
  }

  const frontendBase = paymentReturnShop(req);
  if (order.paymentStatus === 'PAID') {
    return { order, frontendBase, alreadyPaid: true as const };
  }

  const settings = await getPaymentSettings();
  if (!isValidPayHereCredentials(settings.payhere.merchantId, settings.payhere.merchantSecret)) {
    throw new AppError('Online payment is not configured on the server', 503);
  }

  const sandbox = settings.payhere.mode !== 'live';
  const checkout = buildPayHereCheckoutFields({
    merchantId: settings.payhere.merchantId,
    merchantSecret: settings.payhere.merchantSecret,
    sandbox,
    orderNumber: order.orderNumber,
    amount: Number(order.total),
    customerName: order.guestName || 'Customer',
    customerPhone: order.guestPhone || '0770000000',
    customerEmail: order.guestEmail || undefined,
    returnUrl: buildPayhereReturnUrl(req, order.orderNumber, frontendBase),
    cancelUrl: `${frontendBase}/checkout`,
    notifyUrl: payhereNotifyUrl(),
    itemDescription: `Bing Chun Order ${order.orderNumber}`,
    address: order.deliveryAddressLine || 'Colombo',
    city: order.deliveryCity || 'Colombo',
  });

  await lockOnlineChargeAmount(order.id, Number(order.total));

  return { order, frontendBase, alreadyPaid: false as const, sandbox, checkout };
}

/** JSON session for PayHere popup checkout (no full-page redirect). */
export async function payhereCheckoutSession(req: Request, res: Response, next: NextFunction) {
  try {
    const orderNumber = String(req.params.orderNumber || '');
    const ctx = await loadPayhereCheckoutContext(req, orderNumber);

    if (ctx.alreadyPaid) {
      return res.json({ success: true, data: { alreadyPaid: true } });
    }

    const { checkout, sandbox } = ctx;
    const fields = checkout.fields;

    return res.json({
      success: true,
      data: {
        paymentUrl: `${checkout.action}?${new URLSearchParams(fields).toString()}`,
        payhere: {
          sandbox,
          merchant_id: fields.merchant_id,
          notify_url: fields.notify_url,
          order_id: fields.order_id,
          items: fields.items,
          amount: fields.amount,
          currency: fields.currency,
          hash: fields.hash,
          first_name: fields.first_name,
          last_name: fields.last_name,
          email: fields.email,
          phone: fields.phone,
          address: fields.address,
          city: fields.city,
          country: fields.country,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Server-rendered auto-submit form — POST to PayHere (fallback when popup unavailable). */
export async function payhereCheckoutPage(req: Request, res: Response, next: NextFunction) {
  try {
    const orderNumber = String(req.params.orderNumber || '');
    const ctx = await loadPayhereCheckoutContext(req, orderNumber);

    if (ctx.alreadyPaid) {
      return res.redirect(orderTrackPath(ctx.frontendBase, ctx.order));
    }

    const { order, checkout, sandbox } = ctx;
    const inputs = Object.entries(checkout.fields)
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
      .join('\n');

    const mascotSrc = payhereLoadingMascotSrc();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting to online payment…</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Poppins',system-ui,sans-serif;background:#080b18;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .box{text-align:center;padding:2rem;max-width:420px}
    .mascot-wrap{margin:0 auto 1.25rem;width:min(280px,80vw);aspect-ratio:1;display:flex;align-items:center;justify-content:center}
    .mascot{width:100%;height:auto;display:block;animation:float 2.4s ease-in-out infinite}
    h1{font-size:1.35rem;font-weight:700;margin:0 0 .5rem;color:#fff}
    .sub{color:#9ca8c4;font-size:.95rem;margin:0 0 1.25rem;line-height:1.5}
    .order{font-size:.8rem;color:#307ef2;margin-bottom:1rem;font-weight:600}
    .spin{width:32px;height:32px;border:3px solid rgba(48,126,242,.25);border-top-color:#307ef2;border-radius:50%;animation:spin .75s linear infinite;margin:0 auto 1rem}
    .btn{display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;background:#307ef2;color:#fff;border:none;border-radius:999px;font-weight:600;font-size:.95rem;cursor:pointer}
    .btn:hover{background:#2568c7}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  </style>
</head>
<body>
  <div class="box">
    <div class="mascot-wrap">
      <img class="mascot" src="${mascotSrc.startsWith('data:') ? mascotSrc : escapeHtml(mascotSrc)}" alt="" width="280" height="280" />
    </div>
    <p class="order">Order ${escapeHtml(order.orderNumber)}</p>
    <h1>Redirecting to online payment${sandbox ? ' (test)' : ''}</h1>
    <p class="sub">Secure payment is opening…<br />Please don&apos;t close this page.</p>
    <div class="spin" aria-hidden="true"></div>
    <form id="payhere" method="post" action="${escapeHtml(checkout.action)}" target="_top">
      ${inputs}
      <button type="submit" class="btn" id="payhere-fallback">Continue to online payment</button>
    </form>
  </div>
  <script>
    (function () {
      var form = document.getElementById('payhere');
      var fallback = document.getElementById('payhere-fallback');
      if (!form) return;
      if (fallback) fallback.style.display = 'none';
      function submit() {
        try { form.submit(); } catch (e) { if (fallback) fallback.style.display = 'inline-block'; }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', submit);
      } else {
        submit();
      }
      setTimeout(function () {
        if (fallback) fallback.style.display = 'inline-block';
      }, 4000);
    })();
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    next(err);
  }
}

function pickWebxpayParam(req: Request, key: string): string | undefined {
  const fromQuery = req.query[key];
  const fromBody = (req.body as Record<string, unknown> | undefined)?.[key];
  const raw =
    (typeof fromQuery === 'string' ? fromQuery : undefined) ??
    (typeof fromBody === 'string' ? fromBody : undefined) ??
    (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string' ? fromQuery[0] : undefined) ??
    (Array.isArray(fromBody) && typeof fromBody[0] === 'string' ? fromBody[0] : undefined);
  return raw?.trim() || undefined;
}

/** WebXPay browser return — verify payment, mark paid, redirect to order page. */
export async function webxpayReturnPage(req: Request, res: Response, next: NextFunction) {
  try {
    const frontendBase = paymentReturnShop(req);
    const input = {
      payment: pickWebxpayParam(req, 'payment'),
      signature:
        pickWebxpayParam(req, 'signature') ??
        pickWebxpayParam(req, 'signature') ??
        pickWebxpayParam(req, 'sig'),
      custom_fields:
        pickWebxpayParam(req, 'custom_fields') ??
        pickWebxpayParam(req, 'custom_fields') ??
        pickWebxpayParam(req, 'customFields'),
    };

    if (!input.payment || !input.signature) {
      return res.redirect(frontendBase);
    }

    const settings = await getPaymentSettings();
    if (!isValidWebXPayCredentials(settings.webxpay.publicKey, settings.webxpay.secretKey)) {
      return res.redirect(checkoutPaymentFailedRedirect(frontendBase, 'Online payment is not configured'));
    }

    const { valid, payload } = verifyWebXPayReturn(input, settings.webxpay.publicKey);
    if (!valid || !payload) {
      return res.redirect(checkoutPaymentFailedRedirect(frontendBase, 'Payment could not be verified'));
    }

    const order = await prisma.order.findFirst({
      where: { orderNumber: payload.orderId },
      select: { trackToken: true, orderNumber: true },
    });
    const orderPath = order
      ? orderTrackPath(frontendBase, order)
      : `${frontendBase}/order/${encodeURIComponent(payload.orderId)}`;
    const result = await processWebXPayReturn(input);

    if (result === 'PAID') return res.redirect(`${orderPath}?paid=1`);

    const reason = await getOrderPaymentFailureReason(payload.orderId);

    if (result === 'FAILED') {
      return res.redirect(checkoutPaymentFailedRedirect(frontendBase, reason));
    }
    return res.redirect(checkoutPaymentFailedRedirect(frontendBase, reason));
  } catch (err) {
    try {
      const frontendBase = paymentReturnShop(req);
      return res.redirect(checkoutPaymentFailedRedirect(frontendBase, 'Payment could not be completed'));
    } catch {
      next(err);
    }
  }
}

async function loadWebxpayCheckoutContext(req: Request, orderNumber: string) {
  const trackToken = readTrackToken(req);
  const order = await prisma.order.findFirst({
    where: { orderNumber },
    include: { store: { select: { name: true } } },
  });

  if (!order) throw new AppError('Order not found', 404);
  if (!trackToken || !order.trackToken || trackToken !== order.trackToken) {
    throw new AppError('Valid track token required', 403);
  }
  if (order.paymentMethod !== 'PAYHERE' && order.paymentMethod !== 'CARD') {
    throw new AppError('This order does not use online payment', 400);
  }

  const frontendBase = paymentReturnShop(req);
  if (order.paymentStatus === 'PAID') {
    return { order, frontendBase, alreadyPaid: true as const };
  }

  const settings = await getPaymentSettings();
  if (!isValidWebXPayCredentials(settings.webxpay.publicKey, settings.webxpay.secretKey)) {
    throw new AppError('Online payment is not configured on the server', 503);
  }

  const checkout = buildWebXPayCheckoutFields({
    publicKey: settings.webxpay.publicKey,
    secretKey: settings.webxpay.secretKey,
    mode: settings.webxpay.mode,
    orderNumber: order.orderNumber,
    amount: Number(order.total),
    customerName: order.guestName || 'Customer',
    customerPhone: order.guestPhone || '0770000000',
    customerEmail: order.guestEmail || undefined,
    address: order.deliveryAddressLine || 'Colombo',
    city: order.deliveryCity || 'Colombo',
  });

  await lockOnlineChargeAmount(order.id, Number(order.total));

  return { order, frontendBase, alreadyPaid: false as const, checkout };
}

/** Server-rendered auto-submit form — browser POSTs to WebXPay (standard redirect integration). */
export async function webxpayCheckoutPage(req: Request, res: Response, next: NextFunction) {
  try {
    const orderNumber = String(req.params.orderNumber || '');
    const ctx = await loadWebxpayCheckoutContext(req, orderNumber);

    if (ctx.alreadyPaid) {
      return res.redirect(orderTrackPath(ctx.frontendBase, ctx.order) + '?paid=1');
    }

    const { order, checkout } = ctx;
    const settings = await getPaymentSettings();
    const sandbox = settings.webxpay.mode === 'sandbox';
    const inputs = Object.entries(checkout.fields)
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
      .join('\n');

    const mascotSrc = payhereLoadingMascotSrc();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting to online payment…</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Poppins',system-ui,sans-serif;background:#080b18;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .box{text-align:center;padding:2rem;max-width:420px}
    .mascot-wrap{margin:0 auto 1.25rem;width:min(280px,80vw);aspect-ratio:1;display:flex;align-items:center;justify-content:center}
    .mascot{width:100%;height:auto;display:block;animation:float 2.4s ease-in-out infinite}
    h1{font-size:1.35rem;font-weight:700;margin:0 0 .5rem;color:#fff}
    .sub{color:#9ca8c4;font-size:.95rem;margin:0 0 1.25rem;line-height:1.5}
    .order{font-size:.8rem;color:#307ef2;margin-bottom:1rem;font-weight:600}
    .spin{width:32px;height:32px;border:3px solid rgba(48,126,242,.25);border-top-color:#307ef2;border-radius:50%;animation:spin .75s linear infinite;margin:0 auto 1rem}
    .btn{display:inline-block;margin-top:1rem;padding:.75rem 1.5rem;background:#307ef2;color:#fff;border:none;border-radius:999px;font-weight:600;font-size:.95rem;cursor:pointer}
    .btn:hover{background:#2568c7}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  </style>
</head>
<body>
  <div class="box">
    <div class="mascot-wrap">
      <img class="mascot" src="${mascotSrc.startsWith('data:') ? mascotSrc : escapeHtml(mascotSrc)}" alt="" width="280" height="280" />
    </div>
    <p class="order">Order ${escapeHtml(order.orderNumber)}</p>
    <h1>Redirecting to online payment${sandbox ? ' (test)' : ''}</h1>
    <p class="sub">Secure payment is opening…<br />Please don&apos;t close this page.</p>
    <div class="spin" aria-hidden="true"></div>
    <form id="webxpay" method="post" action="${escapeHtml(checkout.action)}" target="_top">
      ${inputs}
      <button type="submit" class="btn" id="webxpay-fallback">Continue to online payment</button>
    </form>
  </div>
  <script>
    (function () {
      var form = document.getElementById('webxpay');
      var fallback = document.getElementById('webxpay-fallback');
      if (!form) return;
      if (fallback) fallback.style.display = 'none';
      function submit() {
        try { form.submit(); } catch (e) { if (fallback) fallback.style.display = 'inline-block'; }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', submit);
      } else {
        submit();
      }
      setTimeout(function () {
        if (fallback) fallback.style.display = 'inline-block';
      }, 4000);
    })();
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    next(err);
  }
}
