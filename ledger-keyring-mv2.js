const {
  BaseLedgerKeyring,
  KEYRING_TYPE,
  CONNECTION_EVENT,
} = require('./base-ledger-keyring')

class LedgerKeyringMv2 extends BaseLedgerKeyring {
  init () {
    this.iframeLoaded = false
    this._setupIframe()

    this.currentMessageId = 0
    this.messageCallbacks = {}
    this._setupListener()

    return Promise.resolve()
  }

  destroy () {
    window.removeEventListener('message', this._eventListener)

    return Promise.resolve()
  }

  _setupIframe () {
    this.iframe = document.createElement('iframe')
    this.iframe.src = this.bridgeUrl
    this.iframe.allow = `hid 'src'`
    this.iframe.onload = async () => {
      // If the ledger live preference was set before the iframe is loaded,
      // set it after the iframe has loaded
      this.iframeLoaded = true
      if (this.delayedPromise) {
        try {
          const result = await this.updateTransportMethod(
            this.delayedPromise.transportType,
          )
          this.delayedPromise.resolve(result)
        } catch (e) {
          this.delayedPromise.reject(e)
        } finally {
          delete this.delayedPromise
        }
      }
    }
    document.head.appendChild(this.iframe)
  }

  _setupListener () {
    this._eventListener = ({ origin, data }) => {
      if (origin !== this._getOrigin()) {
        return false
      }

      if (data) {
        if (this.messageCallbacks[data.messageId]) {
          this.messageCallbacks[data.messageId](data)
        } else if (data.action === CONNECTION_EVENT) {
          this.isDeviceConnected = data.payload.connected
        }
      }

      return undefined
    }
    window.addEventListener('message', this._eventListener)
  }

  attemptMakeApp () {
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: 'ledger-make-app',
        },
        ({ success, error }) => {
          if (success) {
            resolve(true)
          } else {
            reject(error)
          }
        },
      )
    })
  }

  updateTransportMethod (transportType) {
    return new Promise((resolve, reject) => {
      // If the iframe isn't loaded yet, let's store the desired transportType value and
      // optimistically return a successful promise
      if (!this.iframeLoaded) {
        this.delayedPromise = {
          resolve,
          reject,
          transportType,
        }
        return
      }

      this._sendMessage(
        {
          action: 'ledger-update-transport',
          params: { transportType },
        },
        ({ success }) => {
          if (success) {
            resolve(true)
          } else {
            reject(new Error('Ledger transport could not be updated'))
          }
        },
      )
    })
  }

  _getPublicKey (params) {
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: 'ledger-unlock',
          params,
        },
        ({ success, payload }) => {
          if (success) {
            resolve(payload)
          }
          // eslint-disable-next-line prefer-promise-reject-errors
          reject(payload && payload.error)
        },
      )
    })
  }

  _deviceSignTransaction (params) {
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: 'ledger-sign-transaction',
          params,
        },
        ({ success, payload }) => {
          if (success) {
            resolve(payload)
          }
          // eslint-disable-next-line prefer-promise-reject-errors
          reject(payload && payload.error)
        },
      )
    })
  }

  _deviceSignMessage (params) {
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: 'ledger-sign-personal-message',
          params,
        },
        ({ success, payload }) => {
          if (success) {
            resolve(payload)
          }
          // eslint-disable-next-line prefer-promise-reject-errors
          reject(payload && payload.error)
        },
      )
    })
  }

  _deviceSignTypedData (params) {
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: 'ledger-sign-typed-data',
          params,
        },
        ({ success, payload }) => {
          if (success) {
            resolve(payload)
          }
          // eslint-disable-next-line prefer-promise-reject-errors
          reject(payload && payload.error)
        },
      )
    })
  }

  _sendMessage (msg, cb) {
    msg.target = 'LEDGER-IFRAME'

    this.currentMessageId += 1
    msg.messageId = this.currentMessageId

    this.messageCallbacks[this.currentMessageId] = cb
    this.iframe.contentWindow.postMessage(msg, '*')
  }
}

LedgerKeyringMv2.type = KEYRING_TYPE
module.exports = LedgerKeyringMv2
