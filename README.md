# Fulcrum Custom Shipping (OOPE)

Welcome to **Fulcrum Custom Shipping** (`fulcrum_custom_shipping`), a custom **Out-Of-Process Extension (OOPE)** shipping method for **Adobe Commerce SaaS**.

This project implements a **carrier grid** powered by **Adobe App Builder** and **Commerce Webhooks**, without installing modules in the Magento backend. It provides a configurable shipping method managed through the **Admin UI** and consumed by the **Checkout Starter Kit** or a custom Storefront.

For more details on the extensibility framework, see the [Adobe Commerce Checkout Starter Kit docs](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/).
You can download the <a href="https://docs.google.com/document/d/1rrvvXR9E-XeHFnKwxMwG-y_zwaCshOMrmH4D9_HcqRg/edit?usp=sharing">USER GUIDE</a>
Or the <a href="https://docs.google.com/document/d/1auF_ueMR5jAqGKTSOknEOorKmBvLELc3Pk2f__5a_XU/edit?usp=sharing">DETAILED DESCRIPTION GUIDE</a>
---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Install Adobe Commerce Modules (PaaS only)](#install-adobe-commerce-modules-paas-only)
- [Create an App Builder Project](#create-an-app-builder-project)
- [Initialize the Project](#initialize-the-project)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Carrier Grid Configuration](#carrier-grid-configuration)
- [Webhooks](#webhooks)
- [Deploy](#deploy)
- [Actions](#actions)
  - [`add-carrier`](#add-carrier)
  - [`delete-carrier`](#delete-carrier)
  - [`get-carriers`](#get-carriers)
  - [`get-customer-groups`](#get-customer-groups)
  - [`get-stores`](#get-stores)
  - [`registration`](#registration)
  - [`commerce`](#commerce)
  - [`utils.js`](#utilsjs)
  - [`shipping-methods/index.js`](#shipping-methodsindexjs)
- [Errors](#errors)
- [Changelog](#changelog)
- [Support](#support)

---

## Prerequisites
- Adobe Commerce as a Cloud Service (SaaS) or Adobe Commerce `2.4.5+` (PaaS)
- [Node.js](https://nodejs.org/) `v22`
- [Adobe I/O CLI](https://developer.adobe.com/app-builder/docs/guides/runtime_guides/tools/cli-install):
```bash
npm install -g @adobe/aio-cli
```
- Access to the [Adobe Developer Console](https://console.adobe.io/) with an App Builder license.

### Install Adobe Commerce Modules (PaaS only)
```bash
composer require magento/module-out-of-process-shipping-methods --with-dependencies
```
- For Commerce Webhook, see [Install Adobe Commerce Webhooks](https://developer.adobe.com/commerce/extensibility/webhooks/installation/)
- Update Commerce Eventing module to `>=1.10.0`:
```bash
composer update magento/commerce-eventing --with-dependencies
```
- Install Admin UI SDK `>=3.0.0`:
```bash
composer require "magento/commerce-backend-sdk": ">=3.0"
```

---

## Webhooks
### Prepare Webhook Signature
1. Go to **Stores > Settings > Configuration > Adobe Services > Webhooks**
2. Enable **Digital Signature Configuration** and click **Regenerate Key Pair**
3. Add the generated **Public Key** to `.env`:
```env
COMMERCE_WEBHOOKS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
XXXXXXXXXXXXXXXXXXXXXXXX
-----END PUBLIC KEY-----"
```

### Create Webhooks
After deploying actions, create the required webhooks (Admin/System/Webhook subscription):
- `get_rates` → `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates`
- `type` → `after`

---

## Actions

### `add-carrier`
Creates or updates a custom shipping carrier.
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

### `delete-carrier`
Deletes a carrier by its ID/code.
```json
{ "carrier_id": "FULCRUM_dynamic" }
```
Response:
```json
{ "status": "success", "message": "Carrier removed" }
```

### `get-carriers`
Returns all configured carriers.
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

### `get-customer-groups`
Fetches all available customer groups.
```json
[
  { "id": "0", "name": "NOT LOGGED IN" },
  { "id": "1", "name": "General" },
  { "id": "2", "name": "Wholesale" }
]
```

### `get-stores`
Fetches store views.
```json
[
  { "id": "default", "name": "Default Store View" },
  { "id": "us_store", "name": "US Store" }
]
```

### `registration`
Bootstraps the Admin UI extension.
```json
{
  "status": "registered",
  "message": "Fulcrum Custom Shipping registered"
}
```

### `commerce`
Shared module for Adobe Commerce API integration (IMS OAuth flow, REST/GraphQL wrappers).

### `utils.js`
Helpers for input validation, data formatting, and logging.

### `shipping-methods/index.js`
Main action for returning shipping rates to Adobe Commerce at checkout.
```json
{
  "rateRequest": {
    "address": { "country_id": "US", "postcode": "90210" },
    "totals": { "grand_total": 199.99 }
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
- **400**: Malformed JSON body
- **401**: Missing/invalid IMS token
- **404**: Carrier not found
- **409**: Duplicate `carrier_code`
```json
{
  "status": "fail",
  "errors": [ { "field": "min", "message": "Must be >= 0" } ]
}
```

---

## Changelog
- **1.0.0**: Initial public release of Fulcrum Custom Shipping and action documentation.

---

## Support
- **Email:** info@fulcrumdigital.com

© 2025 Fulcrum Digital. Adobe, Adobe Commerce, and Magento are trademarks of Adobe Inc.
