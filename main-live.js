'use strict'
import 'babel-polyfill';
import LedgerLiveBridge from './ledger-live-bridge'

(async () => {
    const bridge = new LedgerLiveBridge()
})()
console.log('MetaMask < = > Ledger Live Bridge initialized!')
