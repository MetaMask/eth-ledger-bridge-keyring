import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { hasProperty } from '@metamask/utils';
import { strict as assert } from 'assert';
import chai, { expect } from 'chai';
import spies from 'chai-spies';
import sigUtil from 'eth-sig-util';
import EthereumTx from 'ethereumjs-tx';
import * as ethUtil from 'ethereumjs-util';
import HDKey from 'hdkey';

import { AccountDetails, LedgerBridgeKeyring } from './ledger-bridge-keyring';
import documentShim from '../test/document.shim';
import windowShim from '../test/window.shim';

// eslint-disable-next-line no-restricted-globals
global.document = documentShim;
// eslint-disable-next-line no-restricted-globals
global.window = windowShim;

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
] as const;

const fakeXPubKey =
  'xpub6FnCn6nSzZAw5Tw7cgR9bi15UV96gLZhjDstkXXxvCLsUXBGXPdSnLFbdpq8p9HmGsApME5hQTZ3emM2rnY5agb9rXpVGyy3bdW6EEgAtqt';
const fakeHdKey = HDKey.fromExtendedKey(fakeXPubKey);
const fakeTx = new EthereumTx({
  nonce: '0x00',
  gasPrice: '0x09184e72a000',
  gasLimit: '0x2710',
  to: '0x0000000000000000000000000000000000000000',
  value: '0x00',
  data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
  // EIP 155 chainId - mainnet: 1, ropsten: 3
  chainId: 1,
});

const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Berlin });
const commonEIP1559 = new Common({
  chain: Chain.Mainnet,
  hardfork: Hardfork.London,
});
const newFakeTx = TransactionFactory.fromTxData(
  {
    nonce: '0x00',
    gasPrice: '0x09184e72a000',
    gasLimit: '0x2710',
    to: '0x0000000000000000000000000000000000000000',
    value: '0x00',
    data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
  },
  { common, freeze: false },
);

const fakeTypeTwoTx = TransactionFactory.fromTxData(
  {
    nonce: '0x00',
    maxFeePerGas: '0x19184e72a000',
    maxPriorityFeePerGas: '0x09184e72a000',
    gasLimit: '0x2710',
    to: '0x0000000000000000000000000000000000000000',
    value: '0x00',
    data: '0x7f7465737432000000000000000000000000000000000000000000000000000000600057',
    type: 2,
    v: '0x01',
  },
  { common: commonEIP1559, freeze: false },
);

chai.use(spies);

/**
 * Checks if the iframe provided has a valid contentWindow
 * and onload function.
 *
 * @param iframe - The iframe to check.
 * @returns Returns true if the iframe is valid, false otherwise.
 */
function isIFrameValid(
  iframe?: HTMLIFrameElement,
): iframe is HTMLIFrameElement & { contentWindow: Window } & {
  onload: () => any;
} {
  return (
    iframe !== undefined &&
    hasProperty(iframe, 'contentWindow') &&
    typeof iframe.onload === 'function' &&
    hasProperty(iframe.contentWindow as Window, 'postMessage')
  );
}

/**
 * Simulates the loading of an iframe by calling the onload function.
 *
 * @param iframe - The iframe to simulate the loading of.
 * @returns Returns a promise that resolves when the onload function is called.
 */
async function simulateIFrameLoad(iframe?: HTMLIFrameElement) {
  if (!isIFrameValid(iframe)) {
    throw new Error('the iframe is not valid');
  }
  // we call manually the onload event to simulate the iframe loading
  return await iframe.onload();
}

