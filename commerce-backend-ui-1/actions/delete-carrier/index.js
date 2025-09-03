const { Core } = require('@adobe/aio-sdk');
const fetch = require('node-fetch');
const utils = require('../utils.js');

// Use the unified repository
const { deleteCarrier } = require('/home/fcs/shared/libFileRepository.js');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.main = async function (params) {
  if ((params.__ow_method || '').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const logger = Core.Logger('delete-carrier', { level: params.LOG_LEVEL || 'info' });

  try {
    // ---- parse carrier code ----
    let code = params.code;
    if (!code && typeof params.__ow_body === 'string') {
      try { code = JSON.parse(params.__ow_body)?.code; } catch {}
    }
    if (!code && params.__ow_query) {
      const q = new URLSearchParams(params.__ow_query);
      code = q.get('code');
    }
    if (!code) {
      return { statusCode: 400, headers: cors, body: { ok: false, message: 'Missing code' } };
    }

    // ---- delete from Commerce API ----
    const clientId = process.env.OAUTH_CLIENT_ID || params.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET || params.OAUTH_CLIENT_SECRET;
    const scope = process.env.OAUTH_SCOPES || params.OAUTH_SCOPES;
    let baseUrl = process.env.COMMERCE_BASE_URL || params.COMMERCE_BASE_URL;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    const token = await utils.getAccessToken(clientId, clientSecret, scope);
    const delUrl = `${baseUrl}/V1/oope_shipping_carrier/${encodeURIComponent(code)}`;
    const delRes = await fetch(delUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const delRaw = await delRes.text();
    let delJson = null; try { delJson = JSON.parse(delRaw); } catch {}
    const deletedInCommerce = delRes.ok && delJson && delJson.success === true;

    // ---- delete from repository ----
    // Note: carriers in the repo are identified by id, not just code.
    // Here we attempt to delete by treating "code" as id for simplicity.
    // If your repo carriers have separate id vs code, adjust accordingly.
    let repoDeleted = false;
    try {
      repoDeleted = await deleteCarrier('default', code);
    } catch (e) {
      logger.warn(`Repo delete failed for ${code}: ${e.message}`);
    }

    return {
      statusCode: 200,
      headers: cors,
      body: { ok: true, code, deletedInCommerce, repoDeleted, delRaw }
    };

  } catch (e) {
    return { statusCode: 500, headers: cors, body: { ok: false, error: e.message } };
  }
};
