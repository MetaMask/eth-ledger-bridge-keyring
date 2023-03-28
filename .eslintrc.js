module.exports = {
  root: true,

  extends: ['@metamask/eslint-config', '@metamask/eslint-config-browser'],

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
      rules: {
        'import/no-nodejs-modules': 'off',
      },
      extends: ['@metamask/eslint-config-mocha'],
    },
  ],

  ignorePatterns: [
    '!.eslintrc.js',
    '!.prettierrc.js',
    'dist/',
    'docs/',
    '.yarn/',
  ],
};
