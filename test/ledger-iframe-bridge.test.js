global.document = require('./document.shim')
global.window = require('./window.shim')

const chai = require('chai')
const spies = require('chai-spies')

const { LedgerIframeBridge } = require('../ledger-iframe-bridge')

const { expect } = chai

chai.use(spies)

describe('LedgerIframeBridge', function () {
  let bridge
  let sandbox

  beforeEach(function () {
    bridge = new LedgerIframeBridge()
    sandbox = chai.spy.sandbox()
  })

  afterEach(function () {
    sandbox.restore()
  })

  describe('init', function () {
    it('should set up the iFrame', async function () {
      const iframeMock = {}
      sandbox.on(global.document, 'createElement', () => iframeMock)
      sandbox.on(global.document.head, 'appendChild')
      sandbox.on(global.window, 'addEventListener')

      await bridge.init()

      expect(global.document.createElement).to.have.been.called()
      expect(global.document.createElement)
        .to.have.been.called.with('iframe')

      expect(global.document.head.appendChild).to.have.been.called()
      expect(global.document.head.appendChild)
        .to.have.been.called.with(iframeMock)

      expect(global.window.addEventListener).to.have.been.called()
      expect(global.window.addEventListener)
        .to.have.been.called.with('message', bridge._eventListener)

      expect(bridge.iframeLoaded).to.equal(false)
      expect(bridge.currentMessageId).to.equal(0)
      expect(bridge.messageCallbacks).to.deep.equal({})
    })
  })

  describe('destroy', function () {
    it('should remove the message event listener', async function () {
      sandbox.on(global.window, 'removeEventListener')

      await bridge.destroy()

      expect(global.window.removeEventListener).to.have.been.called()
      expect(global.window.removeEventListener)
        .to.have.been.called.with('message', bridge._eventListener)
    })
  })

  describe('attemptMakeApp', function () {
    it('should successfully send a ledger-make-app message', async function () {
      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: true })
      })

      const result = await bridge.attemptMakeApp()

      expect(result).to.equal(true)

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({ action: 'ledger-make-app' })
    })

    it('should throw an error when a ledger-make-app message is not successful', async function () {
      const errorMessage = 'Ledger Error'

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: false, error: new Error(errorMessage) })
      })

      try {
        await bridge.attemptMakeApp()
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.name).to.be.equal('Error')
        expect(error.message).to.be.equal(errorMessage)
      }

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({ action: 'ledger-make-app' })
    })
  })

  describe('updateTransportMethod', function () {
    it('should successfully send a ledger-update-transport message', async function () {
      bridge.iframeLoaded = true

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: true })
      })

      const transportType = 'u2f'

      const result = await bridge.updateTransportMethod(transportType)

      expect(result).to.equal(true)

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-update-transport',
          params: { transportType },
        })
    })

    it('should throw an error when a ledger-update-transport message is not successful', async function () {
      bridge.iframeLoaded = true

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: false })
      })

      const transportType = 'u2f'

      try {
        await bridge.updateTransportMethod(transportType)
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.name).to.be.equal('Error')
        expect(error.message).to.be.equal('Ledger transport could not be updated')
      }

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-update-transport',
          params: { transportType },
        })
    })
  })

  describe('getPublicKey', function () {
    it('should successfully send a ledger-unlock message', async function () {
      const payload = {}

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: true, payload })
      })

      const params = {}

      const result = await bridge.getPublicKey(params)

      expect(result).to.equal(payload)

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-unlock',
          params,
        })
    })

    it('should throw an error when a ledger-unlock message is not successful', async function () {
      const errorMessage = 'Ledger Error'

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: false, payload: { error: new Error(errorMessage) } })
      })

      const params = {}

      try {
        await bridge.getPublicKey(params)
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.name).to.be.equal('Error')
        expect(error.message).to.be.equal(errorMessage)
      }

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-unlock',
          params,
        })
    })
  })

  describe('deviceSignTransaction', function () {
    it('should successfully send a ledger-sign-transaction message', async function () {
      const payload = {}

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: true, payload })
      })

      const params = {}

      const result = await bridge.deviceSignTransaction(params)

      expect(result).to.equal(payload)

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-sign-transaction',
          params,
        })
    })

    it('should throw an error when a ledger-sign-transaction message is not successful', async function () {
      const errorMessage = 'Ledger Error'

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: false, payload: { error: new Error(errorMessage) } })
      })

      const params = {}

      try {
        await bridge.deviceSignTransaction(params)
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.name).to.be.equal('Error')
        expect(error.message).to.be.equal(errorMessage)
      }

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-sign-transaction',
          params,
        })
    })
  })

  describe('deviceSignMessage', function () {
    it('should successfully send a ledger-sign-personal-message message', async function () {
      const payload = {}

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: true, payload })
      })

      const params = {}

      const result = await bridge.deviceSignMessage(params)

      expect(result).to.equal(payload)

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-sign-personal-message',
          params,
        })
    })

    it('should throw an error when a ledger-sign-personal-message message is not successful', async function () {
      const errorMessage = 'Ledger Error'

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: false, payload: { error: new Error(errorMessage) } })
      })

      const params = {}

      try {
        await bridge.deviceSignMessage(params)
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.name).to.be.equal('Error')
        expect(error.message).to.be.equal(errorMessage)
      }

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-sign-personal-message',
          params,
        })
    })
  })

  describe('deviceSignTypedData', function () {
    it('should successfully send a ledger-sign-typed-data message', async function () {
      const payload = {}

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: true, payload })
      })

      const params = {}

      const result = await bridge.deviceSignTypedData(params)

      expect(result).to.equal(payload)

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-sign-typed-data',
          params,
        })
    })

    it('should throw an error when a ledger-sign-typed-data message is not successful', async function () {
      const errorMessage = 'Ledger Error'

      sandbox.on(bridge, '_sendMessage', (_, callback) => {
        callback({ success: false, payload: { error: new Error(errorMessage) } })
      })

      const params = {}

      try {
        await bridge.deviceSignTypedData(params)
      } catch (error) {
        expect(error).to.be.an('error')
        expect(error.name).to.be.equal('Error')
        expect(error.message).to.be.equal(errorMessage)
      }

      expect(bridge._sendMessage).to.have.been.called()
      expect(bridge._sendMessage)
        .to.have.been.called.with({
          action: 'ledger-sign-typed-data',
          params,
        })
    })
  })
})
