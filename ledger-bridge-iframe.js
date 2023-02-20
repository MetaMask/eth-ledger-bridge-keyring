const CONNECTION_EVENT = 'ledger-connection-change'

class LedgerBridgeIframe {
  init (bridgeUrl) {
    this.bridgeUrl = bridgeUrl
    this.iframeLoaded = false
    this._setupIframe(bridgeUrl)

    this.currentMessageId = 0
    this.messageCallbacks = {}
    this._setupListener()

    return Promise.resolve()
  }

  destroy () {
    window.removeEventListener('message', this._eventListener)

    return Promise.resolve()
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

  getPublicKey (params) {
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

  deviceSignTransaction (params) {
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

  deviceSignMessage (params) {
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

  deviceSignTypedData (params) {
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

  _getOrigin () {
    const tmp = this.bridgeUrl.split('/')
    tmp.splice(-1, 1)
    return tmp.join('/')
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

  _sendMessage (msg, cb) {
    msg.target = 'LEDGER-IFRAME'

    this.currentMessageId += 1
    msg.messageId = this.currentMessageId

    this.messageCallbacks[this.currentMessageId] = cb
    this.iframe.contentWindow.postMessage(msg, '*')
  }
}

module.exports = {
  LedgerBridgeIframe,
}
