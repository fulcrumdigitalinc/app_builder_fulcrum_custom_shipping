const fetch = require('node-fetch');
const utils = require('../utils.js');


exports.main = async function main(params) {
  try {
    const { COMMERCE_BASE_URL } = params;
    const { clientId: OAUTH_CLIENT_ID, clientSecret: OAUTH_CLIENT_SECRET, scopes: OAUTH_SCOPES }
      = utils.resolveOAuthParams(params);

    if (!COMMERCE_BASE_URL) {
      return { statusCode: 500, body: { message: 'Missing COMMERCE_BASE_URL' } };
    }
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      return { statusCode: 500, body: { message: 'Missing IMS client credentials' } };
    }

    const token = await utils.getAccessToken(OAUTH_CLIENT_ID,OAUTH_CLIENT_SECRET,OAUTH_SCOPES);
    
    const url = `${COMMERCE_BASE_URL.replace(/\/?$/, '/') }V1/store/storeConfigs`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`REST ${res.status}: ${JSON.stringify(data)}`);

    const arr = Array.isArray(data) ? data : (data?.items || []);
    const items = arr
      .map(s => {
        const id = Number(s?.id ?? s?.store_id ?? s?.storeId);
        if (!Number.isFinite(id)) return null;

        const n = x => {
          const v = Number(x);
          return Number.isFinite(v) ? v : undefined;
        };
        const str = x => (x === null || x === undefined) ? undefined : String(x);

        const obj = {
          id,
          code: str(s?.code) || String(id),
          website_id: n(s?.website_id ?? s?.websiteId),
          locale: str(s?.locale),
          base_currency_code: str(s?.base_currency_code),
          default_display_currency_code: str(s?.default_display_currency_code),
          timezone: str(s?.timezone),
          weight_unit: str(s?.weight_unit),
          base_url: str(s?.base_url),
          base_link_url: str(s?.base_link_url),
          base_static_url: str(s?.base_static_url),
          base_media_url: str(s?.base_media_url),
          secure_base_url: str(s?.secure_base_url),
          secure_base_link_url: str(s?.secure_base_link_url),
          secure_base_static_url: str(s?.secure_base_static_url),
          secure_base_media_url: str(s?.secure_base_media_url)
        };

        return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
      })
      .filter(Boolean)
      .sort((a, b) => b.id - a.id);

    return { statusCode: 200, body: { items } };
  } catch (e) {
    return { statusCode: 500, body: { message: e.message } };
  }
};
