const { LedgerKeyring, KEYRING_TYPE } = require('./ledger-keyring')
const LedgerKeyringMv2 = require('./ledger-keyring-mv2')

// Keep default behaviour by exporting Mv2 version as default
module.exports = LedgerKeyringMv2

module.exports.LedgerKeyringMv2 = LedgerKeyringMv2

module.exports.LedgerKeyring = LedgerKeyring
module.exports.KEYRING_TYPE = KEYRING_TYPE