describe('LedgerBridgeKeyring', function () {
  let keyring: LedgerBridgeKeyring;
  let sandbox: ChaiSpies.Sandbox;

  /**
   * Sets up the keyring to unlock one account.
   *
   * @param accountIndex - The index of the account to unlock.
   * @returns Returns a promise that resolves when the keyring is unlocked.
   */
  async function basicSetupToUnlockOneAccount(accountIndex = 0) {
    keyring.setAccountToUnlock(accountIndex);
    await keyring.addAccounts();
    sandbox.on(keyring, 'unlock', async () => fakeAccounts[accountIndex]);
  }

  /**
   * Stubs the postMessage function of the keyring iframe.
   *
   * @param keyringInstance - The keyring instance to stub.
   * @param fn - The function to call when the postMessage function is called.
   */
  function stubKeyringIFramePostMessage(
    keyringInstance: LedgerBridgeKeyring,
    fn: (message: any) => void,
  ) {
    if (!isIFrameValid(keyringInstance.iframe)) {
      throw new Error('the iframe is not valid');
    }

    sandbox.on(keyringInstance.iframe.contentWindow, 'postMessage', fn);
  }

  beforeEach(async function () {
    sandbox = chai.spy.sandbox();
    keyring = new LedgerBridgeKeyring();
    keyring.hdk = fakeHdKey;

    await simulateIFrameLoad(keyring.iframe);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('Keyring.type', function () {
    it('is a class property that returns the type string.', function () {
      const { type } = LedgerBridgeKeyring;
      assert.equal(typeof type, 'string');
    });

    it('returns the correct value', function () {
      const { type } = keyring;
      const correct = LedgerBridgeKeyring.type;
      assert.equal(type, correct);
    });
  });

  describe('constructor', function () {
    it('constructs', async function () {
      const ledgerKeyring = new LedgerBridgeKeyring({ hdPath: `m/44'/60'/0'` });
      assert.equal(typeof ledgerKeyring, 'object');

      const accounts = await ledgerKeyring.getAccounts();
      assert.equal(Array.isArray(accounts), true);
    });
  });

  describe('serialize', function () {
    it('serializes an instance', async function () {
      const output = await keyring.serialize();

      assert.equal(
        output.bridgeUrl,
        'https://metamask.github.io/eth-ledger-bridge-keyring',
      );
      assert.equal(output.hdPath, `m/44'/60'/0'`);
      assert.equal(Array.isArray(output.accounts), true);
      assert.equal(output.accounts.length, 0);
    });
  });

  describe('deserialize', function () {
    it('serializes what it deserializes', async function () {
      const account = fakeAccounts[0];
      const checksum = ethUtil.toChecksumAddress(account);
      const someHdPath = `m/44'/60'/0'/1`;
      const accountDetails: Record<string, AccountDetails> = {};
      accountDetails[checksum] = {
        index: 0,
        hdPath: someHdPath,
      };
      await keyring.deserialize({
        hdPath: someHdPath,
        accounts: [account],
        accountDetails,
      });
      const serialized = await keyring.serialize();

      assert.equal(serialized.accounts.length, 1, 'restores 1 account');
      assert.equal(
        serialized.bridgeUrl,
        'https://metamask.github.io/eth-ledger-bridge-keyring',
        'restores bridgeUrl',
      );
      assert.equal(serialized.hdPath, someHdPath, 'restores hdPath');
      assert.deepEqual(
        serialized.accountDetails,
        accountDetails,
        'restores accountDetails',
      );
    });

    it('should migrate accountIndexes to accountDetails', async function () {
      const someHdPath = `m/44'/60'/0'/0/0`;
      const account = fakeAccounts[1];
      const checksum = ethUtil.toChecksumAddress(account);
      const accountIndexes: Record<string, number> = {};
      accountIndexes[checksum] = 1;
      await keyring.deserialize({
        accounts: [account],
        accountIndexes,
        hdPath: someHdPath,
      });

      assert.equal(keyring.hdPath, someHdPath);
      assert.equal(keyring.accounts[0], account);
      assert.deepEqual(keyring.accountDetails[checksum], {
        bip44: true,
        hdPath: `m/44'/60'/1'/0/0`,
      });
    });

    it('should migrate non-bip44 accounts to accountDetails', async function () {
      const someHdPath = `m/44'/60'/0'`;
      const account = fakeAccounts[1];
      const checksum = ethUtil.toChecksumAddress(account);
      await keyring.deserialize({
        accounts: [account],
        hdPath: someHdPath,
      });

      assert.equal(keyring.hdPath, someHdPath);
      assert.equal(keyring.accounts[0], account);
      assert.deepEqual(keyring.accountDetails[checksum], {
        bip44: false,
        hdPath: `m/44'/60'/0'/1`,
      });
    });
  });

  describe('isUnlocked', function () {
    it('should return true if we have a public key', function () {
      assert.equal(keyring.isUnlocked(), true);
    });
  });

  describe('unlock', function () {
    it('should resolve if we have a public key', async function () {
      await keyring.unlock();
    });

    it('should update hdk.publicKey if updateHdk is true', async function () {
      const ledgerKeyring = new LedgerBridgeKeyring();
      // @ts-expect-error we want to bypass the set publicKey property set method
      ledgerKeyring.hdk = { publicKey: 'ABC' };
      await simulateIFrameLoad(ledgerKeyring.iframe);

      stubKeyringIFramePostMessage(ledgerKeyring, (message) => {
        ledgerKeyring.messageCallbacks[message.messageId]?.({
          action: message.action,
          messageId: message.messageId,
          success: true,
          payload: {
            publicKey:
              '04197ced33b63059074b90ddecb9400c45cbc86210a20317b539b8cae84e573342149c3384ae45f27db68e75823323e97e03504b73ecbc47f5922b9b8144345e5a',
            chainCode:
              'ba0fb16e01c463d1635ec36f5adeb93a838adcd1526656c55f828f1e34002a8b',
            address: fakeAccounts[1],
          },
        });
      });

      await ledgerKeyring.unlock(`m/44'/60'/0'/1`);
      assert.notDeepEqual(ledgerKeyring.hdk.publicKey, 'ABC');
    });

    it('should not update hdk.publicKey if updateHdk is false', async function () {
      const ledgerKeyring = new LedgerBridgeKeyring();
      // @ts-expect-error we want to bypass the publicKey property set method
      ledgerKeyring.hdk = { publicKey: 'ABC' };
      await simulateIFrameLoad(ledgerKeyring.iframe);

      stubKeyringIFramePostMessage(ledgerKeyring, (message) => {
        ledgerKeyring.messageCallbacks[message.messageId]?.({
          action: message.action,
          messageId: message.messageId,
          success: true,
          payload: {
            publicKey:
              '04197ced33b63059074b90ddecb9400c45cbc86210a20317b539b8cae84e573342149c3384ae45f27db68e75823323e97e03504b73ecbc47f5922b9b8144345e5a',
            chainCode:
              'ba0fb16e01c463d1635ec36f5adeb93a838adcd1526656c55f828f1e34002a8b',
            address: fakeAccounts[1],
          },
        });
      });

      await ledgerKeyring.unlock(`m/44'/60'/0'/1`, false);
      assert.deepEqual(ledgerKeyring.hdk.publicKey, 'ABC');
    });
  });

  describe('setHdPath', function () {
    it('should set the hdPath', function (done) {
      const someHDPath = `m/44'/99'/0`;
      keyring.setHdPath(someHDPath);
      assert.equal(keyring.hdPath, someHDPath);
      done();
    });

    it('should reset the HDKey if the path changes', function (done) {
      const someHDPath = `m/44'/99'/0`;
      keyring.setHdPath(someHDPath);
      assert.equal(keyring.hdk.publicKey, null);
      done();
    });
  });

  describe('setAccountToUnlock', function () {
    it('should set unlockedAccount', function () {
      keyring.setAccountToUnlock(3);
      assert.equal(keyring.unlockedAccount, 3);
    });
  });

  describe('addAccounts', function () {
    describe('with no arguments', function () {
      it('returns a single account', async function () {
        keyring.setAccountToUnlock(0);
        const accounts = await keyring.addAccounts();
        assert.equal(accounts.length, 1);
      });
    });

    describe('with a numeric argument', function () {
      it('returns that number of accounts', async function () {
        keyring.setAccountToUnlock(0);
        const accounts = await keyring.addAccounts(5);
        assert.equal(accounts.length, 5);
      });

      it('returns the expected accounts', async function () {
        keyring.setAccountToUnlock(0);
        const accounts = await keyring.addAccounts(3);
        assert.equal(accounts[0], fakeAccounts[0]);
        assert.equal(accounts[1], fakeAccounts[1]);
        assert.equal(accounts[2], fakeAccounts[2]);
      });
    });

    it('stores account details for bip44 accounts', async function () {
      keyring.setHdPath(`m/44'/60'/0'/0/0`);
      keyring.setAccountToUnlock(1);
      sandbox.on(keyring, 'unlock', async () =>
        Promise.resolve(fakeAccounts[0]),
      );
      const accounts = await keyring.addAccounts(1);
      assert.deepEqual(keyring.accountDetails[accounts[0] as string], {
        bip44: true,
        hdPath: `m/44'/60'/1'/0/0`,
      });
    });

    it('stores account details for non-bip44 accounts', async function () {
      keyring.setHdPath(`m/44'/60'/0'`);
      keyring.setAccountToUnlock(2);
      const accounts = await keyring.addAccounts(1);
      assert.deepEqual(keyring.accountDetails[accounts[0] as string], {
        bip44: false,
        hdPath: `m/44'/60'/0'/2`,
      });
    });

    describe('when called multiple times', function () {
      it('should not remove existing accounts', async function () {
        keyring.setAccountToUnlock(0);
        await keyring.addAccounts(1);
        keyring.setAccountToUnlock(1);
        const accounts = await keyring.addAccounts(1);

        assert.equal(accounts.length, 2);
        assert.equal(accounts[0], fakeAccounts[0]);
        assert.equal(accounts[1], fakeAccounts[1]);
      });
    });
  });

  describe('removeAccount', function () {
    describe('if the account exists', function () {
      it('should remove that account', async function () {
        keyring.setAccountToUnlock(0);
        const accounts = await keyring.addAccounts();
        assert.equal(accounts.length, 1);
        keyring.removeAccount(fakeAccounts[0]);
        const accountsAfterRemoval = await keyring.getAccounts();
        assert.equal(accountsAfterRemoval.length, 0);
      });
    });

    describe('if the account does not exist', function () {
      it('should throw an error', function () {
        const unexistingAccount = '0x0000000000000000000000000000000000000000';
        expect(() => {
          keyring.removeAccount(unexistingAccount);
        }).to.throw(`Address ${unexistingAccount} not found in this keyring`);
      });
    });
  });

  describe('getFirstPage', function () {
    it('should set the currentPage to 1', async function () {
      await keyring.getFirstPage();
      assert.equal(keyring.page, 1);
    });

    it('should return the list of accounts for current page', async function () {
      const accounts = await keyring.getFirstPage();

      assert.equal(accounts.length, keyring.perPage);
      expect(accounts[0]?.address, fakeAccounts[0]);
      expect(accounts[1]?.address, fakeAccounts[1]);
      expect(accounts[2]?.address, fakeAccounts[2]);
      expect(accounts[3]?.address, fakeAccounts[3]);
      expect(accounts[4]?.address, fakeAccounts[4]);
    });
  });

  describe('getNextPage', function () {
    it('should return the list of accounts for current page', async function () {
      const accounts = await keyring.getNextPage();
      assert.equal(accounts.length, keyring.perPage);
      expect(accounts[0]?.address, fakeAccounts[0]);
      expect(accounts[1]?.address, fakeAccounts[1]);
      expect(accounts[2]?.address, fakeAccounts[2]);
      expect(accounts[3]?.address, fakeAccounts[3]);
      expect(accounts[4]?.address, fakeAccounts[4]);
    });
  });

  describe('getPreviousPage', function () {
    it('should return the list of accounts for current page', async function () {
      // manually advance 1 page
      await keyring.getNextPage();
      const accounts = await keyring.getPreviousPage();

      assert.equal(accounts.length, keyring.perPage);
      expect(accounts[0]?.address, fakeAccounts[0]);
      expect(accounts[1]?.address, fakeAccounts[1]);
      expect(accounts[2]?.address, fakeAccounts[2]);
      expect(accounts[3]?.address, fakeAccounts[3]);
      expect(accounts[4]?.address, fakeAccounts[4]);
    });

    it('should be able to go back to the previous page', async function () {
      // manually advance 1 page
      await keyring.getNextPage();
      const accounts = await keyring.getPreviousPage();

      assert.equal(accounts.length, keyring.perPage);
      expect(accounts[0]?.address, fakeAccounts[0]);
      expect(accounts[1]?.address, fakeAccounts[1]);
      expect(accounts[2]?.address, fakeAccounts[2]);
      expect(accounts[3]?.address, fakeAccounts[3]);
      expect(accounts[4]?.address, fakeAccounts[4]);
    });
  });

  describe('getAccounts', function () {
    const accountIndex = 5;
    let accounts: string[] = [];
    beforeEach(async function () {
      keyring.setAccountToUnlock(accountIndex);
      await keyring.addAccounts();
      accounts = await keyring.getAccounts();
    });

    it('returns an array of accounts', function () {
      assert.equal(Array.isArray(accounts), true);
      assert.equal(accounts.length, 1);
    });

    it('returns the expected', function () {
      const expectedAccount = fakeAccounts[accountIndex];
      assert.equal(accounts[0], expectedAccount);
    });
  });

  describe('exportAccount', function () {
    it('should throw an error because it is not supported', function () {
      expect(() => {
        keyring.exportAccount();
      }).to.throw('Not supported on this device');
    });
  });

  describe('forgetDevice', function () {
    it('should clear the content of the keyring', async function () {
      // Add an account
      keyring.setAccountToUnlock(0);
      await keyring.addAccounts();

      // Wipe the keyring
      keyring.forgetDevice();

      const accounts = await keyring.getAccounts();

      assert.equal(keyring.isUnlocked(), false);
      assert.equal(accounts.length, 0);
    });
  });

  describe('signTransaction', function () {
    describe('using old versions of ethereumjs/tx', function () {
      it('should pass serialized transaction to ledger and return signed tx', async function () {
        await basicSetupToUnlockOneAccount();
        stubKeyringIFramePostMessage(keyring, (message) => {
          assert.deepStrictEqual(message.params, {
            hdPath: "m/44'/60'/0'/0",
            tx: fakeTx.serialize().toString('hex'),
          });

          keyring.messageCallbacks[message.messageId]?.({
            ...message,
            success: true,
            payload: { v: '0x1', r: '0x0', s: '0x0' },
          });
        });

        sandbox.on(fakeTx, 'verifySignature', () => true);

        const returnedTx = await keyring.signTransaction(
          fakeAccounts[0],
          fakeTx,
        );
        expect(
          // eslint-disable-next-line @typescript-eslint/unbound-method
          keyring.iframe?.contentWindow?.postMessage,
        ).to.have.been.called();
        expect(returnedTx).to.have.property('v');
        expect(returnedTx).to.have.property('r');
        expect(returnedTx).to.have.property('s');
      });
    });

    describe('using new versions of ethereumjs/tx', function () {
      it('should pass correctly encoded legacy transaction to ledger and return signed tx', async function () {
        // Generated by signing newFakeTx with private key eee0290acfa88cf7f97be7525437db1624293f829b8a2cba380390618d62662b
        const expectedRSV = {
          v: '0x26',
          r: '0xf3a7718999d1b87beda810b25cc025153e74df0745279826b9b2f3d1d1b6318',
          s: '0x7e33bdfbf5272dc4f55649e9ba729849670171a68ef8c0fbeed3b879b90b8954',
        };

        await basicSetupToUnlockOneAccount();

        const signedNewFakeTx = TransactionFactory.fromTxData({
          ...newFakeTx.toJSON(),
          ...expectedRSV,
        });

        sandbox.on(TransactionFactory, 'fromTxData', () => signedNewFakeTx);
        sandbox.on(signedNewFakeTx, 'verifySignature', () => true);

        stubKeyringIFramePostMessage(keyring, (message) => {
          assert.deepStrictEqual(message.params, {
            hdPath: "m/44'/60'/0'/0",
            tx: ethUtil.rlp
              .encode(newFakeTx.getMessageToSign(false))
              .toString('hex'),
          });

          keyring.messageCallbacks[message.messageId]?.({
            ...message,
            success: true,
            payload: expectedRSV,
          });
        });

        const returnedTx = await keyring.signTransaction(
          fakeAccounts[0],
          newFakeTx,
        );

        expect(
          // eslint-disable-next-line @typescript-eslint/unbound-method
          keyring.iframe?.contentWindow?.postMessage,
        ).to.have.been.called();

        expect(returnedTx.toJSON()).to.deep.equal(signedNewFakeTx.toJSON());
      });

      it('should pass correctly encoded EIP1559 transaction to ledger and return signed tx', async function () {
        // Generated by signing fakeTypeTwoTx with private key eee0290acfa88cf7f97be7525437db1624293f829b8a2cba380390618d62662b
        const expectedRSV = {
          v: '0x0',
          r: '0x5ffb3adeaec80e430e7a7b02d95c5108b6f09a0bdf3cf69869dc1b38d0fb8d3a',
          s: '0x28b234a5403d31564e18258df84c51a62683e3f54fa2b106fdc1a9058006a112',
        };

        await basicSetupToUnlockOneAccount();

        const signedFakeTypeTwoTx = TransactionFactory.fromTxData(
          {
            ...fakeTypeTwoTx.toJSON(),
            type: fakeTypeTwoTx.type,
            ...expectedRSV,
          },
          { common: commonEIP1559, freeze: false },
        );
        sandbox.on(TransactionFactory, 'fromTxData', () => signedFakeTypeTwoTx);
        sandbox.on(signedFakeTypeTwoTx, 'verifySignature', () => true);

        sandbox.on(fakeTypeTwoTx, 'verifySignature', () => true);

        stubKeyringIFramePostMessage(keyring, (message) => {
          assert.deepStrictEqual(message.params, {
            hdPath: "m/44'/60'/0'/0",
            tx: fakeTypeTwoTx.getMessageToSign(false).toString('hex'),
          });

          keyring.messageCallbacks[message.messageId]?.({
            ...message,
            success: true,
            payload: expectedRSV,
          });
        });

        const returnedTx = await keyring.signTransaction(
          fakeAccounts[0],
          fakeTypeTwoTx,
        );

        expect(
          // eslint-disable-next-line @typescript-eslint/unbound-method
          keyring.iframe?.contentWindow?.postMessage,
        ).to.have.been.called();

        expect(returnedTx.toJSON()).to.deep.equal(signedFakeTypeTwoTx.toJSON());
      });
    });
  });

  describe('signPersonalMessage', function () {
    it('should call create a listener waiting for the iframe response', async function () {
      await basicSetupToUnlockOneAccount();

      stubKeyringIFramePostMessage(keyring, (message) => {
        assert.deepStrictEqual(message.params, {
          hdPath: "m/44'/60'/0'/0",
          message: 'some message',
        });

        keyring.messageCallbacks[message.messageId]?.({
          ...message,
          success: true,
          payload: { v: 1, r: '0x0', s: '0x0' },
        });
      });

      sandbox.on(sigUtil, 'recoverPersonalSignature', () => fakeAccounts[0]);
      await keyring.signPersonalMessage(fakeAccounts[0], 'some message');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(keyring.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });

  describe('signMessage', function () {
    it('should call create a listener waiting for the iframe response', async function () {
      await basicSetupToUnlockOneAccount();
      stubKeyringIFramePostMessage(keyring, (message) => {
        assert.deepStrictEqual(message.params, {
          hdPath: "m/44'/60'/0'/0",
          message: 'some message',
        });

        keyring.messageCallbacks[message.messageId]?.({
          ...message,
          success: true,
          payload: { v: 1, r: '0x0', s: '0x0' },
        });
      });

      sandbox.on(sigUtil, 'recoverPersonalSignature', () => fakeAccounts[0]);
      await keyring.signMessage(fakeAccounts[0], 'some message');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(keyring.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });

  describe('unlockAccountByAddress', function () {
    it('should unlock the given account if found on device', async function () {
      await basicSetupToUnlockOneAccount();
      await keyring.unlockAccountByAddress(fakeAccounts[0]).then((hdPath) => {
        assert.equal(hdPath, "m/44'/60'/0'/0");
      });
    });

    it('should reject if the account is not found on device', async function () {
      const requestedAccount = fakeAccounts[0];
      const incorrectAccount = fakeAccounts[1];
      keyring.setAccountToUnlock(0);
      await keyring.addAccounts();
      sandbox.on(keyring, 'unlock', async (_) =>
        Promise.resolve(incorrectAccount),
      );

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      assert.rejects(
        keyring.unlockAccountByAddress(requestedAccount),
        new Error(
          `Ledger: Account ${fakeAccounts[0]} does not belong to the connected device`,
        ),
      );
    });
  });

  describe('signTypedData', function () {
    // This data matches demo data is MetaMask's test dapp
    const fixtureData = {
      domain: {
        chainId: 1,
        name: 'Ether Mail',
        verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        version: '1',
      },
      message: {
        contents: 'Hello, Bob!',
        from: {
          name: 'Cow',
          wallets: [
            '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
            '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF',
          ],
        },
        to: [
          {
            name: 'Bob',
            wallets: [
              '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
              '0xB0BdaBea57B0BDABeA57b0bdABEA57b0BDabEa57',
              '0xB0B0b0b0b0b0B000000000000000000000000000',
            ],
          },
        ],
      },
      primaryType: 'Mail',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Group: [
          { name: 'name', type: 'string' },
          { name: 'members', type: 'Person[]' },
        ],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person[]' },
          { name: 'contents', type: 'string' },
        ],
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallets', type: 'address[]' },
        ],
      },
    };
    const options = { version: 'V4' };

    beforeEach(async function () {
      sandbox.on(keyring, 'unlockAccountByAddress', async (_) =>
        Promise.resolve(`m/44'/60'/15'`),
      );
      await basicSetupToUnlockOneAccount(15);
    });

    it('should resolve properly when called', async function () {
      stubKeyringIFramePostMessage(keyring, (message) => {
        keyring.messageCallbacks[message.messageId]?.({
          ...message,
          success: true,
          payload: {
            v: 27,
            r: '72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b9',
            s: '46759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e32',
          },
        });
      });

      const result = await keyring.signTypedData(
        fakeAccounts[15],
        fixtureData,
        options,
      );
      assert.strictEqual(
        result,
        '0x72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b946759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e321b',
      );
    });

    it('should error when address does not match', async function () {
      stubKeyringIFramePostMessage(keyring, (message) => {
        keyring.messageCallbacks[message.messageId]?.({
          ...message,
          success: true,
          payload: {
            v: 28,
            r: '72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b9',
            s: '46759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e32',
          },
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      assert.rejects(
        keyring.signTypedData(fakeAccounts[15], fixtureData, options),
        new Error('Ledger: The signature doesnt match the right address'),
      );
    });
  });

  describe('destroy', function () {
    it('should remove the message event listener', function () {
      // eslint-disable-next-line no-restricted-globals
      sandbox.on(global.window, 'removeEventListener', (type, listener) => {
        assert(type, 'message');
        assert(typeof listener === 'function');
        return true;
      });
      keyring.destroy();
      // eslint-disable-next-line no-restricted-globals
      expect(global.window.removeEventListener).to.have.been.called();
    });
  });
});
