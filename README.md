# Fulcrum Custom Shipping (OOPE)

Welcome to **Fulcrum Custom Shipping** (`fulcrum_custom_shipping`), a custom **Out-Of-Process Extension (OOPE)** shipping method for **Adobe Commerce SaaS** and **PaaS (Cloud / On-Prem Cloud deployments)**.

This project includes:

- A **Carrier Grid (CRUD)** powered by **Adobe App Builder** and **Admin UI SDK**
- Dynamic **shipping rate calculation via Commerce Webhooks**
- No installation of downloadable Magento modules in the backend (OOPE app)
- IMS **OAuth Server-to-Server authentication** compatible with **SaaS and PaaS**
- Webhook forwarding from Commerce checkout → App Builder actions using digital signatures

User-facing guides:
- <a>USER GUIDE</a>
- <a>DETAILED DESCRIPTION GUIDE</a>

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Install the require modules to configure the shipping extensions (PaaS Only)](#install-the-require-modules-to-configure-the-shipping-extensions-paas-only
- [Create an App Builder Project](#create-an-app-builder-project)
- [Initialize the Project](#initialize-the-project)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Carrier Grid Configuration](#carrier-grid-configuration)
- [Webhook Module Setup (PaaS Only)](#webhook-module-setup-paas-only)
- [Webhooks Console Registration (PaaS & SaaS)](#webhooks-console-registration--paas--saas)
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

- Adobe Commerce **SaaS** or **PaaS (Cloud / On-Prem Cloud instances)**
- Node.js: `^18 || ^20 || ^22`
- Adobe I/O CLI: `>= 11.0.1`
  ```bash
  npm install -g @adobe/aio-cli
  ```
- App Builder license enabled in Adobe Developer Console
- OAuth credentials added as **OAuth Server-to-Server**
- OAuth scope:
  ```
  commerce.accs
  ```
- APIs enabled in the same project:
  - `Adobe Commerce API`
  - `Adobe I/O Eventing API`

---

## Install the require modules to configure the shipping extensions (PaaS Only)

(Section preserved exactly as in your original content)

- Install Adobe Commerce modules if required by your environment
  ```bash
  composer require magento/module-out-of-process-shipping-methods --with-dependencies
  ```
- Install Commerce Webhooks module
  ```bash
  composer require magento/module-out-of-process-shipping-methods --with-dependencies
  ```
- Update Commerce Eventing module to `>=1.10.0`
  ```bash
  composer update magento/commerce-eventing --with-dependencies
  ```
- Install Admin UI SDK components if required
  ```bash
  composer require "magento/commerce-backend-sdk":"^3.0.0"
  ```
*Note:* This section is only needed for **PaaS** and does not imply installing a downloadable shipping module in Magento backend.

---

## App Builder Webhook Module (for PaaS)

### Webhook Module Setup (PaaS Only)

Create this module in your Adobe Commerce Cloud instance (PaaS):

```text
app/code/Fulcrum/CustomShippingWebhook/
```

Create the following files:

#### `registration.php`
```php
<?php
use Magento\Framework\Component\ComponentRegistrar;
ComponentRegistrar::register(
    ComponentRegistrar::MODULE,
    'Fulcrum_CustomShippingWebhook',
    __DIR__
);
```

#### `etc/module.xml`
```xml
<?xml version="1.0"?>
<config>
  <module name="Fulcrum_CustomShippingWebhook" setup_version="1.0.0"/>
</config>
```

#### `etc/config.xml`
```xml
<?xml version="1.0"?>
<config>
  <default>
    <fulcrum_custom_shipping_webhook>
      <general>
        <enabled>1</enabled>
      </general>
    </fulcrum_custom_shipping_webhook>
  </default>
</config>
```

#### `etc/webhooks.xml`
```xml
<?xml version="1.0"?>
<webhooks>
  <event name="plugin.sales.api.order_management.shipping_methods">
    <endpoint
      name="FulcrumCustomShippingMethods"
      url="https://your-runtime-action-url/shipping-methods"
      method="POST"
      is_active="1">
    </endpoint>
  </event>
</webhooks>
```

Enable the module in Cloud SSH:

```bash
bin/magento module:enable Fulcrum_CustomShippingWebhook
bin/magento setup:upgrade
bin/magento cache:flush
```

---

## Webhooks Console Registration (PaaS & SaaS)

After deploying your App Builder actions, register webhook:

```bash
aio api create-webhook \
  --name "FulcrumCustomShippingWebhook" \
  --provider-events "plugin.sales.api.order_management.shipping_methods" \
  --delivery-url "https://your-runtime-action-url/shipping-methods"
```

---

## Webhook Signing Keys

### Generate keypair from Commerce Admin (PaaS or SaaS)

In Commerce Admin UI:

```
Stores → Settings → Configuration → Adobe Services → Webhooks → Digital Signature Configuration
```

1. Enable **Digital Signatures**
2. Click **Regenerate Key Pair**
3. Copy the **public key** into your `.env` file (root of project):
   ```
   COMMERCE_WEBHOOKS_PUBLIC_KEY
   ```
4. Keep the **private key stored securely server-side only** (do not expose in README or runtime)

---

## OAuth Authentication Validation

### Validate IMS OAuth Server-to-Server credentials:

Use this command:

```bash
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$OAUTH_CLIENT_ID&client_secret=$OAUTH_CLIENT_SECRET&scope=commerce.accs" \
  https://ims-na1.adobelogin.com/ims/token/v3 | jq -r '.access_token'
```

Expected result: valid token string (never `null`).

---

## Architecture

The flow implemented by this project:

```
Adobe Commerce Checkout → event `plugin.sales.api.order_management.shipping_methods` →  
signed webhook request → forwarded to Adobe App Builder Runtime action (`shipping-methods`) →  
returns calculated shipping options → rendered natively in checkout storefront.
```

---

## Carrier Grid Configuration

Carrier Grid UI is powered by App Builder and Admin UI SDK and stores carrier data out-of-process.

---

## Connect to Adobe Commerce

(Original section preserved)

The adobe-commerce.js file provides methods to interact with the Adobe Commerce instance. The client uses the **Adobe Commerce HTTP Client**, a wrapper around the **Adobe Commerce REST API**.

You can authenticate using:
- **IMS OAuth (PaaS or SaaS)**
- **Commerce Integration tokens (PaaS only)**

### PaaS Only

`COMMERCE_BASE_URL` includes your base site URL + `/rest/<store_view_code>/`

Example:
```
https://<commerce_instance_url>/rest/<store_view_code>/
```

### SaaS Only

`COMMERCE_BASE_URL` must be the REST endpoint provided by Adobe.

Example:
```
https://na1.api.commerce.adobe.com/<tenant_id>/
```

Precedence:
- If **Commerce Integration keys are present (PaaS only)** → use them
- Else → use **IMS OAuth Server-to-Server**
- If neither detected → client instantiation fails

### Adobe Identity Management Service (IMS)

PaaS:
- Should already have the IMS module enabled
- Requires extra setup to authorize the technical user in Commerce Admin

SaaS:
- IMS is included by default
- Copy generated credentials to `.env`

---

## Create a Commerce integration (PaaS Only)

(Original preserved)

This option allows communication between Commerce and App Builder.

1. In Commerce Admin:
   ```
   System → Extensions → Integrations → API → Resource Access: All
   ```
2. Copy integration credentials to `.env`:

```env
COMMERCE_CONSUMER_KEY=<key>
COMMERCE_CONSUMER_SECRET=<secret>
COMMERCE_ACCESS_TOKEN=<token>
COMMERCE_ACCESS_TOKEN_SECRET=<secret>
```

---

## Deploy

Deploy actions using:

```bash
aio app build && aio app deploy
```

---

## Actions

(All preserved, no changes conceptuales)

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

### `delete-carrier`
Deletes a carrier by its ID/code.
```json
{ "carrier_id": "FULCRUM_dynamic" }
```

### `get-carriers`
Returns all configured carriers.

### `get-customer-groups`
Fetches all available customer groups.

### `get-stores`
Fetches store views.

### `registration`
Bootstraps the Admin UI extension.

### `commerce`
Commerce API integration module.

### `utils.js`
Input validation and logging helpers.

### `shipping-methods/index.js`
Receives rate requests from Commerce checkout.

---

## Errors

(Original preserved)

Responds with:
```json
{
  "status": "fail",
  "errors": [ { "field": "min", "message": "Must be >= 0" } ]
}
```

---

## Changelog

(Original preserved)

- **1.0.0**: Initial public release.

---

## Support

(Original preserved)

- **Email:** info@fulcrumdigital.com

---

© 2025 Fulcrum Digital. Adobe, Adobe Commerce, and Magento are trademarks of Adobe Inc.
