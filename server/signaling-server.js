const http = require("http");
const { WebSocketServer } = require("ws");

try {
  require("dotenv").config();
} catch {
  // dotenv is optional; production hosts usually inject env vars directly.
}

const PORT = process.env.SIGNALING_PORT || 8080;
const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID || "";
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET || "";
const CASHFREE_ENV = String(process.env.CASHFREE_ENV || "sandbox").toLowerCase();
const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";
const CASHFREE_API_BASE =
  CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
const PAYMENT_APP_NAME = process.env.PAYMENT_APP_NAME || "Nvoisys Health";

const paymentOrders = new Map();

const httpJsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const sendHttpJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, httpJsonHeaders);
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

const paymentSourceId = (payload) =>
  toSafeString(payload.sourceId || payload.appointmentId || payload.packageOfferId);

const paymentSourceType = (payload) =>
  toSafeString(payload.sourceType || payload.kind || "appointment") || "appointment";

const buildReceipt = (sourceId, sourceType = "appointment") =>
  `${sourceType === "package_offer" ? "pkg" : "appt"}_${String(sourceId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "")}`
    .slice(0, 40) || `appt_${Date.now()}`;

const buildCashfreeOrderId = (sourceId, sourceType) =>
  `${buildReceipt(sourceId, sourceType)}_${Date.now()}`.slice(0, 50);

const toSafeString = (value) => String(value || "").trim();

const toPhoneDigits = (value) => String(value || "").replace(/\D/g, "");

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const cashfreeHeaders = () => ({
  "Content-Type": "application/json",
  "x-api-version": CASHFREE_API_VERSION,
  "x-client-id": CASHFREE_CLIENT_ID,
  "x-client-secret": CASHFREE_CLIENT_SECRET,
});

const appendQueryParams = (url, params) => {
  const query = Object.entries(params)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};

const publicOriginForRequest = (req) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost")
    .split(",")[0]
    .trim();
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto || (host === "api.nvoisyshealth.com" ? "https" : "http");
  return `${proto}://${host}`;
};

