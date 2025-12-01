
const { getAdobeCommerceClient } = require('../../../../lib/adobe-commerce');

exports.main = async function main(params) {
  try {
    const {
      COMMERCE_BASE_URL,
    } = params;

    if (!COMMERCE_BASE_URL) {
      return { statusCode: 500, body: { message: 'Missing COMMERCE_BASE_URL' } };
    }

    const commerce = await getAdobeCommerceClient(params);
    const response = await commerce.get('customerGroups/search?searchCriteria[page_size]=1000');
    if (!response.success) {
      return {
        statusCode: response.statusCode || 500,
        body: { message: response.message || 'Failed to load customer groups' },
      };
    }

    const items = (response.message?.items || []).map(g => ({ id: Number(g.id), code: g.code || `Group ${g.id}` }));
    return { statusCode: 200, body: { items } };
  } catch (e) {
    return { statusCode: 500, body: { message: e.message } };
  }
};
