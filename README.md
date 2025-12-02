# Fulcrum Custom Shipping (OOPE)

Welcome to **Fulcrum Custom Shipping** (`fulcrum_custom_shipping`), a custom **Out-Of-Process Extension (OOPE)** shipping method for **Adobe Commerce SaaS/PaaS**.

This project implements a **carrier grid** powered by **Adobe App Builder**, **Commerce Webhooks**, and the **Admin UI SDK**, without installing modules in the Magento backend for SaaS environments. It provides a configurable shipping method managed through the Admin UI and consumed by the Checkout Starter Kit or any custom Storefront.

For more details on the extensibility framework:  
https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/

User Guide:  
https://docs.google.com/document/d/1rrvvXR9E-XeHFnKwxMwG-y_zwaCshOMrmH4D9_HcqRg/edit

Detailed Description Guide:  
https://docs.google.com/document/d/1auF_ueMR5jAqGKTSOknEOorKmBvLELc3Pk2f__5a_XU/edit

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Install the required modules to configure the shipping extensions PaaS Only](#install-the-required-modules-to-configure-the-shipping-extensions-paas-only)
- [Create an App Builder Project](#create-an-app-builder-project)
- [Initialize the Project](#initialize-the-project)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Carrier Grid Configuration](#carrier-grid-configuration)
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
- Access to Adobe Developer Console with App Builder enabled.

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

1. Open Adobe Developer Console: https://console.adobe.io/
2. Create a new project.
3. Add App Builder.
4. Enable:
   - Runtime
   - Actions
   - I/O Events
   - I/O Management API
5. Create a workspace (Stage / Production).
6. Add OAuth Server-to-Server integration.
7. Set the OAuth scope:
   ```
   commerce.accs
   ```

---

## Initialize the Project

Clone the repository and run:

```bash
aio app init
npm install
```

Select:

- Use existing project → Fulcrum Custom Shipping
- Workspace → Stage

Verify:

```bash
aio app use -w Stage
```

Build check:

```bash
aio app build
```

---

## Environment Variables

Create a `.env` file:

```env
COMMERCE_BASE_URL=
COMMERCE_WEBHOOKS_PUBLIC_KEY=

OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_TECHNICAL_ACCOUNT_ID=
OAUTH_TECHNICAL_ACCOUNT_EMAIL=
OAUTH_SCOPES="commerce.accs"
OAUTH_IMS_ORG_ID=

COMMERCE_CONSUMER_KEY=
COMMERCE_CONSUMER_SECRET=
COMMERCE_ACCESS_TOKEN=
COMMERCE_ACCESS_TOKEN_SECRET=

AIO_RUNTIME_NAMESPACE=
LOG_LEVEL=debug
```

### SaaS Example

```
COMMERCE_BASE_URL=https://na1.api.commerce.adobe.com/<tenant_id>/
```

### PaaS Example

```
COMMERCE_BASE_URL=https://yourcommerce.com/rest/default/
```

---

## Architecture

Components:

- Admin UI SDK extension (Carrier Grid)
- App Builder Runtime Actions
- Commerce Webhooks
- aio-lib-commerce client
- PaaS Magento Webhook module
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

## Webhooks

### Webhook Signature

Configure signature in Commerce and place public key in `.env`.

### SaaS Webhooks

| Event | Topic |
|-------|--------|
| Shipping Rates | plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates |

### PaaS Webhook Module

```
app/code/Fulcrum/CustomShippingWebhook
```

Registers:

- Topic: plugin.sales.api.order_management.shipping_methods
- Endpoint: FulcrumCustomShippingMenu/shipping-methods

---

## Deploy

```bash
aio app build
aio app deploy
aio runtime action list
```

Admin UI SDK registration:

```
https://<namespace>.adobeioruntime.net/api/v1/web/admin-ui-sdk/registration
```

---

## Actions

### add-carrier

```json
{
  "carrier_code": "FULCRUM_dynamic",
  "enabled": true,
  "min": 50.00,
  "title": "Fulcrum Dynamic Shipping",
  "hint": "Calculated based on cart value",
  "stores": ["default", "us_store"],
  "customer_groups": ["0", "1"],
  "sort_order": 10
}
```

Response:

```json
{
  "status": "success",
  "message": "Carrier saved",
  "carrier_id": "FULCRUM_dynamic"
}
```

### delete-carrier

```json
{ "carrier_id": "FULCRUM_dynamic" }
```

Response:

```json
{
  "status": "success",
  "message": "Carrier removed"
}
```

### get-carriers

```json
[
  {
    "carrier_id": "FULCRUM_dynamic",
    "enabled": true,
    "min": 50.00,
    "title": "Fulcrum Dynamic Shipping",
    "hint": "Calculated based on cart value",
    "stores": ["default"],
    "customer_groups": ["0", "1"],
    "sort_order": 10
  }
]
```

### get-customer-groups

```json
[
  { "id": "0", "name": "NOT LOGGED IN" },
  { "id": "1", "name": "General" },
  { "id": "2", "name": "Wholesale" }
]
```

### get-stores

```json
[
  { "id": "default", "name": "Default Store View" },
  { "id": "us_store", "name": "US Store" }
]
```

### registration

```json
{
  "status": "registered",
  "message": "Fulcrum Custom Shipping registered"
}
```

### shipping-methods/index.js

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
    "shipping_address": {
      "city": "Mar del Plata",
      "postcode": "7600",
      "country_id": "AR"
    }
  }
}
```

Response:

```json
{
  "rates": [
    {
      "carrier_code": "FULCRUM_dynamic",
      "method_code": "dynamic",
      "carrier_title": "Fulcrum Shipping",
      "method_title": "Dynamic Rate",
      "amount": 12.34,
      "price_incl_tax": 12.34,
      "available": true,
      "extension_attributes": { "estimated_delivery": "2-5 business days" }
    }
  ]
}
```

---

## Errors

```json
{
  "status": "fail",
  "errors": [
    { "field": "min", "message": "Must be >= 0" }
  ]
}
```

---

## Changelog

- Added SaaS + PaaS compatibility
- Added Admin UI screenshots
- Added all payloads for all actions
- Added webhook module documentation
- Updated to @adobe/uix-sdk 1.0.3

---

## Support

info@fulcrumdigital.com
