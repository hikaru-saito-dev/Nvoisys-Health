const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.SIGNALING_PORT || 8080;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
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

const razorpayAuthHeader = () =>
  `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString(
    "base64",
  )}`;

const buildReceipt = (appointmentId) =>
  `appt_${String(appointmentId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "")}`
    .slice(0, 40) || `appt_${Date.now()}`;

const toSafeString = (value) => String(value || "").trim();

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const createRazorpayOrder = async (payload) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay server keys are not configured");
  }

  const amount = Math.round(Number(payload.amountPaise || payload.amount || 0));
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error("Invalid payment amount");
  }

  const appointmentId = toSafeString(payload.appointmentId);
  if (!appointmentId) {
    throw new Error("appointmentId is required");
  }

  const currency = toSafeString(payload.currency || "INR").toUpperCase();
  const orderPayload = {
    amount,
    currency,
    receipt: buildReceipt(appointmentId),
    notes: {
      appointmentId,
      patientId: toSafeString(payload.metadata?.patientId),
      doctorId: toSafeString(payload.metadata?.doctorId),
    },
  };

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: razorpayAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orderPayload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.error?.description || data?.error?.reason || "Razorpay order failed",
    );
  }

  const storedOrder = {
    razorpayOrderId: data.id,
    appointmentId,
    amount,
    currency,
    description:
      toSafeString(payload.description) || "Appointment consultation fee",
    returnUrl: toSafeString(payload.returnUrl) || "myapp://payment/razorpay",
    customer: payload.customer || {},
    createdAt: Date.now(),
  };
  paymentOrders.set(data.id, storedOrder);
  return storedOrder;
};

const renderRazorpayCheckout = (order) => {
  const customer = order.customer || {};
  const checkoutOptions = {
    key: RAZORPAY_KEY_ID,
    amount: order.amount,
    currency: order.currency,
    name: PAYMENT_APP_NAME,
    description: order.description,
    order_id: order.razorpayOrderId,
    prefill: {
      name: toSafeString(customer.name),
      email: toSafeString(customer.email),
      contact: toSafeString(customer.contact),
    },
    notes: {
      appointmentId: order.appointmentId,
    },
    theme: {
      color: "#4F46E5",
    },
  };

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
    <p>Razorpay will show UPI, cards, RuPay, netbanking, and other available INR payment options.</p>
    <button id="payButton" type="button">Pay ₹${escapeHtml((order.amount / 100).toFixed(2))}</button>
    <small>If checkout does not open automatically, tap Pay.</small>
  </main>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    const returnUrl = ${JSON.stringify(order.returnUrl)};
    const options = ${JSON.stringify(checkoutOptions)};

    function redirectBack(status, values) {
      const params = new URLSearchParams({
        status,
        appointmentId: ${JSON.stringify(order.appointmentId)},
        razorpay_order_id: values.razorpay_order_id || options.order_id || "",
        razorpay_payment_id: values.razorpay_payment_id || "",
        razorpay_signature: values.razorpay_signature || "",
        message: values.message || "",
      });
      window.location.href = returnUrl + (returnUrl.includes("?") ? "&" : "?") + params.toString();
    }

    options.handler = function (response) {
      redirectBack("success", response || {});
    };
    options.modal = {
      ondismiss: function () {
        redirectBack("cancelled", { message: "Payment cancelled" });
      },
    };

    function openCheckout() {
      const checkout = new Razorpay(options);
      checkout.open();
    }

    document.getElementById("payButton").addEventListener("click", openCheckout);
    window.setTimeout(openCheckout, 300);
  </script>
</body>
</html>`;
};

const verifyRazorpayPayment = (payload) => {
  if (!RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay server keys are not configured");
  }
  const orderId = toSafeString(payload.razorpayOrderId);
  const paymentId = toSafeString(payload.razorpayPaymentId);
  const signature = toSafeString(payload.razorpaySignature);
  if (!orderId || !paymentId || !signature) {
    throw new Error("Incomplete Razorpay verification payload");
  }
  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new Error("Razorpay signature verification failed");
  }
  const storedOrder = paymentOrders.get(orderId);
  if (
    storedOrder?.appointmentId &&
    payload.appointmentId &&
    storedOrder.appointmentId !== payload.appointmentId
  ) {
    throw new Error("Payment does not match this appointment");
  }
  return storedOrder || { razorpayOrderId: orderId };
};

const handleHttpRequest = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, httpJsonHeaders);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "POST" && requestUrl.pathname === "/payments/razorpay/orders") {
    try {
      const body = await readJsonBody(req);
      const order = await createRazorpayOrder(body);
      sendHttpJson(res, 200, {
        razorpayOrderId: order.razorpayOrderId,
        orderId: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency,
        checkoutUrl: `${requestUrl.origin}/payments/razorpay/checkout?orderId=${encodeURIComponent(
          order.razorpayOrderId,
        )}`,
      });
    } catch (error) {
      sendHttpJson(res, 400, { error: error.message || "Unable to create order" });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/payments/razorpay/checkout") {
    const orderId = requestUrl.searchParams.get("orderId");
    const order = paymentOrders.get(orderId);
    if (!order) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("Payment order not found or expired.");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderRazorpayCheckout(order));
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/payments/razorpay/verify") {
    try {
      const body = await readJsonBody(req);
      const order = verifyRazorpayPayment(body);
      sendHttpJson(res, 200, {
        verified: true,
        appointmentId: order.appointmentId || body.appointmentId || null,
        razorpayOrderId: body.razorpayOrderId,
        razorpayPaymentId: body.razorpayPaymentId,
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
