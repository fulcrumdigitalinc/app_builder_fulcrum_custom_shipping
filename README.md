# Fulcrum Custom Shipping (OOPE)

Welcome to **Fulcrum Custom Shipping** (`fulcrum_custom_shipping`), a custom **Out-Of-Process Extension (OOPE)** shipping method for **Adobe Commerce SaaS**.

This project implements a **carrier grid** powered by **Adobe App Builder** and **Commerce Webhooks**, without installing modules in the Magento backend. It provides a configurable shipping method managed through the **Admin UI** and consumed by the **Checkout Starter Kit** or a custom Storefront.

For more details on the extensibility framework, see the [Adobe Commerce Checkout Starter Kit docs](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/).
You can download the <a href="https://docs.google.com/document/d/1rrvvXR9E-XeHFnKwxMwG-y_zwaCshOMrmH4D9_HcqRg/edit?usp=sharing" target="_blank">USER GUIDE</a>
Or the <a href="https://docs.google.com/document/d/1auF_ueMR5jAqGKTSOknEOorKmBvLELc3Pk2f__5a_XU/edit?usp=sharing" target="_blank">DETAILED DESCRIPTION GUIDE</a>

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Install the require modules to configure the shipping extensions (PaaS Only)](#install-the-require-modules-to-configure-the-shipping-extensions-paas-only
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

### Install the require modules to configure the shipping extensions (PaaS Only)
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
##Connect to Adobe Commerce

The adobe-commerce.js file provides a set of methods to interact with the Adobe Commerce instance. The client uses the Adobe Commerce HTTP Client, which is a wrapper around the Adobe Commerce REST API.

To use the Adobe Commerce HTTP Client, update the COMMERCE_BASE_URL value in the .env file, and complete the authentication setup.

​###PaaS onlyFor PaaS (On-Premise/Cloud):

COMMERCE_BASE_URL includes your base site URL + /rest/<store_view_code>/
Example: https://<commerce_instance_url>/rest/<store_view_code>/
​SaaS onlyFor SaaS (Adobe Commerce as a Cloud Service):

COMMERCE_BASE_URL must be the REST API endpoint provided by Adobe Commerce
Example: https://na1.api.commerce.adobe.com/<tenant_id>/
Authentication
Depending on your Adobe Commerce setup, there are two options to authenticate and communicate with App Builder:

Adobe Identity Management Service (IMS)

​PaaS only Commerce Integration

If Commerce integration authentication is detected, it has precedence over IMS authentication. However, if neither option is detected or configured, then client instantiation will fail.

Adobe Identity Management Service (IMS)
​PaaS only This process requires a Commerce instance with Adobe Identity Management Service (IMS) for Adobe Commerce configured.

SaaS instances already include IMS configuration.

Use the following steps to create OAuth credentials for App Builder authentication:

Access your IMS credentials through the Adobe Developer Console. Select the project and workspace you set up during the initial configuration. Then click OAuth Server-to-Server in the side-navigation menu.

Copy the IMS credentials to the .env file in the root of the project.

NOTE: These credentials are automatically populated in Configure OAuth Server-to-Server Credential.

OAUTH_CLIENT_ID=<client id>
OAUTH_CLIENT_SECRETS=<client secrets>
OAUTH_TECHNICAL_ACCOUNT_ID=<technical account id>
OAUTH_TECHNICAL_ACCOUNT_EMAIL=<technical account email>
OAUTH_SCOPES=<scopes>
OAUTH_IMS_ORG_ID=<img org>

OAUTH_CLIENT_ID=<client id>
OAUTH_CLIENT_SECRETS=<client secrets>
OAUTH_TECHNICAL_ACCOUNT_ID=<technical account id>
OAUTH_TECHNICAL_ACCOUNT_EMAIL=<technical account email>
OAUTH_SCOPES=<scopes>
OAUTH_IMS_ORG_ID=<img org>
Provide the technical account with access to the Commerce instance:

​SaaS only The technical account is automatically created and associated with the Commerce instance once the first request is made using the OAuth credentials.

​PaaS only Add a technical account with server-to-server credentials to the Commerce Admin with the appropriate permissions using the Admin User Creation Guide.

When associating the user with the account, find your Technical Account email as a part of generated IMS credentials with following pattern: <technical-account>@techacct.adobe.com and use that value in the Email field during user creation:

ims-user-creation.png

On the User Role tab, select the role that provides all necessary permissions for API integrations.

ims-user-role.png

##Create a Commerce integration
​PaaS only This option allows communication between Commerce and App Builder.

Create a new Adobe Commerce Integration by following the systems integration guide.

Make sure your API integration has the necessary permissions to access the Commerce REST API.

To confirm that you have access, in the Commerce Admin, navigate to System > Extensions > Integrations. Under the Basic Settings menu, click API to view the Available APIs. Then select All in the Resource Access field.

Copy the integration details (consumer key, consumer secret, access token, and access token secret) to the .env file in the root of the project.

COMMERCE_CONSUMER_KEY=<key>
COMMERCE_CONSUMER_SECRET=<secret>
COMMERCE_ACCESS_TOKEN=<access token>
COMMERCE_ACCESS_TOKEN_SECRET=<access token secret>

COMMERCE_CONSUMER_KEY=<key>
COMMERCE_CONSUMER_SECRET=<secret>
COMMERCE_ACCESS_TOKEN=<access token>
COMMERCE_ACCESS_TOKEN_SECRET=<access token secret>

### Create Webhooks
After deploying actions, create the required webhooks (Admin/System/Webhook subscription):
- `get_rates` → `plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates`
- `type` → `after`

---
### Carriers Grid
<img width="2456" height="720" alt="image" src="https://github.com/user-attachments/assets/6f5a17a4-307d-422a-97df-c763d830f654" />


### Add Carrier
<img width="645" height="696" alt="image" src="https://github.com/user-attachments/assets/01a39481-eadf-41b5-a42f-edad0bdbe350" />


### Edit Carrier
<img width="645" height="696" alt="image" src="https://github.com/user-attachments/assets/6d5dbd7c-bc76-4c60-85de-dcf99711ba05" />


### Checkout
<img width="759" height="902" alt="image" src="https://github.com/user-attachments/assets/3afa537f-cf85-443e-a2f2-359a73870b42" />




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
