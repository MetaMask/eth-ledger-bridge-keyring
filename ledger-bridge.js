'use strict'

require('buffer')

import TransportU2F from '@ledgerhq/hw-transport-u2f'
import LedgerEth from '@ledgerhq/hw-app-eth'
import { translateRaw } from 'translations'

export default class LedgerBridge {
    constructor(){
        this.addEventListeners()
    }

    addEventListeners() {
        window.addEventListener('message', async e => {
            if(e && e.data && e.data.target === 'LEDGER-IFRAME'){
                const { action, params } = e.data
                console.log('[IFRAME]: GOT A MESSAGE!', action, params)
                const replyAction = `${action}-reply`
                switch (action) {
                    case 'ledger-unlock':
                        this.unlock(replyAction, params.hdPath)
                    break
                    case 'ledger-sign-transaction':
                        this.signTransaction(replyAction, params.hdPath, params.tx)
                    break
                    case 'ledger-sign-personal-message':
                        this.signPersonalMessage(replyAction, params.hdPath, params.message)
                    break
                    }
            }
        }, false)
    }

    sendMessageToExtension(msg){
        console.log('[IFRAME]: SENDING MESSAGE!', msg)
        window.parent.postMessage(msg, '*')
    }

    async makeApp() {
        this.transport = await TransportU2F.create()
        this.app =  new LedgerEth(this.transport)
    }

    cleanUp () {
        this.app = null
        this.transport.close()
    }

    async unlock(replyAction, hdPath){
        console.log('[IFRAME]: unlock', replyAction, hdPath)
        try {
            await this.makeApp()
            const res = await this.app.getAddress(hdPath, false, true)

            this.sendMessageToExtension({
                action: replyAction,
                success: true,
                payload: res,
            })

        } catch (err) {
            const e = this.ledgerErrToMessage(err);

            this.sendMessageToExtension({
                action: replyAction,
                success: false,
                payload: { error: e.toString() },
            })

        } finally {
            this.cleanUp()
        }
    }

    async signTransaction(replyAction, hdPath, tx) {
        try {
            await this.makeApp()
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
            this.cleanUp()
        }
    }

    async signPersonalMessage(replyAction, hdPath, message){
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
            this.cleanUp()
        }
    }

    ledgerErrToMessage(err) {
        const isU2FError = (err) => !!err && !!(err).metaData
        const isStringError = (err) => typeof err === 'string'
        const isErrorWithId = (err)  => err.hasOwnProperty('id') && err.hasOwnProperty('message')

        // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
        if (isU2FError(err)) {
          // Timeout
          if (err.metaData.code === 5) {
            return translateRaw('LEDGER_TIMEOUT')
          }

          return err.metaData.type
        }

        if (isStringError(err)) {
          // Wrong app logged into
          if (err.includes('6804')) {
            return translateRaw('LEDGER_WRONG_APP')
          }
          // Ledger locked
          if (err.includes('6801')) {
            return translateRaw('LEDGER_LOCKED')
          }

          return err
        }

        if (isErrorWithId(err)) {
          // Browser doesn't support U2F
          if (err.message.includes('U2F not supported')) {
            return translateRaw('U2F_NOT_SUPPORTED')
          }
        }

        // Other
        return err.toString()
    }

}

