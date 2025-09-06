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
    if (['true','1','yes','on'].includes(s)) return true;
    if (['false','0','no','off'].includes(s)) return false;
  }
  return !!v;
}
const toNumOrNull  = (v) => (v === '' || v === null || v === undefined) ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const toStrOrNull  = (v) => (v === '' || v === null || v === undefined) ? null : String(v);
const toStrArray   = (arr) => Array.from(new Set((arr || []).map(String))).filter(Boolean);
const toIntArray   = (arr) => (Array.isArray(arr) ? arr.map(n => Number(n)).filter(Number.isInteger) : []);

const CUSTOM_SCHEMA = {
  method_name: 'string',      // -> null
  value: 'number',            // -> null
  minimum: 'number',          // -> null
  maximum: 'number',          // -> null
  customer_groups: 'intArray',// -> []
  price_per_item: 'boolean',  // -> null
  stores: 'strArray'          // -> []
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

function buildNativePayload(input) {
  const out = { code: String(input.code).trim() };

  if (input.title !== undefined) {
    out.title = String(input.title);
  }

  if (input.stores !== undefined) out.stores = toStrArray(input.stores);
  if (input.countries !== undefined) out.countries = toStrArray(input.countries);

  const so = toNumOrNull(input.sort_order);
  if (so !== null) out.sort_order = so;

  if (input.active !== undefined) out.active = !!input.active;
  if (input.tracking_available !== undefined) out.tracking_available = !!input.tracking_available;
  if (input.shipping_labels_available !== undefined) out.shipping_labels_available = !!input.shipping_labels_available;

  return out;
}

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

async function upsertCarrier(base, token, nativePayload) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const method = (await getCarrierByCode(base, token, nativePayload.code)).exists ? 'PUT' : 'POST';
  const url = `${base}V1/oope_shipping_carrier`;

  const resp = await fetch(url, { method, headers, body: JSON.stringify({ carrier: nativePayload }) });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, text, method };
}

exports.main = async function main(params) {
  const logger = Core.Logger('add-carrier', { level: params.LOG_LEVEL || 'info' });

  try {
    if ((params.__ow_method || '').toUpperCase() === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: {} };
    }

    const { COMMERCE_BASE_URL, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_SCOPES = 'commerce_api' } = params;
    if (!COMMERCE_BASE_URL) {
      return { statusCode: 500, headers: cors, body: { ok: false, message: 'Missing COMMERCE_BASE_URL' } };
    }
    const base = normalizeBaseUrl(COMMERCE_BASE_URL);

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

    const hasTitle = carrier.title !== undefined && String(carrier.title).trim() !== '';
    if (!hasTitle) {
      return { statusCode: 400, headers: cors, body: { ok: false, message: 'Title is required by the REST API (POST/PUT)' } };
    }

    const token = await utils.getAccessToken(OAUTH_CLIENT_ID,OAUTH_CLIENT_SECRET,OAUTH_SCOPES);

    const nativePayload = buildNativePayload(carrier);
    const up = await upsertCarrier(base, token, nativePayload);

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
    } catch (e) {
      // read error
    }

    const merged = { ...current, ...incomingCustom };

    try {
      await files.write(
        fileKey,
        Buffer.from(JSON.stringify(merged)),
        { contentType: 'application/json' }
      );
    } catch (e) {
      // write error
    }

    let persisted = {};
    try {
      const buf2 = await files.read(fileKey);
      if (buf2) {
        const text2 = Buffer.isBuffer(buf2) ? buf2.toString('utf8') : String(buf2);
        if (text2) persisted = JSON.parse(text2);
      }
    } catch (e) {
      // ignore
    }

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
