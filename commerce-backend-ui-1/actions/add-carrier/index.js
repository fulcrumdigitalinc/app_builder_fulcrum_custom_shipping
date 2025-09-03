const { Core } = require('@adobe/aio-sdk');
const fetch = require('node-fetch');
const utils = require('../utils.js');

// Use the unified repository (low-level Files + carriers repo)
const {
  upsertCarrier, // persist carriers under fulcrum/carriers/<store>.json
} = require('../../../shared/libFileRepository.js');

function normalizeBaseUrl(u = '') {
  return u && !u.endsWith('/') ? (u + '/') : u;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// ---------- Normalizers ----------
function toBool(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true','1','yes','on'].includes(s)) return true;
    if (['false','0','no','off'].includes(s)) return false;
  }
  return !!v;
}
const toNumOrNull  = (v) => (v === '' || v === null || v === undefined) ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const toStrOrNull  = (v) => (v === '' || v === null || v === undefined) ? null : String(v);
const toStrArray   = (arr) => Array.from(new Set((arr || []).map(String))).filter(Boolean);
const toIntArray   = (arr) => (Array.isArray(arr) ? arr.map(n => Number(n)).filter(Number.isInteger) : []);

// ---------- Custom variables schema ----------
const CUSTOM_SCHEMA = {
  method_name: 'string',      // -> null
  price: 'number',            // -> null
  minimum: 'number',          // -> null
  maximum: 'number',          // -> null
  customer_groups: 'intArray',// -> []
  price_per_item: 'boolean',  // -> null
  stores: 'strArray'          // -> []
};

function clearValueFor(type) {
  return (type === 'intArray' || type === 'strArray') ? [] : null;
}

function normalizeCustomValue(type, value) {
  switch (type) {
    case 'string': return toStrOrNull(value);
    case 'number': return toNumOrNull(value);
    case 'boolean': return toBool(value);
    case 'intArray': return toIntArray(value);
    case 'strArray': return toStrArray(value);
    default: return value ?? null;
  }
}

// ---------- Build Commerce OOPE payload ----------
function buildNativePayload(input) {
  const out = { code: String(input.code).trim() };

  if (input.title !== undefined) out.title = String(input.title);

  if (input.stores !== undefined) out.stores = toStrArray(input.stores);
  if (input.countries !== undefined) out.countries = toStrArray(input.countries);

  const so = toNumOrNull(input.sort_order);
  if (so !== null) out.sort_order = so;

  if (input.active !== undefined) out.active = !!input.active;
  if (input.tracking_available !== undefined) out.tracking_available = !!input.tracking_available;
  if (input.shipping_labels_available !== undefined) out.shipping_labels_available = !!input.shipping_labels_available;

  return out;
}

// ---------- Commerce helpers ----------
async function getCarrierByCode(base, token, code) {
  const res = await fetch(`${base}V1/oope_shipping_carrier/${encodeURIComponent(code)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 404) return { exists: false };
  const text = await res.text();
  if (!res.ok) return { exists: undefined, status: res.status, body: text };
  return { exists: true, body: text };
}

async function upsertCarrierCommerce(base, token, nativePayload) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const method = (await getCarrierByCode(base, token, nativePayload.code)).exists ? 'PUT' : 'POST';
  const url = `${base}V1/oope_shipping_carrier`;

  const resp = await fetch(url, { method, headers, body: JSON.stringify({ carrier: nativePayload }) });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text, method };
}

// ---------- Action ----------
exports.main = async function main(params) {
  const logger = Core.Logger('add-carrier', { level: params.LOG_LEVEL || 'info' });

  try {
    // Handle CORS preflight
    if ((params.__ow_method || '').toUpperCase() === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: {} };
    }

    // Ensure Commerce config
    const { COMMERCE_BASE_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES = 'commerce_api' } = params;
    if (!COMMERCE_BASE_URL) {
      return { statusCode: 500, headers: cors, body: { ok: false, message: 'Missing COMMERCE_BASE_URL' } };
    }
    const base = normalizeBaseUrl(COMMERCE_BASE_URL);

    // Parse carrier payload
    let carrier = params.carrier;
    if (carrier && typeof carrier === 'string') { try { carrier = JSON.parse(carrier); } catch {} }
    if (!carrier) {
      try {
        const raw = params.__ow_body ? Buffer.from(params.__ow_body, 'base64').toString('utf8') : '{}';
        const parsed = JSON.parse(raw || '{}');
        carrier = parsed.carrier || parsed;
        if (carrier && typeof carrier === 'string') { try { carrier = JSON.parse(carrier); } catch {} }
      } catch {}
    }
    if (!carrier || !carrier.code) {
      return { statusCode: 400, headers: cors, body: { ok: false, message: 'Missing carrier payload' } };
    }

    // Validate title (Commerce API requires it)
    const hasTitle = carrier.title !== undefined && String(carrier.title).trim() !== '';
    if (!hasTitle) {
      return { statusCode: 400, headers: cors, body: { ok: false, message: 'Title is required by the REST API (POST/PUT)' } };
    }

    // Get OAuth access token
    const token = await utils.getAccessToken(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES);

    // Build native Commerce payload and upsert carrier via Commerce API
    const nativePayload = buildNativePayload(carrier);
    const up = await upsertCarrierCommerce(base, token, nativePayload);

    if (!up.ok) {
      return {
        statusCode: up.status || 500,
        headers: cors,
        body: {
          ok: false,
          message: 'Commerce API error',
          status: up.status,
          method: up.method,
          requestCarrier: nativePayload,
          data: up.text
        }
      };
    }

    // Build custom variables payload (normalized)
    const vars = (carrier && typeof carrier.variables === 'object' && carrier.variables) || {};
    const hasVariablesObject = Object.prototype.hasOwnProperty.call(carrier, 'variables');

    const incomingCustom = {};
    for (const [key, type] of Object.entries(CUSTOM_SCHEMA)) {
      const inRoot = Object.prototype.hasOwnProperty.call(carrier, key);
      const inVars = Object.prototype.hasOwnProperty.call(vars, key);

      if (inRoot) incomingCustom[key] = normalizeCustomValue(type, carrier[key]);
      else if (inVars) incomingCustom[key] = normalizeCustomValue(type, vars[key]);
      else if (hasVariablesObject) incomingCustom[key] = clearValueFor(type);
    }

    // Persist custom variables into our carriers repository
    const persisted = await upsertCarrier(carrier.stores || 'default', {
      ...carrier,
      ...incomingCustom,
      code: nativePayload.code,
      title: nativePayload.title,
    });

    return {
      statusCode: 200,
      headers: cors,
      body: {
        ok: true,
        carrier: nativePayload,
        commerce: up.text,
        receivedCustom: incomingCustom,
        savedCustom: persisted
      }
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: { ok: false, message: e.message } };
  }
};
