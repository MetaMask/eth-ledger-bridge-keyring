global.document = require('./document.shim')
global.window = require('./window.shim')

const assert = require('assert')
const chai = require('chai')
const spies = require('chai-spies')
const EthereumTx = require('ethereumjs-tx')
const HDKey = require('hdkey')
const ethUtil = require('ethereumjs-util')
const { TransactionFactory } = require('@ethereumjs/tx')
const Common = require('@ethereumjs/common').default
const sigUtil = require('eth-sig-util')

const LedgerBridgeKeyring = require('..')

const { expect } = chai

const fakeAccounts = [
  '0xF30952A1c534CDE7bC471380065726fa8686dfB3',
  '0x44fe3Cf56CaF651C4bD34Ae6dbcffa34e9e3b84B',
  '0x8Ee3374Fa705C1F939715871faf91d4348D5b906',
  '0xEF69e24dE9CdEe93C4736FE29791E45d5D4CFd6A',
  '0xC668a5116A045e9162902795021907Cb15aa2620',
  '0xbF519F7a6D8E72266825D770C60dbac55a3baeb9',
  '0x0258632Fe2F91011e06375eB0E6f8673C0463204',
  '0x4fC1700C0C61980aef0Fb9bDBA67D8a25B5d4335',
  '0xeEC5D417152aE295c047FB0B0eBd7c7090dDedEb',
  '0xd3f978B9eEEdB68A38CF252B3779afbeb3623fDf',
  '0xd819fE2beD53f44825F66873a159B687736d3092',
  '0xE761dA62f053ad9eE221d325657535991Ab659bD',
  '0xd4F1686961642340a80334b5171d85Bbd390c691',
  '0x6772C4B1E841b295960Bb4662dceD9bb71726357',
  '0x41bEAD6585eCA6c79B553Ca136f0DFA78A006899',
  '0xf37559520757223264ee707d4e3fdfaa118db9bd',
]

const fakeXPubKey = 'xpub6FnCn6nSzZAw5Tw7cgR9bi15UV96gLZhjDstkXXxvCLsUXBGXPdSnLFbdpq8p9HmGsApME5hQTZ3emM2rnY5agb9rXpVGyy3bdW6EEgAtqt'
const fakeHdKey = HDKey.fromExtendedKey(fakeXPubKey)
const fakeTx = new EthereumTx({
  nonce: '0x00',
  gasPrice: '0x09184e72a000',
  gasLimit: '0x2710',
  to: '0x0000000000000000000000000000000000000000',
  value: '0x00',
  data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
  // EIP 155 chainId - mainnet: 1, ropsten: 3
  chainId: 1,
})

const common = new Common({ chain: 'mainnet' })
const commonEIP1559 = Common.forCustomChain('mainnet', {}, 'london')
const newFakeTx = TransactionFactory.fromTxData({
  nonce: '0x00',
  gasPrice: '0x09184e72a000',
  gasLimit: '0x2710',
  to: '0x0000000000000000000000000000000000000000',
  value: '0x00',
  data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
}, { common, freeze: false })

const fakeTypeTwoTx = TransactionFactory.fromTxData({
  nonce: '0x00',
  maxFeePerGas: '0x19184e72a000',
  maxPriorityFeePerGas: '0x09184e72a000',
  gasLimit: '0x2710',
  to: '0x0000000000000000000000000000000000000000',
  value: '0x00',
  data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
  type: 2,
  v: '0x01',
}, { common: commonEIP1559, freeze: false })

chai.use(spies)

