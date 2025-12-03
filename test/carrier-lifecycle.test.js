jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

jest.mock('@adobe/aio-lib-files', () => {
  const storage = new Map();
  const api = {
    read: jest.fn(async (key) => {
      if (!storage.has(key)) throw new Error('ENOENT');
      return storage.get(key);
    }),
    write: jest.fn(async (key, value) => {
      storage.set(key, Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
    }),
    delete: jest.fn(async (key) => {
      if (!storage.has(key)) throw new Error('ENOENT');
      storage.delete(key);
    }),
    __reset: () => {
      storage.clear();
      api.read.mockClear();
      api.write.mockClear();
      api.delete.mockClear();
    },
  };
  return { init: jest.fn(async () => api), __storage: storage, __api: api };
});

jest.mock('../lib/adobe-commerce', () => {
  const carriers = new Map();
  const commerce = {
    get: jest.fn(async (path) => {
      const match = path.match(/^oope_shipping_carrier\/(.+)$/);
      if (match) {
        const code = decodeURIComponent(match[1]);
        if (!carriers.has(code)) return { success: false, statusCode: 404, message: 'Not found' };
        return { success: true, statusCode: 200, message: carriers.get(code) };
      }
      return { success: false, statusCode: 400, message: 'Unsupported path' };
    }),
    post: jest.fn(async (path, body) => {
      const payload = (body && body.carrier) || {};
      if (path === 'oope_shipping_carrier') {
        carriers.set(payload.code, { ...payload });
        return { success: true, statusCode: 200, message: payload };
      }
      const match = path.match(/^oope_shipping_carrier\/(.+)$/);
      if (match) {
        const code = decodeURIComponent(match[1]);
        carriers.set(code, { ...payload, code });
        return { success: true, statusCode: 200, message: carriers.get(code) };
      }
      return { success: false, statusCode: 400, message: 'Unsupported path' };
    }),
    delete: jest.fn(async (path) => {
      const match = path.match(/^oope_shipping_carrier\/(.+)$/);
      if (match) {
        const code = decodeURIComponent(match[1]);
        const existed = carriers.delete(code);
        return { success: existed, statusCode: existed ? 200 : 404, message: existed ? `Deleted ${code}` : 'Not found' };
      }
      return { success: false, statusCode: 400, message: 'Unsupported path' };
    }),
    getOopeShippingCarriers: jest.fn(async () => ({
      success: true,
      statusCode: 200,
      message: Array.from(carriers.values()),
    })),
    __reset: () => {
      carriers.clear();
      commerce.get.mockClear();
      commerce.post.mockClear();
      commerce.delete.mockClear();
      commerce.getOopeShippingCarriers.mockClear();
    },
  };
  return { getAdobeCommerceClient: jest.fn(async () => commerce), __mockClient: commerce, __carriers: carriers };
});

const Files = require('@adobe/aio-lib-files');
const commerceMock = require('../lib/adobe-commerce');

const addCarrier = require('../src/commerce-backend-ui-1/actions/add-carrier/index.js');
const getCarriers = require('../src/commerce-backend-ui-1/actions/get-carriers/index.js');
const deleteCarrier = require('../src/commerce-backend-ui-1/actions/delete-carrier/index.js');

describe('carrier lifecycle via actions', () => {
  const baseParams = { COMMERCE_BASE_URL: 'https://mock.commerce' };
  const carrierPayload = {
    code: 'TEST-CARRIER',
    title: 'Test Carrier',
    stores: ['default'],
    countries: ['US', 'CA'],
    sort_order: 15,
    active: true,
    tracking_available: true,
    shipping_labels_available: false,
    variables: {
      method_name: 'Flat Rate',
      value: 9.99,
      minimum: 0,
      maximum: 200,
      customer_groups: [1, 2],
      price_per_item: true,
      stores: ['default'],
    },
  };

  beforeEach(() => {
    commerceMock.__mockClient.__reset();
    Files.__api.__reset();
  });

  test('creates, fetches, deletes, and confirms removal of a carrier', async () => {
    const addRes = await addCarrier.main({ ...baseParams, carrier: carrierPayload });
    expect(addRes.statusCode).toBe(200);
    expect(addRes.body).toMatchObject({
      ok: true,
      method: 'POST',
      carrier: expect.objectContaining({ code: carrierPayload.code, title: carrierPayload.title }),
    });
    expect(Files.__storage.has(`carrier_custom_${carrierPayload.code}.json`)).toBe(true);

    const getRes = await getCarriers.main(baseParams);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.ok).toBe(true);
    expect(getRes.body.carriers).toHaveLength(1);
    expect(getRes.body.carriers[0]).toMatchObject({
      code: carrierPayload.code,
      title: carrierPayload.title,
      method_name: carrierPayload.variables.method_name,
      value: carrierPayload.variables.value,
      minimum: carrierPayload.variables.minimum,
      maximum: carrierPayload.variables.maximum,
      price_per_item: carrierPayload.variables.price_per_item,
    });
    expect(getRes.body.carriers[0].stores).toEqual(carrierPayload.stores);
    expect(getRes.body.carriers[0].customer_groups).toEqual(carrierPayload.variables.customer_groups);

    const delRes = await deleteCarrier.main({ ...baseParams, code: carrierPayload.code });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.body.ok).toBe(true);
    expect(delRes.body.deletedInCommerce).toBe(true);
    expect(delRes.body.stateDeleted).toBe(true);
    expect(Files.__storage.has(`carrier_custom_${carrierPayload.code}.json`)).toBe(false);

    const listAfter = await getCarriers.main(baseParams);
    expect(listAfter.statusCode).toBe(200);
    expect(listAfter.body.ok).toBe(true);
    expect(listAfter.body.carriers).toEqual([]);
  });
});
