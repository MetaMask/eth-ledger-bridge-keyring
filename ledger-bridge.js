'use strict'
require('buffer')

import TransportU2F from '@ledgerhq/hw-transport-u2f'
import TransportWebHID from '@ledgerhq/hw-transport-webhid'
import LedgerEth from '@ledgerhq/hw-app-eth'
import WebSocketTransport from '@ledgerhq/hw-transport-http/lib/WebSocketTransport'

// URL which triggers Ledger Live app to open and handle communication
const BRIDGE_URL = 'ws://localhost:8435'

// Number of seconds to poll for Ledger Live and Ethereum app opening
const TRANSPORT_CHECK_DELAY = 1000
const TRANSPORT_CHECK_LIMIT = 120

// Connection hearbeat polling
const HEARTBEAT_POLLING_INTERVAL = 5000

export default class LedgerBridge {
    constructor () {
        this.addEventListeners()
        this.transportType = 'u2f'
    }

    addEventListeners () {
        window.addEventListener('message', async e => {
            if (e && e.data && e.data.target === 'LEDGER-IFRAME') {
                const { action, params, messageId } = e.data
                const replyAction = `${action}-reply`

                switch (action) {
                    case 'ledger-unlock':
                        this.unlock(replyAction, params.hdPath, messageId)
                        break
                    case 'ledger-sign-transaction':
                        this.signTransaction(replyAction, params.hdPath, params.tx, messageId)
                        break
                    case 'ledger-sign-personal-message':
                        this.signPersonalMessage(replyAction, params.hdPath, params.message, messageId)
                        break
                    case 'ledger-close-bridge':
                        this.cleanUp(replyAction, messageId)
                        this.clearPollingInterval()
                        break
                    case 'ledger-update-transport':
                        if (params.transportType === 'ledgerLive' || params.useLedgerLive) {
                            this.updateTransportTypePreference(replyAction, 'ledgerLive', messageId)
                        } else if (params.transportType === 'webhid') {
                            this.updateTransportTypePreference(replyAction, 'webhid', messageId)
                        } else {
                           this.updateTransportTypePreference(replyAction, 'u2f', messageId)
                        }
                        break
                    case 'ledger-make-app':
                        this.attemptMakeApp(replyAction, messageId);
                        break
                    case 'ledger-sign-typed-data':
                        this.signTypedData(replyAction, params.hdPath, params.domainSeparatorHex, params.hashStructMessageHex, messageId)
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

    async attemptMakeApp (replyAction, messageId) {
        try {
            await this.makeApp({ openOnly: true })
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                messageId,
            })
        } catch (error) {
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                messageId,
                error,
            })
        }
    }

    async makeApp (config = {}) {
        try {
            if (this.transportType === 'ledgerLive') {
                let reestablish = false
                try {
                    await WebSocketTransport.check(BRIDGE_URL)
                } catch (_err) {
                    window.open('ledgerlive://bridge?appName=Ethereum')
                    await this.checkTransportLoop()
                    reestablish = true
                }
                if (!this.app || reestablish) {
                    this.transport = await WebSocketTransport.open(BRIDGE_URL)
                    this.app = new LedgerEth(this.transport)
                }
            } else if (this.transportType === 'webhid') {
                const device = this.transport && this.transport.device
                const nameOfDeviceType = device && device.constructor.name
                const deviceIsOpen = device && device.opened
                if (this.app && nameOfDeviceType === 'HIDDevice' && deviceIsOpen) {
                    return
                }
                this.transport = config.openOnly
                ? await TransportWebHID.openConnected()
                : await TransportWebHID.create()
                this.app = new LedgerEth(this.transport)
            } else {
                this.transport = await TransportU2F.create()
                this.app = new LedgerEth(this.transport)
            }

            if(this.transport) {
                this.onConnect()
                this.transport.on('disconnect', (event) => {
                    this.onDisconnect(event)
                })
            }
        } catch (e) {
            console.log('LEDGER:::CREATE APP ERROR', e)
            throw e
        }
    }

    updateTransportTypePreference (replyAction, transportType, messageId) {
        this.transportType = transportType
        this.cleanUp()
        this.clearPollingInterval()
        this.sendMessageToExtension({
            action: replyAction,
            success: true,
            messageId,
        })
    }

    async cleanUp (replyAction, messageId) {
        this.app = null
        if (this.transport) {
            await this.transport.close()
            this.transport = null
        }
        if (replyAction) {
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                messageId,
            })
        }
    }

    clearPollingInterval() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval)
        }
    }

    async unlock (replyAction, hdPath, messageId) {
        try {
            await this.makeApp()
            const res = await this.app.getAddress(hdPath, false, true)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
                messageId,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e },
                messageId,
            })
        } finally {
            if (this.transportType !== 'ledgerLive') {
                this.cleanUp()
                this.clearPollingInterval()
            }
        }
    }

    async signTransaction (replyAction, hdPath, tx, messageId) {
        try {
            await this.makeApp()
            const res = await this.app.signTransaction(hdPath, tx)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
                messageId,
            })

        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e },
                messageId,
            })

        } finally {
            if (this.transportType !== 'ledgerLive') {
                this.cleanUp()
                this.clearPollingInterval()
            }
        }
    }

    async signPersonalMessage (replyAction, hdPath, message, messageId) {
        try {
            await this.makeApp()

            const res = await this.app.signPersonalMessage(hdPath, message)
            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
                messageId,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e },
                messageId,
            })

        } finally {
            if (this.transportType !== 'ledgerLive') {
                this.cleanUp()
                this.clearPollingInterval()
            }
        }
    }

    async signTypedData (replyAction, hdPath, domainSeparatorHex, hashStructMessageHex, messageId) {
        try {
            await this.makeApp()
            const res = await this.app.signEIP712HashedMessage(hdPath, domainSeparatorHex, hashStructMessageHex)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
                messageId,
            })
        } catch (err) {
            const e = this.ledgerErrToMessage(err)
            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e },
                messageId,
            })

        } finally {
            this.cleanUp()
            this.clearPollingInterval()
        }
    }

    onConnect() {
        const pollConnection = async () => {
            // Per the Ledger team, this code tells us that the 
            // correct application is opened
            // https://github.com/LedgerHQ/ledger-live-common/blob/master/src/hw/getAppAndVersion.ts
            try {
                const result = await this.transport.send(0xb0, 0x01, 0x00, 0x00)
                const bufferResult = Buffer.from(result).toString()
                // Ensures the correct app is open
                if(bufferResult.includes('Ethereum')) {
                    // Ensure the device is unlocked by requesting an account
                    // An error of `6b0c` will throw if locked
                    const { address } = await this.app.getAddress(`44'/60'/0'/0`, false, true)
                    if (address) {
                        this.sendConnectionMessage(true)
                    }
                    else {
                        this.sendConnectionMessage(false)
                    }
                }
                // The incorrect app is open
                else {
                    // What to do?
                    this.sendConnectionMessage(false)
                }
            } catch(e) {
                // "An action was already pending on the Ledger device. Please deny or reconnect."
                if (e.name === "TransportRaceCondition") {
                    // Make no change ?
                    this.sendConnectionMessage(false)
                }
                else {
                    // Error, the Ledger is likely locked
                    this.onDisconnect()
                }
            }
        };

        this.pollingInterval = setInterval(pollConnection, HEARTBEAT_POLLING_INTERVAL)
    }

    onDisconnect() {
        this.cleanUp()
        this.clearPollingInterval()
        this.sendConnectionMessage(false)
    }

    sendConnectionMessage(connected) {
        this.sendMessageToExtension({
            action: 'ledger-connection-change',
            success: true,
            payload: { connected }
        })
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
            return new Error('LEDGER_TIMEOUT')
          }
          return err.metaData.type
        }

        if (isWrongAppError(err)) {
            return new Error('LEDGER_WRONG_APP')
        }

        if (isLedgerLockedError(err) || (isStringError(err) && err.includes('6801'))) {
            return new Error('LEDGER_LOCKED')
        }

        if (isErrorWithId(err)) {
          // Browser doesn't support U2F
          if (err.message.includes('U2F not supported')) {
            return new Error('U2F_NOT_SUPPORTED')
          }
        }

        // Other
        return err
    }
}
