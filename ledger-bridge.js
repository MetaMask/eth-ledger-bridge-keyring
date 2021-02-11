'use strict'
require('buffer')

const USE_LIVE = (() => {
    try {
        const searchParams = new URLSearchParams(document.location.search)
        return searchParams.get('useLedgerLive') === 'true' && 'usb' in navigator
    }
    catch(e) {
        return false
    }
})()
console.info(`[LedgerBridgeIFrame] Using LedgerLive? `, USE_LIVE ? 'Yes' : 'No')

import TransportU2F from '@ledgerhq/hw-transport-u2f'
import LedgerEth from '@ledgerhq/hw-app-eth'
import { byContractAddress } from '@ledgerhq/hw-app-eth/erc20'

import WebSocketTransport from '@ledgerhq/hw-transport-http/lib/WebSocketTransport'
const BRIDGE_URL = 'ws://localhost:8435'

// Number of seconds to poll for Ledger Live and Ethereum app opening
const TRANSPORT_CHECK_LIMIT = 30
const TRANSPORT_CHECK_DELAY = 1000

console.log('[LedgerBridgeIFrame] File loaded!')

export default class LedgerBridge {
    constructor () {
        console.log('[LedgerBridgeIFrame][constructor] called!')
        this.addEventListeners()
    }

    addEventListeners () {
        console.log('[LedgerBridgeIFrame][addListeners] called!')
        window.addEventListener('message', async e => {
            console.log('[LedgerBridgeIFrame][addListeners] message received!', e)
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
                }
            }
        }, false)
    }

    sendMessageToExtension(msg) {
        console.log('[LedgerBridgeIFrame][sendMessageToExtension] message!', msg)
        window.parent.postMessage(msg, '*')
    }

    delay(ms) {
        return new Promise((success) => setTimeout(success, ms))
    }

    checkTransportLoop(i) {
        console.log('[LedgerBridgeIFrame][checkTransportLoop] i!', i)
        const iterator = i || 0
        return WebSocketTransport.check(BRIDGE_URL).catch(async () => {
            console.log('[LedgerBridgeIFrame][WebSocketTransport.check.catch] message!', i)
            await this.delay(TRANSPORT_CHECK_DELAY)
            if (iterator < TRANSPORT_CHECK_LIMIT) {
                return this.checkTransportLoop(iterator + 1)
            } else {
                throw new Error('Ledger transport check timeout')
            }
        })
    }


    async makeApp () {
        console.log('[LedgerBridgeIFrame][makeApp] called!')
        try {
            if (USE_LIVE) { // Ledger Live
                console.log('[LedgerBridgeIFrame][makeApp] About the check WebTransport!')
                await WebSocketTransport.check(BRIDGE_URL).catch(async () => {
                    console.log('[LedgerBridgeIFrame][makeApp] WebSocketTransport catch')
                    window.open('ledgerlive://bridge?appName=Ethereum')
                    await this.checkTransportLoop()
                    this.transport = await WebSocketTransport.open(BRIDGE_URL)
                    this.app = new LedgerEth(this.transport)
                    console.log('[LedgerBridgeIFrame][makeApp] this.transport, app: ', this.transport, this.app)
                })
            }
            else { // U2F
                console.log('[LedgerBridgeIFrame][makeApp] Using U2F!')
                this.transport = await TransportU2F.create()
                this.app = new LedgerEth(this.transport)
            }
        } catch (e) {
            console.log('LEDGER:::CREATE APP ERROR', e)
        }
    }

    cleanUp (replyAction) {
        console.log('[LedgerBridgeIFrame][cleanUp] called')
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
        console.log('[LedgerBridgeIFrame][unlock] called')
        try {
            await this.makeApp()

            const res = await this.app.getAddress(hdPath, false, true)
            console.log('[LedgerBridgeIFrame][unlock] Got address: ', res)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            console.warn('[LedgerBridgeIFrame][unlock] error:', err, replyAction)
            const e = this.ledgerErrToMessage(err)

            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })
        } finally {
            if (!USE_LIVE) {
                this.cleanUp()
            }
        }
    }

    async signTransaction (replyAction, hdPath, tx, to) {
        console.log('[LedgerBridgeIFrame][signTransaction] called:', replyAction, hdPath, tx, to)

        try {
            await this.makeApp()
            if (to) {
                const isKnownERC20Token = byContractAddress(to)
                if (isKnownERC20Token) await this.app.provideERC20TokenInformation(isKnownERC20Token)
            }
            const res = await this.app.signTransaction(hdPath, tx)
        
            console.log('[LedgerBridgeIFrame][signTransaction] res:', res)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })

        } catch (err) {
            console.log('[LedgerBridgeIFrame][signTransaction] err:', err)

            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            if (!USE_LIVE) {
                this.cleanUp()
            }
        }
    }

    async signPersonalMessage (replyAction, hdPath, message) {
        console.log('[LedgerBridgeIFrame][signPersonalMessage] called:', replyAction, hdPath, message)

        try {
            await this.makeApp()
            const res = await this.app.signPersonalMessage(hdPath, message)

            console.log('[LedgerBridgeIFrame][signPersonalMessage] res:', res)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })
        } catch (err) {
            console.log('[LedgerBridgeIFrame][signPersonalMessage] error:', err)
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            if (!USE_LIVE) {
                this.cleanUp()
            }
        }
    }

    ledgerErrToMessage (err) {
        const isU2FError = (err) => !!err && !!(err).metaData
        const isStringError = (err) => typeof err === 'string'
        const isErrorWithId = (err) => err.hasOwnProperty('id') && err.hasOwnProperty('message')
        const isWrongAppError = (err) => err.message && err.message.includes('6804')
        const isLedgerLockedError = (err) => err.message && err.message.includes('OpenFailed')

        // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
        if (isU2FError(err)) {
          // Timeout
          if (err.metaData.code === 5) {
            return 'LEDGER_TIMEOUT'
          }

          return err.metaData.type
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
