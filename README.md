# Fulcrum Custom Shipping (OOPE)

Fulcrum Custom Shipping (`fulcrum_custom_shipping`) delivers an out-of-process shipping carrier for Adobe Commerce that works in both SaaS and PaaS. It uses App Builder runtime actions, Commerce Webhooks, and the Admin UI SDK to manage carrier configuration without installing backend code for SaaS tenants, while remaining compatible with PaaS via Commerce integrations.

User Guide (PDF download):  
[Download User Guide](https://docs.google.com/document/d/1rrvvXR9E-XeHFnKwxMwG-y_zwaCshOMrmH4D9_HcqRg/export?format=pdf)  

Detailed Description Guide (PDF download):  
[Download Detailed Description Guide](https://docs.google.com/document/d/1auF_ueMR5jAqGKTSOknEOorKmBvLELc3Pk2f__5a_XU/export?format=pdf)  

Extensibility framework overview:  
https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/

## Storefront

Compatible with Adobe Commerce Storefront

https://experienceleague.adobe.com/developer/commerce/storefront/

https://github.com/hlxsites/aem-boilerplate-commerce

## Table of Contents

- [Prerequisites](#prerequisites)
- [Install the required modules to configure the shipping extensions (PaaS Only)](#install-the-required-modules-to-configure-the-shipping-extensions-paas-only)
- [Create an App Builder Project](#create-an-app-builder-project)
- [Initialize the Project](#initialize-the-project)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Carrier Grid Configuration](#carrier-grid-configuration)
- [Configuration](#configuration)
- [Webhooks](#webhooks)
- [Deploy](#deploy)
- [Actions](#actions)
- [Errors](#errors)
- [Changelog](#changelog)
- [Support](#support)

---

## Prerequisites

- Adobe Commerce SaaS or Adobe Commerce PaaS (2.4.5+)
- Node.js v22+
- Adobe I/O CLI  
  ```bash
  npm install -g @adobe/aio-cli
  ```
- Access to Adobe Developer Console with App Builder enabled

### SaaS Installation Steps
- Create the App Builder project (below) and configure IMS OAuth Server-to-Server.
- Populate SaaS environment variables in `.env` (see [Environment Variables](#environment-variables)).
- Deploy the app; no Commerce module installation is required.

### PaaS Installation Steps
- Install the Commerce modules listed below.
- Configure Commerce Integration credentials or IMS OAuth credentials.
- If using IMS on PaaS, enable the IMS module as described in https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/connect/#adobe-identity-management-service-ims.
- Populate PaaS environment variables in `.env`.
- Configure Commerce Webhooks in your instance and deploy the app.

---

## Install the required modules to configure the shipping extensions (PaaS Only)

```bash
composer require magento/module-out-of-process-shipping-methods --with-dependencies
composer update magento/commerce-eventing --with-dependencies
composer require "magento/commerce-backend-sdk": ">=3.0"
```

Webhook module installation (PaaS):  
https://developer.adobe.com/commerce/extensibility/webhooks/installation/

---
## Create an App Builder Project

Create an App Builder project in Developer Console

- Log in to the Adobe Developer Console and select the desired organization from the dropdown menu in the top-right corner.
- Click **Create new project from template**.
- Select **App Builder**. The **Set up templated project** page displays.
- Specify a project title and app name. Mark the checkbox **Include Runtime with each workspace**.

Initialize App Builder project

1. Navigate to the downloaded code and run:
```bash
aio login
aio console org select
aio console project select
aio console workspace select
aio app use --merge
```

2. Add required services to your project:
```bash
aio app add service
```
Select the following from the list:
- I/O Management API
- Adobe Commerce as a Cloud Service (If connecting to Adobe Commerce as a Cloud Service)

3. Deploy App Builder Actions:

Deploy the App Builder actions using the Adobe I/O CLI:
```bash
aio app deploy
```

---

## Initialize the Project

```bash
aio app init
npm install
aio app use -w <Workspace>
aio app build
```

---

## Environment Variables

Create a `.env` file from `env.dist` and fill what you need.

### Shared
```env
COMMERCE_BASE_URL=
COMMERCE_WEBHOOKS_PUBLIC_KEY=
LOG_LEVEL=info
AIO_CLI_ENV=prod
```

### SaaS (IMS OAuth)
```env
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_TECHNICAL_ACCOUNT_ID=
OAUTH_TECHNICAL_ACCOUNT_EMAIL=
OAUTH_IMS_ORG_ID=
OAUTH_SCOPES=["commerce.accs"]
```

### PaaS (Commerce Integration)
```env
COMMERCE_CONSUMER_KEY=
COMMERCE_CONSUMER_SECRET=
COMMERCE_ACCESS_TOKEN=
COMMERCE_ACCESS_TOKEN_SECRET=
```

SaaS example: `COMMERCE_BASE_URL=https://na1.api.commerce.adobe.com/<tenant_id>/`  
PaaS example: `COMMERCE_BASE_URL=https://yourcommerce.com/rest/default/`

---

## Architecture

Components:

- Admin UI SDK extension (Carrier Grid)
- App Builder Runtime Actions
- Commerce Webhooks (SaaS and PaaS) using `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates`
- aio-lib-files storage for per-carrier customization JSON
- Checkout integration (shipping rates)

Flow:

```
Commerce Webhooks → Runtime Actions → Carrier Storage → Admin UI Grid → Checkout
```

---

## Carrier Grid Configuration

### Carrier Grid Screenshot
![Carrier Grid](https://github.com/user-attachments/assets/6f5a17a4-307d-422a-97df-c763d830f654)

### Add Carrier Screenshot
![Add Carrier](https://github.com/user-attachments/assets/01a39481-eadf-41b5-a42f-edad0bdbe350)

### Edit Carrier Screenshot
![Edit Carrier](https://github.com/user-attachments/assets/6d5dbd7c-bc76-4c60-85de-dcf99711ba05)

### Checkout Screenshot
![Checkout](https://github.com/user-attachments/assets/3afa537f-cf85-443e-a2f2-359a73870b42)

Supported fields:

| Field | Description |
|-------|-------------|
| carrier_code | Method identifier |
| title | Display title |
| hint | Additional info |
| enabled | Global enable |
| min | Minimum allowed total |
| value | Base price or dynamic price |
| stores | List of store views |
| customer_groups | Access control |
| sort_order | Sorting |

---

## Configuration

- SaaS: configure IMS OAuth credentials, create a Commerce Webhook subscription to `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates`, and deploy the app; no Commerce module install required.
- PaaS: install the Commerce modules, configure integration credentials (or IMS per the IMS module doc), and create a webhook subscription (UI or `etc/webhooks.xml`) to `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates`, then deploy.
- Admin UI SDK registration is handled by the `registration` action.

---
## Webhooks

1. Prepare Webhook Signature

a. In Adobe Commerce, go to Stores > Settings > Configuration > Adobe Services > Webhooks
b. Enable and click Digital Signature Configuration Regenerate Key Pair
c. Add the generated to your as .env [as the same format](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action)
```
COMMERCE_WEBHOOKS_PUBLIC_KEY= -----BEGIN PUBLIC KEY-----"
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
-----END PUBLIC KEY-----"
```

2. Create Webhooks.
After deploying your App Builder actions, with the following actions:create the webhooks
For SaaS: Register your action to plugin.magento.out_of_process_shipping_methods.api.
inwebhook methodshipping_rate_repository.get_rates System > Webhooks > Webhooks Subscriptions.
For PaaS: Refer to . Replace the placeholder URL with the actual URL of your deployed actionwebhooks.xml
```
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xsi:noNamespaceSchemaLocation="urn:magento:module:Magento_AdobeCommerceWebhooks:etc
/webhooks.xsd">
<method name="plugin.magento.out_of_process_shipping_methods.api.
shipping_rate_repository.get_rates" type="after">
<hooks>
<batch name="fulcurum_shipping">
<hook name="add_shipping_rates_fulcrum" url="https://<your_app_builder>.
runtime.adobe.io/api/v1/web/application/shipping-methods" method="POST" timeout="5000"
softTimeout="1000" priority="100" required="true">
<fields>
<field name="rateRequest" />
</fields>
</hook>
</batch>
</hooks>
</method>
</config>
```

## Deploy

```bash
aio app build
aio app deploy
aio runtime action list
```

Admin UI SDK registration endpoint: `/api/v1/web/admin-ui-sdk/registration`  
Fulcrum Custom Shipping menu actions live under `/api/v1/web/FulcrumCustomShippingMenu/*`

---

## Actions

### shipping-methods (webhook responder)
- **Request:** raw webhook body (base64 in `__ow_body`) with rate request payload:
```json
{
  "rateRequest": {
    "store_code": "default",
    "website_code": "base",
    "customer_group_id": "general",
    "grand_total": 120,
    "items_qty": 3,
    "items": [
      { "sku": "A", "qty": 1, "price": 20, "row_total": 20 },
      { "sku": "B", "qty": 2, "price": 30, "row_total": 60 }
    ],
    "shipping_address": { "city": "Mar del Plata", "postcode": "7600", "country_id": "AR" }
  }
}
```
- **Response:** JSON Patch operations consumed by Commerce Webhooks. Example success operation:
```json
[
  {
    "op": "add",
    "path": "result",
    "value": {
      "carrier_code": "FULCRUM_dynamic",
      "carrier_title": "Fulcrum Shipping",
      "method": "dynamic",
      "method_title": "Dynamic Rate",
      "amount": 12.34,
      "price": 12.34,
      "cost": 12.34,
      "available": true,
      "additional_data": []
    }
  }
]
```
- **Auth:** `require-adobe-auth: true`; supports both IMS OAuth and Commerce integration credentials.

### add-carrier
- **Request:** JSON body or `carrier` param:
```json
{
  "carrier": {
    "code": "FULCRUM_dynamic",
    "title": "Fulcrum Dynamic Shipping",
    "stores": ["default", "us_store"],
    "countries": ["US","CA"],
    "sort_order": 10,
    "active": true,
    "tracking_available": true,
    "shipping_labels_available": false,
    "variables": {
      "method_name": "Dynamic",
      "value": 12.34,
      "minimum": 0,
      "maximum": 200,
      "customer_groups": [0,1],
      "price_per_item": true,
      "stores": ["default"]
    }
  }
}
```
- **Response:**
```json
{
  "ok": true,
  "method": "POST",
  "carrier": { "code": "FULCRUM_dynamic", "title": "Fulcrum Dynamic Shipping", "active": true },
  "commerce": "{...raw Commerce API response...}",
  "receivedCustom": { "method_name": "Dynamic", "value": 12.34, "minimum": 0, "maximum": 200, "customer_groups": [0,1], "price_per_item": true, "stores": ["default"] },
  "savedCustom": { "...": "merged custom JSON persisted in aio-lib-files" }
}
```
- **Auth:** IMS OAuth or Commerce integration; writes custom JSON to `carrier_custom_<code>.json`.

### get-carriers
- **Request:** no body; uses credentials to call Commerce and read custom JSON per carrier.
- **Response:**
```json
{
  "ok": true,
  "carriers": [
    {
      "code": "FULCRUM_dynamic",
      "title": "Fulcrum Dynamic Shipping",
      "stores": ["default"],
      "countries": ["US","CA"],
      "sort_order": 10,
      "active": true,
      "tracking_available": true,
      "shipping_labels_available": false,
      "method_name": "Dynamic",
      "value": 12.34,
      "minimum": 0,
      "maximum": 200,
      "customer_groups": [0,1],
      "price_per_item": true
    }
  ]
}
```

### delete-carrier
- **Request:** JSON body `{ "code": "<carrier_code>" }` or query `?code=<carrier_code>`.
- **Response:**
```json
{
  "ok": true,
  "code": "FULCRUM_dynamic",
  "deletedInCommerce": true,
  "stateDeleted": true,
  "delRaw": "Deleted FULCRUM_dynamic"
}
```
- Deletes Commerce carrier and related custom JSON file(s).

### get-customer-groups
- **Request:** none (requires COMMERCE_BASE_URL and auth).
- **Response:**
```json
{ "items": [ { "id": 0, "code": "NOT LOGGED IN" }, { "id": 1, "code": "General" } ] }
```

### get-stores
- **Request:** none (requires COMMERCE_BASE_URL and auth).
- **Response:**
```json
{ "items": [ { "id": "default", "name": "Default Store View" }, { "id": "us_store", "name": "US Store" } ] }
```

### commerce-rest-api
- **Request:** Pass-through Commerce REST call (method/path/body) for Admin UI tooling. Requires credentials.
- **Response:** Commerce API JSON response wrapped with `{ success, message }`.

### registration
- **Request:** none (runtime-provided context).
- **Response:** `{ "status": "registered", "message": "Fulcrum Custom Shipping registered" }`

---

## Errors

Webhook handler errors surface as a JSON Patch with a single `error` entry; UI actions respond with `{ ok: false, message }` and appropriate status codes. Example webhook error payload:
```json
[
  {
    "op": "add",
    "path": "result",
    "value": {
      "carrier_code": "FULCRUM",
      "carrier_title": "Fulcrum Custom Shipping (ERROR)",
      "method": "fulcrum_error",
      "method_title": "Webhook verify failed",
      "amount": 0,
      "price": 0,
      "cost": 0,
      "additional_data": [{ "key": "source", "value": "shipping-methods error" }]
    }
  }
]
```

---

## Changelog

- Added SaaS + PaaS compatibility
- Added Admin UI screenshots
- Added payloads and request/response examples for all actions
- Added webhook module documentation
- Updated to @adobe/uix-sdk 1.0.3

---

## Support

info@fulcrumdigital.com