describe('LedgerBridgeKeyring', function () {

  let keyring
  let sandbox

  async function basicSetupToUnlockOneAccount (accountIndex = 0) {
    keyring.setAccountToUnlock(accountIndex)
    await keyring.addAccounts()
    sandbox.on(keyring, 'unlock', (_) => Promise.resolve(fakeAccounts[accountIndex]))
  }

  beforeEach(function () {
    sandbox = chai.spy.sandbox()
    keyring = new LedgerBridgeKeyring()
    keyring.hdk = fakeHdKey
  })

  afterEach(function () {
    sandbox.restore()
  })

  describe('Keyring.type', function () {
    it('is a class property that returns the type string.', function () {
      const { type } = LedgerBridgeKeyring
      assert.equal(typeof type, 'string')
    })

    it('returns the correct value', function () {
      const { type } = keyring
      const correct = LedgerBridgeKeyring.type
      assert.equal(type, correct)
    })
  })

  describe('constructor', function () {
    it('constructs', function (done) {
      const t = new LedgerBridgeKeyring({ hdPath: `m/44'/60'/0'` })
      assert.equal(typeof t, 'object')
      t.getAccounts()
        .then((accounts) => {
          assert.equal(Array.isArray(accounts), true)
          done()
        })
    })
  })

  describe('serialize', function () {
    it('serializes an instance', function (done) {
      keyring.serialize()
        .then((output) => {
          assert.equal(output.bridgeUrl, 'https://metamask.github.io/eth-ledger-bridge-keyring')
          assert.equal(output.hdPath, `m/44'/60'/0'`)
          assert.equal(Array.isArray(output.accounts), true)
          assert.equal(output.accounts.length, 0)
          done()
        })
    })
  })

  describe('deserialize', function () {
    it('serializes what it deserializes', function () {

      const account = fakeAccounts[0]
      const checksum = ethUtil.toChecksumAddress(account)
      const someHdPath = `m/44'/60'/0'/1`
      const accountDetails = {}
      accountDetails[checksum] = {
        index: 0,
        hdPath: someHdPath,
      }
      return keyring.deserialize({
        page: 10,
        hdPath: someHdPath,
        accounts: [account],
        accountDetails,
      })
        .then(() => {
          return keyring.serialize()
        }).then((serialized) => {
          assert.equal(serialized.accounts.length, 1, 'restores 1 account')
          assert.equal(serialized.bridgeUrl, 'https://metamask.github.io/eth-ledger-bridge-keyring', 'restores bridgeUrl')
          assert.equal(serialized.hdPath, someHdPath, 'restores hdPath')
          assert.deepEqual(serialized.accountDetails, accountDetails, 'restores accountDetails')
        })
    })

    it('should migrate accountIndexes to accountDetails', function () {

      const someHdPath = `m/44'/60'/0'/0/0`
      const account = fakeAccounts[1]
      const checksum = ethUtil.toChecksumAddress(account)
      const accountIndexes = {}
      accountIndexes[checksum] = 1
      return keyring.deserialize({
        accounts: [account],
        accountIndexes,
        hdPath: someHdPath,
      })
        .then(() => {
          assert.equal(keyring.hdPath, someHdPath)
          assert.equal(keyring.accounts[0], account)
          assert.deepEqual(keyring.accountDetails[checksum], {
            bip44: true,
            hdPath: `m/44'/60'/1'/0/0`,
          })

        })
    })

    it('should migrate non-bip44 accounts to accountDetails', function () {

      const someHdPath = `m/44'/60'/0'`
      const account = fakeAccounts[1]
      const checksum = ethUtil.toChecksumAddress(account)
      return keyring.deserialize({
        accounts: [account],
        hdPath: someHdPath,
      })
        .then(() => {
          assert.equal(keyring.hdPath, someHdPath)
          assert.equal(keyring.accounts[0], account)
          assert.deepEqual(keyring.accountDetails[checksum], {
            bip44: false,
            hdPath: `m/44'/60'/0'/1`,
          })

        })
    })
  })

  describe('isUnlocked', function () {
    it('should return true if we have a public key', function () {
      assert.equal(keyring.isUnlocked(), true)
    })
  })

  describe('unlock', function () {
    it('should resolve if we have a public key', function (done) {
      keyring.unlock().then((_) => {
        done()
      })
    })
  })

  describe('setHdPath', function () {
    it('should set the hdPath', function (done) {
      const someHDPath = `m/44'/99'/0`
      keyring.setHdPath(someHDPath)
      assert.equal(keyring.hdPath, someHDPath)
      done()
    })

    it('should reset the HDKey if the path changes', function (done) {
      const someHDPath = `m/44'/99'/0`
      keyring.setHdPath(someHDPath)
      assert.equal(keyring.hdk.publicKey, null)
      done()
    })
  })

  describe('setAccountToUnlock', function () {
    it('should set unlockedAccount', function () {
      keyring.setAccountToUnlock(3)
      assert.equal(keyring.unlockedAccount, 3)
    })
  })

  describe('addAccounts', function () {
    describe('with no arguments', function () {
      it('returns a single account', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts()
          .then((accounts) => {
            assert.equal(accounts.length, 1)
            done()
          })
      })
    })

    describe('with a numeric argument', function () {
      it('returns that number of accounts', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts(5)
          .then((accounts) => {
            assert.equal(accounts.length, 5)
            done()
          })
      })

      it('returns the expected accounts', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts(3)
          .then((accounts) => {
            assert.equal(accounts[0], fakeAccounts[0])
            assert.equal(accounts[1], fakeAccounts[1])
            assert.equal(accounts[2], fakeAccounts[2])
            done()
          })
      })
    })

    it('stores account details for bip44 accounts', function () {
      sandbox.on(keyring, 'unlock', (_) => Promise.resolve(fakeAccounts[0]))
      keyring.setHdPath(`m/44'/60'/0'/0/0`)
      keyring.setAccountToUnlock(1)
      return keyring.addAccounts(1)
        .then((accounts) => {
          assert.deepEqual(keyring.accountDetails[accounts[0]], {
            bip44: true,
            hdPath: `m/44'/60'/1'/0/0`,
          })
        })
    })

    it('stores account details for non-bip44 accounts', function () {
      keyring.setHdPath(`m/44'/60'/0'`)
      keyring.setAccountToUnlock(2)
      return keyring.addAccounts(1)
        .then((accounts) => {
          assert.deepEqual(keyring.accountDetails[accounts[0]], {
            bip44: false,
            hdPath: `m/44'/60'/0'/2`,
          })
        })
    })

    describe('when called multiple times', function () {
      it('should not remove existing accounts', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts(1)
          .then(function () {
            keyring.setAccountToUnlock(1)
            keyring.addAccounts(1)
              .then((accounts) => {
                assert.equal(accounts.length, 2)
                assert.equal(accounts[0], fakeAccounts[0])
                assert.equal(accounts[1], fakeAccounts[1])
                done()
              })
          })
      })
    })
  })

  describe('removeAccount', function () {
    describe('if the account exists', function () {
      it('should remove that account', function (done) {
        keyring.setAccountToUnlock(0)
        keyring.addAccounts()
          .then(async (accounts) => {
            assert.equal(accounts.length, 1)
            keyring.removeAccount(fakeAccounts[0])
            const accountsAfterRemoval = await keyring.getAccounts()
            assert.equal(accountsAfterRemoval.length, 0)
            done()
          })
      })
    })

    describe('if the account does not exist', function () {
      it('should throw an error', function () {
        const unexistingAccount = '0x0000000000000000000000000000000000000000'
        expect((_) => {
          keyring.removeAccount(unexistingAccount)
        }).to.throw(`Address ${unexistingAccount} not found in this keyring`)
      })
    })
  })

  describe('getFirstPage', function () {
    it('should set the currentPage to 1', async function () {
      await keyring.getFirstPage()
      assert.equal(keyring.page, 1)
    })

    it('should return the list of accounts for current page', async function () {

      const accounts = await keyring.getFirstPage()

      expect(accounts.length, keyring.perPage)
      expect(accounts[0].address, fakeAccounts[0])
      expect(accounts[1].address, fakeAccounts[1])
      expect(accounts[2].address, fakeAccounts[2])
      expect(accounts[3].address, fakeAccounts[3])
      expect(accounts[4].address, fakeAccounts[4])
    })
  })

  describe('getNextPage', function () {

    it('should return the list of accounts for current page', async function () {
      const accounts = await keyring.getNextPage()
      expect(accounts.length, keyring.perPage)
      expect(accounts[0].address, fakeAccounts[0])
      expect(accounts[1].address, fakeAccounts[1])
      expect(accounts[2].address, fakeAccounts[2])
      expect(accounts[3].address, fakeAccounts[3])
      expect(accounts[4].address, fakeAccounts[4])
    })
  })

  describe('getPreviousPage', function () {

    it('should return the list of accounts for current page', async function () {
      // manually advance 1 page
      await keyring.getNextPage()
      const accounts = await keyring.getPreviousPage()

      expect(accounts.length, keyring.perPage)
      expect(accounts[0].address, fakeAccounts[0])
      expect(accounts[1].address, fakeAccounts[1])
      expect(accounts[2].address, fakeAccounts[2])
      expect(accounts[3].address, fakeAccounts[3])
      expect(accounts[4].address, fakeAccounts[4])
    })

    it('should be able to go back to the previous page', async function () {
      // manually advance 1 page
      await keyring.getNextPage()
      const accounts = await keyring.getPreviousPage()

      expect(accounts.length, keyring.perPage)
      expect(accounts[0].address, fakeAccounts[0])
      expect(accounts[1].address, fakeAccounts[1])
      expect(accounts[2].address, fakeAccounts[2])
      expect(accounts[3].address, fakeAccounts[3])
      expect(accounts[4].address, fakeAccounts[4])
    })
  })

  describe('getAccounts', function () {
    const accountIndex = 5
    let accounts = []
    beforeEach(async function () {
      keyring.setAccountToUnlock(accountIndex)
      await keyring.addAccounts()
      accounts = await keyring.getAccounts()
    })

    it('returns an array of accounts', function () {
      assert.equal(Array.isArray(accounts), true)
      assert.equal(accounts.length, 1)
    })

    it('returns the expected', function () {
      const expectedAccount = fakeAccounts[accountIndex]
      assert.equal(accounts[0], expectedAccount)
    })
  })

  describe('exportAccount', function () {
    it('should throw an error because it is not supported', function () {
      expect((_) => {
        keyring.exportAccount()
      }).to.throw('Not supported on this device')
    })
  })

  describe('forgetDevice', function () {
    it('should clear the content of the keyring', async function () {
      // Add an account
      keyring.setAccountToUnlock(0)
      await keyring.addAccounts()

      // Wipe the keyring
      keyring.forgetDevice()

      const accounts = await keyring.getAccounts()

      assert.equal(keyring.isUnlocked(), false)
      assert.equal(accounts.length, 0)
    })
  })

  describe('signTransaction', function () {
    describe('using old versions of ethereumjs/tx', function () {
      it('should pass serialized transaction to ledger and return signed tx', async function () {
        await basicSetupToUnlockOneAccount()
        sandbox.on(keyring, '_sendMessage', (msg, cb) => {
          assert.deepStrictEqual(msg.params, {
            hdPath: "m/44'/60'/0'/0",
            tx: fakeTx.serialize().toString('hex'),
          })
          cb({ success: true, payload: { v: '0x1', r: '0x0', s: '0x0' } })
        })

        sandbox.on(fakeTx, 'verifySignature', () => true)

        const returnedTx = await keyring.signTransaction(fakeAccounts[0], fakeTx)
        expect(keyring._sendMessage).to.have.been.called()
        expect(returnedTx).to.have.property('v')
        expect(returnedTx).to.have.property('r')
        expect(returnedTx).to.have.property('s')
      })
    })

    describe('using new versions of ethereumjs/tx', function () {
      it('should pass correctly encoded legacy transaction to ledger and return signed tx', async function () {
        // Generated by signing newFakeTx with private key eee0290acfa88cf7f97be7525437db1624293f829b8a2cba380390618d62662b
        const expectedRSV = {
          v: '0x26',
          r: '0xf3a7718999d1b87beda810b25cc025153e74df0745279826b9b2f3d1d1b6318',
          s: '0x7e33bdfbf5272dc4f55649e9ba729849670171a68ef8c0fbeed3b879b90b8954',
        }

        await basicSetupToUnlockOneAccount()

        sandbox.on(newFakeTx, 'verifySignature', () => true)
        sandbox.on(keyring, '_sendMessage', (msg, cb) => {
          assert.deepStrictEqual(msg.params, {
            hdPath: "m/44'/60'/0'/0",
            tx: ethUtil.rlp.encode(newFakeTx.getMessageToSign(false)).toString('hex'),
          })
          cb({ success: true, payload: expectedRSV })
        })

        const returnedTx = await keyring.signTransaction(fakeAccounts[0], newFakeTx, common)
        expect(keyring._sendMessage).to.have.been.called()
        expect(returnedTx.toJSON()).to.deep.equal({ ...newFakeTx.toJSON(), ...expectedRSV })
      })

      it('should pass correctly encoded EIP1559 transaction to ledger and return signed tx', async function () {
        // Generated by signing fakeTypeTwoTx with private key eee0290acfa88cf7f97be7525437db1624293f829b8a2cba380390618d62662b
        const expectedRSV = {
          v: '0x0',
          r: '0x5ffb3adeaec80e430e7a7b02d95c5108b6f09a0bdf3cf69869dc1b38d0fb8d3a',
          s: '0x28b234a5403d31564e18258df84c51a62683e3f54fa2b106fdc1a9058006a112',
        }

        await basicSetupToUnlockOneAccount()

        sandbox.on(fakeTypeTwoTx, 'verifySignature', () => true)
        sandbox.on(keyring, '_sendMessage', (msg, cb) => {
          assert.deepStrictEqual(msg.params, {
            hdPath: "m/44'/60'/0'/0",
            tx: fakeTypeTwoTx.getMessageToSign(false).toString('hex'),
          })
          cb({ success: true, payload: expectedRSV })
        })

        const returnedTx = await keyring.signTransaction(fakeAccounts[0], fakeTypeTwoTx, commonEIP1559)
        expect(keyring._sendMessage).to.have.been.called()
        expect(returnedTx.toJSON()).to.deep.equal({ ...fakeTypeTwoTx.toJSON(), ...expectedRSV })
      })
    })
  })

  describe('signPersonalMessage', function () {
    it('should call create a listener waiting for the iframe response', async function () {
      await basicSetupToUnlockOneAccount()
      sandbox.on(keyring, '_sendMessage', (msg, cb) => {
        assert.deepStrictEqual(msg.params, {
          hdPath: "m/44'/60'/0'/0",
          message: 'some msg',
        })
        cb({ success: true, payload: { v: '0x1', r: '0x0', s: '0x0' } })
      })

      sandbox.on(sigUtil, 'recoverPersonalSignature', () => fakeAccounts[0])
      await keyring.signPersonalMessage(fakeAccounts[0], 'some msg')
      expect(keyring._sendMessage).to.have.been.called()
    })
  })

  describe('signMessage', function () {
    it('should call create a listener waiting for the iframe response', async function () {
      await basicSetupToUnlockOneAccount()
      sandbox.on(keyring, '_sendMessage', (msg, cb) => {
        assert.deepStrictEqual(msg.params, {
          hdPath: "m/44'/60'/0'/0",
          message: 'some msg',
        })
        cb({ success: true, payload: { v: '0x1', r: '0x0', s: '0x0' } })
      })

      sandbox.on(sigUtil, 'recoverPersonalSignature', () => fakeAccounts[0])
      await keyring.signMessage(fakeAccounts[0], 'some msg')
      expect(keyring._sendMessage).to.have.been.called()
    })
  })

  describe('unlockAccountByAddress', function () {
    it('should unlock the given account if found on device', async function () {
      await basicSetupToUnlockOneAccount()
      await keyring.unlockAccountByAddress(fakeAccounts[0])
        .then((hdPath) => {
          assert.equal(hdPath, 'm/44\'/60\'/0\'/0')
        })
    })

    it('should reject if the account is not found on device', async function () {
      const requestedAccount = fakeAccounts[0]
      keyring.setAccountToUnlock(0)
      await keyring.addAccounts()

      assert.rejects(() => keyring.unlockAccountByAddress(requestedAccount), new Error(`Ledger: Account ${fakeAccounts[0]} does not belong to the connected device`))
    })
  })

  describe('signTypedData', function () {
    // This data matches demo data is MetaMask's test dapp
    const fixtureData = {
      'domain': {
        'chainId': 1,
        'name': 'Ether Mail',
        'verifyingContract': '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        'version': '1',
      },
      'message': {
        'contents': 'Hello, Bob!',
        'from': {
          'name': 'Cow',
          'wallets': [
            '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
            '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF',
          ],
        },
        'to': [
          {
            'name': 'Bob',
            'wallets': [
              '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
              '0xB0BdaBea57B0BDABeA57b0bdABEA57b0BDabEa57',
              '0xB0B0b0b0b0b0B000000000000000000000000000',
            ],
          },
        ],
      },
      'primaryType': 'Mail',
      'types': {
        'EIP712Domain': [
          { 'name': 'name', 'type': 'string' },
          { 'name': 'version', 'type': 'string' },
          { 'name': 'chainId', 'type': 'uint256' },
          { 'name': 'verifyingContract', 'type': 'address' },
        ],
        'Group': [
          { 'name': 'name', 'type': 'string' },
          { 'name': 'members', 'type': 'Person[]' },
        ],
        'Mail': [
          { 'name': 'from', 'type': 'Person' },
          { 'name': 'to', 'type': 'Person[]' },
          { 'name': 'contents', 'type': 'string' },
        ],
        'Person': [
          { 'name': 'name', 'type': 'string' },
          { 'name': 'wallets', 'type': 'address[]' },
        ],
      },
    }
    const options = { version: 'V4' }

    beforeEach(async function () {
      sandbox.on(keyring, 'unlockAccountByAddress', (_) => Promise.resolve(`m/44'/60'/15'`))
      await basicSetupToUnlockOneAccount(15)
    })

    it('should resolve properly when called', async function () {
      sandbox.on(keyring, '_sendMessage', (_, cb) => {
        cb({ success: true, payload: { v: '27', r: '72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b9', s: '46759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e32' } })
      })

      const result = await keyring.signTypedData(fakeAccounts[15], fixtureData, options)
      assert.strictEqual(result, '0x72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b946759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e3200')
    })

    it('should error when address does not match', async function () {
      sandbox.on(keyring, '_sendMessage', (_, cb) => {
        // Changing v to 28 should cause a validation error
        cb({ success: true, payload: { v: '28', r: '72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b9', s: '46759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e32' } })
      })

      assert.rejects(keyring.signTypedData(fakeAccounts[15], fixtureData, options), new Error('Ledger: The signature doesnt match the right address'))
    })
  })
})
