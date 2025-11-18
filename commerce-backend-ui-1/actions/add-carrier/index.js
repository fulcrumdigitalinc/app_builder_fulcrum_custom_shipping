/*
Copyright 2025
Licensed under the Apache License, Version 2.0
*/

const { Core } = require('@adobe/aio-sdk');
const fetch = require('node-fetch');
const FilesLib = require('@adobe/aio-lib-files');
const utils = require('../utils.js');

function normalizeBaseUrl(u = '') { return u && !u.endsWith('/') ? (u + '/') : u; }

async function initFiles() {
  if (FilesLib?.init) return FilesLib.init();
  throw new Error('Unable to initialize aio-lib-files');
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function toBool(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true','1','yes','on','si','sí'].includes(s)) return true;
    if (['false','0','no','off'].includes(s)) return false;
  }
  return !!v;
}
const toNumOrNull  = (v) => (v === '' || v === null || v === undefined) ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const toStrOrNull  = (v) => (v === '' || v === null || v === undefined) ? null : String(v);
const toStrArray   = (arr) => Array.from(new Set((arr || []).map(String))).filter(Boolean);
const toIntArray   = (arr) => (Array.isArray(arr) ? arr.map(n => Number(n)).filter(Number.isInteger) : []);

// Custom fields persisted in Files
const CUSTOM_SCHEMA = {
  method_name: 'string',
  value: 'number',
  minimum: 'number',
  maximum: 'number',
  customer_groups: 'intArray',
  price_per_item: 'boolean',
  stores: 'strArray'
};

function clearValueFor(type) { return (type === 'intArray' || type === 'strArray') ? [] : null; }

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

// Build Commerce-native payload from UI input
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

// Read by code
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

// Create
async function createCarrier(base, token, nativePayload) {
  const resp = await fetch(`${base}V1/oope_shipping_carrier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ carrier: nativePayload }),
  });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text, method: 'POST' };
}

// Update (best effort PUT; some installs ignore it)
async function putCarrier(base, token, nativePayload) {
  const resp = await fetch(`${base}V1/oope_shipping_carrier/${encodeURIComponent(nativePayload.code)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ carrier: nativePayload }),
  });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text, method: 'PUT' };
}

// Hard replace: DELETE then POST (guaranteed update)
async function replaceCarrier(base, token, code, nativePayload) {
  // DELETE (ignore failure)
  try {
    await fetch(`${base}V1/oope_shipping_carrier/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch { /* ignore */ }
  // POST
  return createCarrier(base, token, nativePayload);
}

// Upsert strategy:
//   - If not exists -> POST
//   - If exists -> HARD REPLACE (DELETE + POST)
//   - If POST fails on replace, fall back to PUT and surface its result
async function upsertCarrier(base, token, nativePayload) {
  const exists = await getCarrierByCode(base, token, nativePayload.code);

  if (exists.exists === false) {
    return createCarrier(base, token, nativePayload);
  }
  if (exists.exists === true) {
    // Force replace to avoid "200 but no change" behavior
    const rep = await replaceCarrier(base, token, nativePayload.code, nativePayload);
    if (rep.ok) return { ...rep, method: 'REPLACED' };

    // Fallback: try PUT if replace failed
    const put = await putCarrier(base, token, nativePayload);
    return put.ok ? put : rep;
  }

  // GET failed, unknown state
  return {
    ok: false,
    status: exists.status || 500,
    method: 'GET',
    text: exists.body || 'Unable to determine existence (GET failed)'
  };
}

exports.main = async function main(params) {
  const logger = Core.Logger('add-carrier', { level: params.LOG_LEVEL || 'info' });

  try {
    // CORS preflight
    if ((params.__ow_method || '').toUpperCase() === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: {} };
    }

    const { COMMERCE_BASE_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES = 'commerce_api' } = params;
    if (!COMMERCE_BASE_URL) {
      return { statusCode: 500, headers: cors, body: { ok: false, message: 'Missing COMMERCE_BASE_URL' } };
    }
    const base = normalizeBaseUrl(COMMERCE_BASE_URL);

    // Parse incoming payload
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

    // REST requires title
    const hasTitle = carrier.title !== undefined && String(carrier.title).trim() !== '';
    if (!hasTitle) {
      return { statusCode: 400, headers: cors, body: { ok: false, message: 'Title is required by the REST API (POST/PUT)' } };
    }

    // OAuth
    const token = await utils.getAccessToken(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES);

    // Build payload and upsert
    const nativePayload = buildNativePayload(carrier);
    const up = await upsertCarrier(base, token, nativePayload);

    // Always return HTTP 200; use ok flag for logical status
    if (!up.ok) {
      let magentoMsg = '';
      try {
        const parsed = JSON.parse(up.text || '{}');
        magentoMsg = parsed?.message || parsed?.parameters || '';
      } catch {
        magentoMsg = up.text || '';
      }
      return {
        statusCode: 200,
        headers: cors,
        body: {
          ok: false,
          message: magentoMsg || 'Commerce API error',
          status: up.status,
          method: up.method,
          requestCarrier: nativePayload,
          data: up.text
        }
      };
    }

    // Merge custom fields into Files
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

    const files = await initFiles();
    const fileKey = `carrier_custom_${nativePayload.code}.json`;

    let current = {};
    try {
      const buf = await files.read(fileKey);
      if (buf) {
        const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
        if (text) current = JSON.parse(text);
      }
    } catch {}

    const merged = { ...current, ...incomingCustom };

    try {
      await files.write(fileKey, Buffer.from(JSON.stringify(merged)), { contentType: 'application/json' });
    } catch {}

    let persisted = {};
    try {
      const buf2 = await files.read(fileKey);
      if (buf2) {
        const text2 = Buffer.isBuffer(buf2) ? buf2.toString('utf8') : String(buf2);
        if (text2) persisted = JSON.parse(text2);
      }
    } catch {}

    return {
      statusCode: 200,
      headers: cors,
      body: {
        ok: true,
        method: up.method,
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
