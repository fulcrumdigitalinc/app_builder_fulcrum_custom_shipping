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

const fs = require('fs');
const path = require('path');
const { Core } = require('@adobe/aio-sdk');
const logger = Core.Logger('hooks/pre-app-build', { level: process.env.LOG_LEVEL || 'info' });

module.exports = () => {
  const syncPath = path.join(__dirname, '..', 'scripts', 'sync-oauth-credentials.js');
  if (fs.existsSync(syncPath)) {
    require(syncPath).main();
    logger.info('Synced OAuth credentials');
  } else {
    logger.info('Skipping sync-oauth-credentials (script not present)');
  }
};
