const CONNECTION_EVENT = 'ledger-connection-change'

class LedgerIframeBridge {
  init (bridgeUrl) {
    this.iframeLoaded = false
    this._setupIframe(bridgeUrl)

    this.currentMessageId = 0
    this.messageCallbacks = {}
    this._setupListener(bridgeUrl)

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
    return this._deviceActionMessage('ledger-unlock', params)
  }

  deviceSignTransaction (params) {
    return this._deviceActionMessage('ledger-sign-transaction', params)
  }

  deviceSignMessage (params) {
    return this._deviceActionMessage('ledger-sign-personal-message', params)
  }

  deviceSignTypedData (params) {
    return this._deviceActionMessage('ledger-sign-typed-data', params)
  }

  _deviceActionMessage (action, params) {
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action,
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

  _setupIframe (bridgeUrl) {
    this.iframe = document.createElement('iframe')
    this.iframe.src = bridgeUrl
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

  _getOrigin (bridgeUrl) {
    const tmp = bridgeUrl.split('/')
    tmp.splice(-1, 1)
    return tmp.join('/')
  }

  _setupListener (bridgeUrl) {
    this._eventListener = ({ origin, data }) => {
      if (origin !== this._getOrigin(bridgeUrl)) {
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
  LedgerIframeBridge,
}
