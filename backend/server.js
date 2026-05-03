/**
 * Orayan AutoTrader — Bybit Proxy Backend
 * Node.js / Express
 *
 * Signs all Bybit API requests server-side (HMAC-SHA256).
 * API keys NEVER leave this server.
 *
 * Endpoints:
 *   POST   /bybit/order          — place limit/market order
 *   DELETE /bybit/order          — cancel order
 *   POST   /bybit/sl-tp          — set SL/TP on open position
 *   GET    /bybit/positions       — fetch open positions
 *   GET    /bybit/wallet          — fetch USDT wallet balance
 *   POST   /bybit/leverage        — set leverage for a symbol
 *   GET    /bybit/order-status    — check single order status
 *   GET    /health                — health check
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const crypto     = require('crypto');
const https      = require('https');

const app  = express();
app.use(express.json());
app.use(cors({ origin: '*' })); // tighten in production if needed

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY    = process.env.BYBIT_API_KEY    || '';
const API_SECRET = process.env.BYBIT_API_SECRET || '';
const TESTNET    = (process.env.BYBIT_TESTNET   || 'true') === 'true';
const PORT       = parseInt(process.env.PORT    || '3001', 10);

const BASE_URL   = TESTNET
  ? 'https://api-testnet.bybit.com'
  : 'https://api.bybit.com';

console.log(`[Orayan] Mode   : ${TESTNET ? '🟡 TESTNET' : '🔴 LIVE'}`);
console.log(`[Orayan] Base   : ${BASE_URL}`);
console.log(`[Orayan] Port   : ${PORT}`);
console.log(`[Orayan] Key    : ${API_KEY ? API_KEY.slice(0,6)+'...' : '⚠ NOT SET'}`);
console.log(`[Orayan] Secret : ${API_SECRET ? '✓ SET' : '⚠ NOT SET'}`);

// ─── Bybit Signing ───────────────────────────────────────────────────────────

/**
 * Build HMAC-SHA256 signature for Bybit V5 API.
 * For GET: sign timestamp + apiKey + recvWindow + queryString
 * For POST: sign timestamp + apiKey + recvWindow + JSON body string
 */
function sign(timestamp, recvWindow, payload) {
  const raw = `${timestamp}${API_KEY}${recvWindow}${payload}`;
  return crypto.createHmac('sha256', API_SECRET).update(raw).digest('hex');
}

/**
 * Make a signed request to Bybit V5.
 * @param {string} method  GET | POST | DELETE
 * @param {string} path    e.g. /v5/order/create
 * @param {object} params  query params (GET) or body params (POST)
 */
