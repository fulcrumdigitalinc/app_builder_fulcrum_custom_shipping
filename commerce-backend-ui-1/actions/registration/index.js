/**
 * Extension Registration Component
 *
 * @returns {Promise<{statusCode: number, body: object}>} The HTTP response with status code and body
 */
async function main() {
  const extensionId = 'fulcrum_custom_shipping';

  return {
    statusCode: 200,
    body: {
      registration: {
        menuItems: [
          {
            id: `${extensionId}`,
            title: 'Fulcrum Custom Shipping',
            parent: `${extensionId}::apps`,
            sortOrder: 1,
          },
          {
            id: `${extensionId}::apps`,
            title: 'Apps',
            isSection: true,
            sortOrder: 100,
          },
        ],
        page: {
          title: 'Fulcrum Custom Shipping',
        },
      },
    },
  };
}

exports.main = main;
