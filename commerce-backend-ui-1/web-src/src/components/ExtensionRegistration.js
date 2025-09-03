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
import React, { useEffect } from 'react';
import { register } from '@adobe/uix-guest';
import { MainPage } from './MainPage';
import { EXTENSION_ID } from '../constants/extension';

/**
 * Extension Registration Component
 * @param {object} props The component props
 * @param {object} props.runtime Adobe I/O runtime object
 * @param {object} props.ims IMS context object
 * @returns {React.ReactElement} The rendered React component
 */
export default function ExtensionRegistration(props) {
  const registerExtension = async () => {
    await register({
      id: EXTENSION_ID,
      methods: {},
    });
  };

  useEffect(() => {
    registerExtension().catch(console.error);
  }, []);

  return <MainPage runtime={props.runtime} ims={props.ims} />;
}