async function bybitRequest(method, path, params = {}) {
  const timestamp   = Date.now().toString();
  const recvWindow  = '5000';

  let url         = `${BASE_URL}${path}`;
  let bodyString  = '';
  let queryString = '';

  if (method === 'GET' || method === 'DELETE') {
    queryString = new URLSearchParams(params).toString();
    if (queryString) url += `?${queryString}`;
  } else {
    bodyString = JSON.stringify(params);
  }

  const sigPayload = (method === 'GET' || method === 'DELETE') ? queryString : bodyString;
  const signature  = sign(timestamp, recvWindow, sigPayload);

  const headers = {
    'X-BAPI-API-KEY':    API_KEY,
    'X-BAPI-TIMESTAMP':  timestamp,
    'X-BAPI-SIGN':       signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
    'Content-Type':      'application/json',
  };

  const options = {
    method,
    headers,
    body: method === 'POST' ? bodyString : undefined,
  };

  const res  = await fetch(url, options);
  const data = await res.json();

  if (data.retCode !== 0) {
    const err = new Error(`Bybit error ${data.retCode}: ${data.retMsg}`);
    err.bybitCode = data.retCode;
    err.bybitMsg  = data.retMsg;
    err.data      = data;
    throw err;
  }

  return data;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function requireKeys(res) {
  if (!API_KEY || !API_SECRET) {
    res.status(500).json({ ok: false, error: 'API keys not configured on server' });
    return false;
  }
  return true;
}

function badRequest(res, msg) {
  res.status(400).json({ ok: false, error: msg });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check — used by Orayan frontend to test connection
app.get('/health', (req, res) => {
  res.json({
    ok:      true,
    mode:    TESTNET ? 'testnet' : 'live',
    baseUrl: BASE_URL,
    keySet:  !!API_KEY && !!API_SECRET,
    ts:      Date.now(),
  });
});

// ── Place Order ──────────────────────────────────────────────────────────────
// Body: { symbol, side, qty, price, orderType, leverage, slPrice, tpPrice, reduceOnly }
app.post('/bybit/order', async (req, res) => {
  if (!requireKeys(res)) return;

  const {
    symbol,
    side,           // 'Buy' | 'Sell'
    qty,            // string, e.g. '0.001'
    price,          // string, limit price
    orderType,      // 'Limit' | 'Market'
    slPrice,        // optional
    tpPrice,        // optional
    reduceOnly,     // optional boolean
  } = req.body;

  if (!symbol)    return badRequest(res, 'symbol required');
  if (!side)      return badRequest(res, 'side required (Buy|Sell)');
  if (!qty)       return badRequest(res, 'qty required');
  if (!orderType) return badRequest(res, 'orderType required (Limit|Market)');
  if (orderType === 'Limit' && !price) return badRequest(res, 'price required for Limit orders');

  try {
    const params = {
      category:  'linear',
      symbol,
      side,
      orderType,
      qty:       String(qty),
      timeInForce: orderType === 'Limit' ? 'GTC' : 'IOC',
    };

    if (orderType === 'Limit') params.price = String(price);
    if (slPrice)               params.stopLoss  = String(slPrice);
    if (tpPrice)               params.takeProfit = String(tpPrice);
    if (reduceOnly)            params.reduceOnly = true;

    const data = await bybitRequest('POST', '/v5/order/create', params);

    res.json({
      ok:      true,
      orderId: data.result?.orderId,
      raw:     data.result,
    });
  } catch (err) {
    console.error('[/bybit/order]', err.message);
    res.status(502).json({ ok: false, error: err.message, bybitCode: err.bybitCode });
  }
});

// ── Cancel Order ─────────────────────────────────────────────────────────────
// Body: { symbol, orderId }
app.delete('/bybit/order', async (req, res) => {
  if (!requireKeys(res)) return;

  const { symbol, orderId } = req.body;
  if (!symbol)  return badRequest(res, 'symbol required');
  if (!orderId) return badRequest(res, 'orderId required');

  try {
    const data = await bybitRequest('POST', '/v5/order/cancel', {
      category: 'linear',
      symbol,
      orderId,
    });
    res.json({ ok: true, raw: data.result });
  } catch (err) {
    console.error('[/bybit/order DELETE]', err.message);
    res.status(502).json({ ok: false, error: err.message, bybitCode: err.bybitCode });
  }
});

// ── Set SL/TP on existing position ───────────────────────────────────────────
// Body: { symbol, slPrice, tpPrice, positionIdx }
app.post('/bybit/sl-tp', async (req, res) => {
  if (!requireKeys(res)) return;

  const { symbol, slPrice, tpPrice, positionIdx = 0 } = req.body;
  if (!symbol) return badRequest(res, 'symbol required');

  try {
    const params = {
      category:     'linear',
      symbol,
      positionIdx,  // 0 = one-way mode
    };
    if (slPrice) params.stopLoss   = String(slPrice);
    if (tpPrice) params.takeProfit = String(tpPrice);

    const data = await bybitRequest('POST', '/v5/position/trading-stop', params);
    res.json({ ok: true, raw: data.result });
  } catch (err) {
    console.error('[/bybit/sl-tp]', err.message);
    res.status(502).json({ ok: false, error: err.message, bybitCode: err.bybitCode });
  }
});

// ── Set Leverage ─────────────────────────────────────────────────────────────
// Body: { symbol, leverage }
app.post('/bybit/leverage', async (req, res) => {
  if (!requireKeys(res)) return;

  const { symbol, leverage } = req.body;
  if (!symbol)   return badRequest(res, 'symbol required');
  if (!leverage) return badRequest(res, 'leverage required');

  try {
    const data = await bybitRequest('POST', '/v5/position/set-leverage', {
      category:     'linear',
      symbol,
      buyLeverage:  String(leverage),
      sellLeverage: String(leverage),
    });
    res.json({ ok: true, raw: data.result });
  } catch (err) {
    // Code 110043 = leverage not modified (already set) — treat as success
    if (err.bybitCode === 110043) return res.json({ ok: true, note: 'leverage unchanged' });
    console.error('[/bybit/leverage]', err.message);
    res.status(502).json({ ok: false, error: err.message, bybitCode: err.bybitCode });
  }
});

// ── Open Positions ────────────────────────────────────────────────────────────
// Query: ?symbol=BTCUSDT (optional — omit for all)
app.get('/bybit/positions', async (req, res) => {
  if (!requireKeys(res)) return;

  try {
    const params = { category: 'linear', settleCoin: 'USDT', limit: 50 };
    if (req.query.symbol) params.symbol = req.query.symbol;

    const data = await bybitRequest('GET', '/v5/position/list', params);
    const positions = (data.result?.list || []).filter(p => parseFloat(p.size) > 0);

    res.json({ ok: true, positions });
  } catch (err) {
    console.error('[/bybit/positions]', err.message);
    res.status(502).json({ ok: false, error: err.message, bybitCode: err.bybitCode });
  }
});

// ── Wallet Balance ────────────────────────────────────────────────────────────
app.get('/bybit/wallet', async (req, res) => {
  if (!requireKeys(res)) return;

  try {
    const data = await bybitRequest('GET', '/v5/account/wallet-balance', {
      accountType: 'UNIFIED',
    });

    const account = data.result?.list?.[0];
    const usdtCoin = account?.coin?.find(c => c.coin === 'USDT');

    res.json({
      ok:            true,
      totalEquity:   parseFloat(account?.totalEquity   || 0),
      availableBalance: parseFloat(usdtCoin?.availableToWithdraw || usdtCoin?.walletBalance || 0),
      raw:           account,
    });
  } catch (err) {
    console.error('[/bybit/wallet]', err.message);
    res.status(502).json({ ok: false, error: err.message, bybitCode: err.bybitCode });
  }
});

// ── Order Status ──────────────────────────────────────────────────────────────
// Query: ?symbol=BTCUSDT&orderId=xxx
app.get('/bybit/order-status', async (req, res) => {
  if (!requireKeys(res)) return;

  const { symbol, orderId } = req.query;
  if (!symbol)  return badRequest(res, 'symbol required');
  if (!orderId) return badRequest(res, 'orderId required');

  try {
    const data = await bybitRequest('GET', '/v5/order/realtime', {
      category: 'linear',
      symbol,
      orderId,
    });
    const order = data.result?.list?.[0] || null;
    res.json({ ok: true, order });
  } catch (err) {
    console.error('[/bybit/order-status]', err.message);
    res.status(502).json({ ok: false, error: err.message, bybitCode: err.bybitCode });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Orayan] Proxy running on port ${PORT}`);
});
