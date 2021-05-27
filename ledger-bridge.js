'use strict'
require('buffer')

import TransportU2F from '@ledgerhq/hw-transport-u2f'
import LedgerEth from '@ledgerhq/hw-app-eth'
import { byContractAddress } from '@ledgerhq/hw-app-eth/erc20'
import WebSocketTransport from '@ledgerhq/hw-transport-http/lib/WebSocketTransport'

// URL which triggers Ledger Live app to open and handle communication
const BRIDGE_URL = 'ws://localhost:8435'

// Number of seconds to poll for Ledger Live and Ethereum app opening
const TRANSPORT_CHECK_DELAY = 1000
const TRANSPORT_CHECK_LIMIT = 120

export default class LedgerBridge {
    constructor () {
        this.addEventListeners()
        this.useLedgerLive = false
    }

    addEventListeners () {
        window.addEventListener('message', async e => {
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
                        break
                    case 'ledger-update-transport':
                        this.updateLedgerLivePreference(replyAction, params.useLedgerLive)
                        break
                    case 'ledger-sign-typed-data':
                        this.signTypedData(replyAction, params.hdPath, params.domainSeparatorHex, params.hashStructMessageHex)
                        break
                }
            }
        }, false)
    }

    sendMessageToExtension (msg) {
        window.parent.postMessage(msg, '*')
    }

    delay (ms) {
        return new Promise((success) => setTimeout(success, ms))
    }

    checkTransportLoop (i) {
        const iterator = i || 0
        return WebSocketTransport.check(BRIDGE_URL).catch(async () => {
            await this.delay(TRANSPORT_CHECK_DELAY)
            if (iterator < TRANSPORT_CHECK_LIMIT) {
                return this.checkTransportLoop(iterator + 1)
            } else {
                throw new Error('Ledger transport check timeout')
            }
        })
    }

    async makeApp () {
        try {
            if (this.useLedgerLive) {
                let reestablish = false;
                try {
                    await WebSocketTransport.check(BRIDGE_URL)
                } catch (_err) {
                    window.open('ledgerlive://bridge?appName=Ethereum')
                    await this.checkTransportLoop()
                    reestablish = true;
                }
                if (!this.app || reestablish) {
                    this.transport = await WebSocketTransport.open(BRIDGE_URL)
                    this.app = new LedgerEth(this.transport)
                }
            }
            else {
                this.transport = await TransportU2F.create()
                this.app = new LedgerEth(this.transport)
            }
        } catch (e) {
            console.log('LEDGER:::CREATE APP ERROR', e)
            throw e
        }
    }

    updateLedgerLivePreference (replyAction, useLedgerLive) {
        this.useLedgerLive = useLedgerLive
        this.cleanUp()
        this.sendMessageToExtension({
            action: replyAction,
            success: true,
        })
    }

    cleanUp (replyAction) {
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

    async unlock (replyAction, hdPath) {
        try {
            await this.makeApp()
            const res = await this.app.getAddress(hdPath, false, true)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })
        } finally {
            if (!this.useLedgerLive) { 
                this.cleanUp()
            }
        }
    }

    async signTransaction (replyAction, hdPath, tx, to) {
        try {
            await this.makeApp()
            if (to) {
                const isKnownERC20Token = byContractAddress(to)
                if (isKnownERC20Token) await this.app.provideERC20TokenInformation(isKnownERC20Token)
            }
            const res = await this.app.signTransaction(hdPath, tx)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })

        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            if (!this.useLedgerLive) { 
                this.cleanUp()
            }
        }
    }

    async signPersonalMessage (replyAction, hdPath, message) {
        try {
            await this.makeApp()

            const res = await this.app.signPersonalMessage(hdPath, message)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            if (!this.useLedgerLive) { 
                this.cleanUp()
            }
        }
    }

    async signTypedData (replyAction, hdPath, domainSeparatorHex, hashStructMessageHex) {
        try {
            await this.makeApp()
            const res = await this.app.signEIP712HashedMessage(hdPath, domainSeparatorHex, hashStructMessageHex)
            
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            this.cleanUp()
        }
    }

    ledgerErrToMessage (err) {
        const isU2FError = (err) => !!err && !!(err).metaData
        const isStringError = (err) => typeof err === 'string'
        const isErrorWithId = (err) => err.hasOwnProperty('id') && err.hasOwnProperty('message')
        const isWrongAppError = (err) => String(err.message || err).includes('6804')
        const isLedgerLockedError = (err) => err.message && err.message.includes('OpenFailed')

        // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
        if (isU2FError(err)) {
          if (err.metaData.code === 5) {
            return 'LEDGER_TIMEOUT'
          }
          return err.metaData.type
        }

        if (isWrongAppError(err)) {
            return 'LEDGER_WRONG_APP'
        }

        if (isLedgerLockedError(err) || (isStringError(err) && err.includes('6801'))) {
            return 'LEDGER_LOCKED'
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
