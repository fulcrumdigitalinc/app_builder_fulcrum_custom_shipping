
const utils = require('../utils.js');

exports.main = async function main(params) {
  try {
    let commerce;
    try {
      commerce = await utils.initCommerceClient(params);
    } catch (error) {
      return { statusCode: 500, body: { message: error.message } };
    }

    const url = 'V1/customerGroups/search?searchCriteria[page_size]=1000';
    let data;
    try {
      data = await commerce(url, { method: 'GET' }).json();
    } catch (error) {
      const statusCode = error.response?.statusCode || 500;
      const raw =
        error.response?.body === undefined
          ? error.message
          : typeof error.response.body === 'string'
            ? error.response.body
            : JSON.stringify(error.response.body);
      return { statusCode, body: { message: `Failed to fetch customer groups: ${raw}` } };
    }

    const items = (data.items || []).map(g => ({ id: Number(g.id), code: g.code || `Group ${g.id}` }));
    return { statusCode: 200, body: { items } };
  } catch (e) {
    return { statusCode: 500, body: { message: e.message } };
  }
};
