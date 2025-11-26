/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const mockFiles = {
  read: jest.fn().mockResolvedValue(Buffer.from(JSON.stringify({ stores: ['*'] }))),
  write: jest.fn().mockResolvedValue(),
};

const mockWebhookVerify = jest.fn();
const mockGetAdobeCommerceClient = jest.fn();

jest.mock('@adobe/aio-lib-files', () => ({
  init: jest.fn().mockResolvedValue(mockFiles),
}));

jest.mock('../lib/adobe-commerce', () => ({
  webhookVerify: (...args) => mockWebhookVerify(...args),
  getAdobeCommerceClient: (...args) => mockGetAdobeCommerceClient(...args),
}));

const { main } = require('../actions/shipping-methods/index.js');

describe('shipping-methods action', () => {
  beforeEach(() => {
    mockFiles.read.mockClear();
    mockFiles.write.mockClear();
    mockWebhookVerify.mockReset();
    mockGetAdobeCommerceClient.mockReset();
  });

  test('returns error op when webhook verify fails', async () => {
    mockWebhookVerify.mockReturnValue({ success: false, error: 'bad-signature' });
    const res = await main({});
    expect(res.statusCode).toBe(200);
    const ops = JSON.parse(res.body);
    expect(ops).toHaveLength(1);
    expect(ops[0].value.method_title).toContain('Webhook verify');
  });

  test('adds carrier when webhook passes and carriers exist', async () => {
    mockWebhookVerify.mockReturnValue({ success: true });
    mockGetAdobeCommerceClient.mockResolvedValue({
      getOopeShippingCarriers: jest.fn().mockResolvedValue({
        success: true,
        message: [{ code: 'FUL', title: 'Fulcrum Carrier', active: true }],
      }),
    });

    const payload = Buffer.from(JSON.stringify({}), 'utf8').toString('base64');
    const res = await main({ __ow_body: payload, COMMERCE_BASE_URL: 'https://example/' });
    expect(res.statusCode).toBe(200);

    const ops = JSON.parse(res.body);
    const addOps = ops.filter((op) => op.op === 'add');
    expect(addOps.length).toBeGreaterThan(0);
    expect(addOps[0].value.carrier_code).toBe('FUL');
  });
});
