
// const fetch = require('node-fetch'); // use global fetch
const utils = require('../utils.js');

exports.main = async function main(params) {
  try {
    const {
      COMMERCE_BASE_URL,
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET,
      OAUTH_SCOPES = 'commerce_api'
    } = params;

    if (!COMMERCE_BASE_URL) {
      return { statusCode: 500, body: { message: 'Missing COMMERCE_BASE_URL' } };
    }
    const token = await utils.getAccessToken(OAUTH_CLIENT_ID,OAUTH_CLIENT_SECRET,OAUTH_SCOPES);
    

    const url = `${COMMERCE_BASE_URL}V1/customerGroups/search?searchCriteria[page_size]=1000`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`REST ${res.status}: ${JSON.stringify(data)}`);

    const items = (data.items || []).map(g => ({ id: Number(g.id), code: g.code || `Group ${g.id}` }));
    return { statusCode: 200, body: { items } };
  } catch (e) {
    return { statusCode: 500, body: { message: e.message } };
  }
};
