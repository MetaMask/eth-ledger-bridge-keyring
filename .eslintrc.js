module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: [
        '@metamask/eslint-config-typescript',
        '@metamask/eslint-config-browser',
      ],
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
      extends: [
        '@metamask/eslint-config-nodejs',
        '@metamask/eslint-config-jest',
      ],
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
