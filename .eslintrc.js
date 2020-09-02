module.exports = {
  root: true,

  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/mocha',
    '@metamask/eslint-config/config/nodejs',
  ],

  parser: 'babel-eslint',

  parserOptions: {
    ecmaVersion: 2017,
    ecmaFeatures: {
      arrowFunctions: true,
      classes: true,
      experimentalObjectRestSpread: true,
    },
  },

  plugins: [
    'json',
    'import',
  ],

  globals: {
    document: 'readonly',
    window: 'readonly',
  },

  overrides: [{
    files: [
      '.eslintrc.js',
    ],
    parserOptions: {
      sourceType: 'script',
    },
  }],

  ignorePatterns: ['dist'],
}
