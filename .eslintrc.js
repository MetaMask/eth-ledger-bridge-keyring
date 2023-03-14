const environmentRules = require('@metamask/eslint-config/src/environment.json');

module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
    },

    {
      files: ['*.js'],
      parserOptions: {
        sourceType: 'script',
      },
      extends: ['@metamask/eslint-config-nodejs'],
    },

    {
      files: ['*.test.ts'],
      extends: ['@metamask/eslint-config-mocha'],
    },
  ],

  rules: {
    'import/no-nodejs-modules': 'off',
    'no-restricted-globals': [
      'error',
      ...environmentRules['no-restricted-globals'].filter(
        (rule) =>
          typeof rule !== 'string' &&
          ![
            'Buffer',
            'document',
            'global',
            'HTMLIFrameElement',
            'Window',
            'window',
          ].includes(rule.name),
      ),
    ],
  },

  ignorePatterns: [
    '!.eslintrc.js',
    '!.prettierrc.js',
    'dist/',
    'docs/',
    '.yarn/',
  ],
};