const redirectHtml = (targetUrl, title, message) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
    main { width: min(420px, calc(100vw - 32px)); padding: 28px; border-radius: 24px; background: #fff; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12); text-align: center; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 18px; color: #64748b; line-height: 1.5; }
    a { display: inline-block; border-radius: 14px; background: #4f46e5; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 18px; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="${escapeHtml(targetUrl)}">Return to app</a>
  </main>
  <script>window.location.href = ${JSON.stringify(targetUrl)};</script>
</body>
</html>`;

const createCashfreeOrder = async (payload, origin) => {
  if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
    throw new Error("Cashfree server credentials are not configured");
  }

  const amountPaise = Math.round(Number(payload.amountPaise || payload.amount || 0));
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw new Error("Invalid payment amount");
  }

  const sourceId = paymentSourceId(payload);
  const sourceType = paymentSourceType(payload);
  if (!sourceId) {
    throw new Error("payment source id is required");
  }

  const currency = toSafeString(payload.currency || "INR").toUpperCase();
  const customer = payload.customer || {};
  const customerPhone = toPhoneDigits(customer.phone || customer.contact || customer.mobile);
  if (customerPhone.length < 10) {
    throw new Error("Customer phone is required for Cashfree payments");
  }

  const orderId = buildCashfreeOrderId(sourceId, sourceType);
  const returnUrl = toSafeString(payload.returnUrl) || "myapp://payment/cashfree";
  const orderPayload = {
    order_id: orderId,
    order_amount: Number((amountPaise / 100).toFixed(2)),
    order_currency: currency,
    order_note: toSafeString(payload.description) || "Appointment consultation fee",
    customer_details: {
      customer_id: toSafeString(payload.metadata?.patientId) || sourceId,
      customer_name: toSafeString(customer.name) || "Patient",
      customer_email: toSafeString(customer.email),
      customer_phone: customerPhone,
    },
    order_meta: {
      return_url: `${origin}/payments/cashfree/return?orderId={order_id}`,
    },
    order_tags: {
      appointmentId: sourceType === "appointment" ? sourceId : "",
      sourceId,
      sourceType,
      packageOfferId: sourceType === "package_offer" ? sourceId : "",
      patientId: toSafeString(payload.metadata?.patientId),
      doctorId: toSafeString(payload.metadata?.doctorId),
    },
  };

  const response = await fetch(`${CASHFREE_API_BASE}/orders`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify(orderPayload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.message || data?.error?.message || data?.error || "Cashfree order failed",
    );
  }

  const storedOrder = {
    cashfreeOrderId: data.order_id || orderId,
    paymentSessionId: data.payment_session_id,
    appointmentId: sourceType === "appointment" ? sourceId : "",
    sourceId,
    sourceType,
    amount: amountPaise,
    currency,
    description:
      toSafeString(payload.description) || "Appointment consultation fee",
    returnUrl,
    customer,
    createdAt: Date.now(),
  };
  if (!storedOrder.paymentSessionId) {
    throw new Error("Cashfree did not return a payment session");
  }
  paymentOrders.set(storedOrder.cashfreeOrderId, storedOrder);
  return storedOrder;
};

const renderCashfreeCheckout = (order) => {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(PAYMENT_APP_NAME)} Payment</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
    main { width: min(420px, calc(100vw - 32px)); padding: 28px; border-radius: 24px; background: #fff; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12); text-align: center; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 18px; color: #64748b; line-height: 1.5; }
    button { border: 0; border-radius: 14px; background: #4f46e5; color: #fff; font-size: 16px; font-weight: 700; padding: 14px 18px; width: 100%; }
    small { display: block; margin-top: 14px; color: #94a3b8; }
  </style>
</head>
<body>
  <main>
    <h1>Complete Payment</h1>
    <p>Cashfree will show UPI, cards, netbanking, wallets, and other available INR payment options.</p>
    <button id="payButton" type="button">Pay ₹${escapeHtml((order.amount / 100).toFixed(2))}</button>
    <small>If checkout does not open automatically, tap Pay.</small>
  </main>
  <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
  <script>
    const cashfree = Cashfree({ mode: ${JSON.stringify(CASHFREE_ENV === "production" ? "production" : "sandbox")} });

    function openCheckout() {
      cashfree.checkout({
        paymentSessionId: ${JSON.stringify(order.paymentSessionId)},
        redirectTarget: "_self",
      }).catch(function () {
        window.location.href = ${JSON.stringify(
          appendQueryParams(order.returnUrl, {
            status: "failed",
            appointmentId: order.appointmentId,
            sourceId: order.sourceId,
            sourceType: order.sourceType,
            cashfreeOrderId: order.cashfreeOrderId,
            message: "Unable to open Cashfree checkout",
          }),
        )};
      });
    }

    document.getElementById("payButton").addEventListener("click", openCheckout);
    window.setTimeout(openCheckout, 300);
  </script>
</body>
</html>`;
};

const verifyCashfreePayment = async (payload) => {
  if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
    throw new Error("Cashfree server credentials are not configured");
  }
  const orderId = toSafeString(payload.cashfreeOrderId || payload.orderId);
  if (!orderId) {
    throw new Error("Incomplete Cashfree verification payload");
  }
  const storedOrder = paymentOrders.get(orderId);
  if (
    storedOrder?.appointmentId &&
    payload.appointmentId &&
    storedOrder.appointmentId !== payload.appointmentId
  ) {
    throw new Error("Payment does not match this appointment");
  }
  if (
    storedOrder?.sourceId &&
    payload.sourceId &&
    storedOrder.sourceId !== payload.sourceId
  ) {
    throw new Error("Payment does not match this source");
  }

  const response = await fetch(`${CASHFREE_API_BASE}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: cashfreeHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Cashfree verification failed");
  }
  if (data.order_status !== "PAID") {
    throw new Error(`Cashfree payment status is ${data.order_status || "unknown"}`);
  }

  return {
    ...(storedOrder || {}),
    cashfreeOrderId: orderId,
    cashfreePaymentStatus: data.order_status,
    cfOrderId: data.cf_order_id,
  };
};

const handleHttpRequest = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, httpJsonHeaders);
    res.end();
    return;
  }

  const publicOrigin = publicOriginForRequest(req);
  const requestUrl = new URL(req.url || "/", publicOrigin);

  if (req.method === "POST" && requestUrl.pathname === "/payments/cashfree/orders") {
    try {
      const body = await readJsonBody(req);
      const order = await createCashfreeOrder(body, publicOrigin);
      sendHttpJson(res, 200, {
        cashfreeOrderId: order.cashfreeOrderId,
        orderId: order.cashfreeOrderId,
        amount: order.amount,
        currency: order.currency,
        sourceId: order.sourceId,
        sourceType: order.sourceType,
        checkoutUrl: `${publicOrigin}/payments/cashfree/checkout?orderId=${encodeURIComponent(
          order.cashfreeOrderId,
        )}`,
      });
    } catch (error) {
      sendHttpJson(res, 400, { error: error.message || "Unable to create order" });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/payments/cashfree/checkout") {
    const orderId = requestUrl.searchParams.get("orderId");
    const order = paymentOrders.get(orderId);
    if (!order) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("Payment order not found or expired.");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderCashfreeCheckout(order));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/payments/cashfree/return") {
    const orderId = requestUrl.searchParams.get("orderId") || requestUrl.searchParams.get("order_id");
    const order = paymentOrders.get(orderId);
    const appReturnUrl = order?.returnUrl || "myapp://payment/cashfree";
    let targetUrl;
    try {
      const verified = await verifyCashfreePayment({
        cashfreeOrderId: orderId,
        appointmentId: order?.appointmentId,
      });
      targetUrl = appendQueryParams(appReturnUrl, {
        status: "success",
        appointmentId: verified.appointmentId,
        sourceId: verified.sourceId,
        sourceType: verified.sourceType,
        cashfreeOrderId: verified.cashfreeOrderId,
      });
    } catch (error) {
      targetUrl = appendQueryParams(appReturnUrl, {
        status: "failed",
        appointmentId: order?.appointmentId,
        sourceId: order?.sourceId,
        sourceType: order?.sourceType,
        cashfreeOrderId: orderId,
        message: error.message || "Payment verification failed",
      });
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(redirectHtml(targetUrl, "Returning to app", "Payment status checked. You can return to the app."));
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/payments/cashfree/verify") {
    try {
      const body = await readJsonBody(req);
      const order = await verifyCashfreePayment(body);
      sendHttpJson(res, 200, {
        verified: true,
        appointmentId: order.appointmentId || body.appointmentId || null,
        sourceId: order.sourceId || body.sourceId || null,
        sourceType: order.sourceType || body.sourceType || "appointment",
        cashfreeOrderId: order.cashfreeOrderId,
        cashfreePaymentStatus: order.cashfreePaymentStatus,
      });
    } catch (error) {
      sendHttpJson(res, 400, { verified: false, error: error.message || "Payment verification failed" });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    sendHttpJson(res, 200, { ok: true });
    return;
  }

  sendHttpJson(res, 404, { error: "Not found" });
};

const server = http.createServer(handleHttpRequest);
const wss = new WebSocketServer({ server });

const rooms = new Map();

const sendJson = (client, payload) => {
  if (!client || client.readyState !== client.OPEN) return;
  client.send(JSON.stringify(payload));
};

const broadcastRoom = (roomId, payload, exceptClient = null) => {
  const clients = rooms.get(roomId) || [];
  clients.forEach((client) => {
    if (client === exceptClient) return;
    sendJson(client, payload);
  });
};

const removeClientFromRoom = (client) => {
  if (!client.roomId) return;
  const clients = rooms.get(client.roomId) || [];
  const updated = clients.filter((item) => item !== client);
  if (updated.length === 0) {
    rooms.delete(client.roomId);
  } else {
    rooms.set(client.roomId, updated);
  }
  broadcastRoom(client.roomId, { type: "peer-left" }, client);
};

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (error) {
      return;
    }

    if (payload.type === "join") {
      const roomId = payload.roomId;
      if (!roomId) return;
      const clients = rooms.get(roomId) || [];

      ws.roomId = roomId;
      ws.userId = payload.userId || null;

      const role = clients.length === 0 ? "initiator" : "receiver";
      const updated = [...clients, ws].slice(0, 2);
      rooms.set(roomId, updated);

      sendJson(ws, { type: "joined", role });

      if (updated.length === 2) {
        broadcastRoom(roomId, { type: "ready" });
      }
      return;
    }

    if (!ws.roomId) return;
    if (["offer", "answer", "ice", "leave"].includes(payload.type)) {
      if (payload.type === "leave") {
        removeClientFromRoom(ws);
        return;
      }
      broadcastRoom(ws.roomId, payload, ws);
    }
  });

  ws.on("close", () => {
    removeClientFromRoom(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on ws://localhost:${PORT}`);
});
