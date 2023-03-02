/**
 * This file just exists to enable devs that use vscode to benefit from auto
 * formatting on save when using prettier plugin and the require config file
 * setting. It grabs the config from the shared eslint-config and re-exports
 * it to prevent any issues with mismatched settings
 */
const config = require('@metamask/eslint-config');

const prettierConfig = config.rules[`prettier/prettier`][1];

module.exports = prettierConfig;
