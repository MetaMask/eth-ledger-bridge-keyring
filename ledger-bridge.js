'use strict'
require('buffer')

import WebSocketTransport from "@ledgerhq/hw-transport-http/lib/WebSocketTransport"
import LedgerEth from '@ledgerhq/hw-app-eth'
import { byContractAddress } from '@ledgerhq/hw-app-eth/erc20'

const BRIDGE_URL = "ws://localhost:8435"
const TRANSPORT_CHECK_LIMIT = 10;
const TRANSPORT_CHECK_DELAY = 1000;

export default class LedgerBridge {
    constructor() {
        console.log('[LedgerBridge][constructor] called!')
        this.addEventListeners()
    }

    addEventListeners() {
        console.log('[LedgerBridge][addListeners] called!')
        window.addEventListener('message', async e => {
            console.log('[LedgerBridge][addListeners] message received!', e.data, e)
            if (e && e.data && e.data.target === 'LEDGER-IFRAME') {
                const { action, params } = e.data
                const replyAction = `${action}-reply`
                switch (action) {
                    case 'ledger-unlock':
                        this.unlock(replyAction, params.hdPath)
                        break
                    case 'ledger-sign-transaction':
                        this.signTransaction(replyAction, params.hdPath, params.tx, params.to)
                        break
                    case 'ledger-sign-personal-message':
                        this.signPersonalMessage(replyAction, params.hdPath, params.message)
                        break
                    case 'ledger-close-bridge':
                        this.cleanUp(replyAction)
                        break;
                }
            }
        }, false)
    }

    sendMessageToExtension(msg) {
        console.log('[LedgerBridge][sendMessageToExtension] message!', msg)
        window.parent.postMessage(msg, '*')
    }

    delay(ms) {
        return new Promise((success) => setTimeout(success, ms));
    }

    checkTransportLoop(i) {
        console.log('[LedgerBridge][checkTransportLoop] i!', i)
        const iterator = i ? i : 0;
        return WebSocketTransport.check(BRIDGE_URL).catch(async () => {
            console.log('[LedgerBridge][WebSocketTransport.check.catch] message!', i)
            await this.delay(TRANSPORT_CHECK_DELAY);
            if (iterator < TRANSPORT_CHECK_LIMIT) {
                return this.checkTransportLoop(iterator + 1);
            } else {
                throw new Error('Ledger transport check timeout');
            }
        });
    }

    async makeApp(replyAction) {
        console.log('[LedgerBridge][makeApp] called! replyAction:', replyAction)
        try {
            await WebSocketTransport.check(BRIDGE_URL).catch(async () => {
                console.log('[LedgerBridge][makeApp] WebSocketTransport catch')
                window.open('ledgerlive://bridge?appName=Ethereum')
                await this.checkTransportLoop()
                this.transport = await WebSocketTransport.open(BRIDGE_URL)
                this.app = new LedgerEth(this.transport)
                console.log('[LedgerBridge][makeApp] this.transport, app: ', this.transport, this.app)
            })
        } catch (e) {
            console.log('LEDGER:::CREATE APP ERROR', e)
            this.cleanUp();
            throw e
        }
    }

    cleanUp(replyAction) {
        console.log('[LedgerBridge][cleanUp] called')
        this.app = null
        if (this.transport) {
            this.transport.close()
        }
        if (replyAction) {
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
            })
        }
    }

    async unlock(replyAction, hdPath) {
        console.log('[LedgerBridge][unlock] called')
        try {
            await this.makeApp()
            const res = await this.app.getAddress(hdPath, false, true)

            console.log('[LedgerBridge][unlock] this.app.getAddress res:', res)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })

            console.log('[LedgerBridge][unlock] sentMessageToExtension:', res)
        } catch (err) {
            console.log('[LedgerBridge][unlock] error:', err)
            const e = this.ledgerErrToMessage(err)

            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        }
    }

    async signTransaction (replyAction, hdPath, tx, to) {
        console.log('[LedgerBridge][signTransaction] called:', replyAction, hdPath, tx, to)
        try {
            await this.makeApp()
            if (to) {
                const isKnownERC20Token = byContractAddress(to)
                if (isKnownERC20Token) await this.app.provideERC20TokenInformation(isKnownERC20Token)
            }
            const res = await this.app.signTransaction(hdPath, tx)

            console.log('[LedgerBridge][signTransaction] res:', res)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })

        } catch (err) {
            console.log('[LedgerBridge][signTransaction] err:', err)
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        }
    }

    async signPersonalMessage (replyAction, hdPath, message) {
        console.log('[LedgerBridge][signPersonalMessage] called:', replyAction, hdPath, message)
        try {
            await this.makeApp()
            const res = await this.app.signPersonalMessage(hdPath, message)

            console.log('[LedgerBridge][signPersonalMessage] res:', res)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            console.log('[LedgerBridge][signPersonalMessage] error:', err)
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        }
    }

    ledgerErrToMessage (err) {
        const isU2FError = (err) => !!err && !!(err).metaData
        const isStringError = (err) => typeof err === 'string'
        const isWrongAppError = (err) => err.message && err.message.includes('6804')
        const isLedgerLockedError = (err) => err.message && err.message.includes('OpenFailed')
        const isErrorWithId = (err) => err.hasOwnProperty('id') && err.hasOwnProperty('message')

        // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
        if (isU2FError(err)) {
            // Timeout
            if (err.metaData.code === 5) {
                return 'LEDGER_TIMEOUT'
            }

            return err.metaData.type
        }

        if(isWrongAppError(err)) {
            return 'LEDGER_WRONG_APP'
        }
        if(isLedgerLockedError(err)) {
            return 'LEDGER_LOCKED'
        }

        if (isStringError(err)) {
            // Wrong app logged into
            if (err.includes('6804')) {
                return 'LEDGER_WRONG_APP'
            }
            // Ledger locked
            if (err.includes('6801')) {
                return 'LEDGER_LOCKED'
            }

            return err
        }

        if (isErrorWithId(err)) {
            // Browser doesn't support U2F
            if (err.message.includes('U2F not supported')) {
                return 'U2F_NOT_SUPPORTED'
            }
        }

        // Other
        return err.toString()
    }

}

