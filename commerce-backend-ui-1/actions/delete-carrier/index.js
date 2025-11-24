const { Core } = require('@adobe/aio-sdk');
// const fetch = require('node-fetch'); // use global fetch
const FilesLib = require('@adobe/aio-lib-files');
const utils = require('../utils.js');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

async function initFiles() {
  if (FilesLib?.init) return FilesLib.init();
  throw new Error('Unable to initialize aio-lib-files');
}

exports.main = async function (params) {
  if (params.__ow_method === 'options') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const logger = Core.Logger('delete-carrier', { level: params.LOG_LEVEL || 'info' });

  try {
    let code = params.code;
    if (!code && typeof params.__ow_body === 'string') {
      try { code = JSON.parse(params.__ow_body)?.code; } catch {}
    }
    if (!code && params.__ow_query) {
      const q = new URLSearchParams(params.__ow_query);
      code = q.get('code');
    }
    if (!code) return { statusCode: 400, headers: cors, body: { ok: false, message: 'Missing code' } };

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

    let stateDeleted = false;
    try {
      const files = await initFiles();
      const keyJson = `carrier_custom_${code}.json`;
      const keyLegacy = `carrier_custom_${code}`; 

      let deletedAny = false;
      try {
        await files.delete(keyJson);
        deletedAny = true;
      } catch (e1) {
        // ignore
      }
      try {
        await files.delete(keyLegacy);
        deletedAny = true;
      } catch (e2) {
        // ignore
      }
      stateDeleted = deletedAny;
    } catch (e) {
      logger.warn(`Files delete failed for ${code}: ${e.message}`);
    }

    return {
      statusCode: 200,
      headers: cors,
      body: { ok: true, code, deletedInCommerce, stateDeleted, delRaw }
    };

  } catch (e) {
    return { statusCode: 500, headers: cors, body: { ok: false, error: e.message } };
  }
};
