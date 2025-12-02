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

The project is composed of:

- Admin UI SDK extension (Carrier Grid)
- App Builder Runtime Actions
- Commerce Webhooks
- aio-lib-commerce client
- PaaS Magento Webhook module (for on-prem/cloud)
- Checkout integration (Shipping rates)

High-level flow:

```
Commerce (SaaS/PaaS) → Webhooks → App Builder Runtime → Carrier Storage → Admin UI Grid → Checkout
```

---

## Carrier Grid Configuration

The Carrier Grid UI communicates with App Builder Runtime actions and supports:

- Listing carriers
- Adding carriers
- Editing carriers
- Deleting carriers
- Customer group filtering
- Store view assignment
- Min/Max validation
- Sort order
- Enable/Disable

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

1. Stores → Configuration → Adobe Services → Webhooks
2. Enable Digital Signature
3. Generate key pair
4. Add public key to `.env`

### SaaS Webhooks Required

| Event | Topic |
|-------|--------|
| Shipping Rates | plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates |

### PaaS Webhook Module

PaaS requires a Magento module located at:

```
app/code/Fulcrum/CustomShippingWebhook
```

It registers:

- Topic: `plugin.sales.api.order_management.shipping_methods`
- Endpoint: `FulcrumCustomShippingMenu/shipping-methods`

Enable:

```bash
bin/magento module:enable Fulcrum_CustomShippingWebhook
bin/magento setup:upgrade
bin/magento cache:flush
```

---

## Deploy

Build:

```bash
aio app build
```

Deploy:

```bash
aio app deploy
```

List actions:

```bash
aio runtime action list
```

Admin UI SDK registration URL:

```
https://<runtime-namespace>.adobeioruntime.net/api/v1/web/admin-ui-sdk/registration
```

---

## Actions

### add-carrier

Creates or updates a custom carrier.

Request example:

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

### get-carriers

Returns all configured carriers.

### get-customer-groups

Returns customer groups.

### get-stores

Returns store views.

### registration

Bootstraps Admin UI extension.

### commerce

Shared module for Adobe Commerce API integration.

### utils.js

Validation, formatting and logging helpers.

### shipping-methods/index.js

Handles shipping rate calculation and returns rates to Commerce.

Example:

```json
{
  "rateRequest": {
    "address": { "country_id": "US", "postcode": "90210" },
    "totals": { "grand_total": 199.99 }
  }
}
```

---

## Errors

- 400: Bad Request
- 401: Invalid token
- 404: Carrier not found
- 409: Duplicate carrier code

Sample:

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

- 1.0.0 Initial release  
- 1.1.0 Added PaaS compatibility  
- 1.2.0 Updated to @adobe/uix-sdk 1.0.3  
- 1.3.0 Added maxVersion in app.config.yaml  
- 1.4.0 Unified OAuth credentials for runtime actions

---

## Support

info@fulcrumdigital.com

© 2025 Fulcrum Digital. Adobe, Adobe Commerce, and Magento are trademarks of Adobe Inc.
