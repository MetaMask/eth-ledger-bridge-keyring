import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { RLP } from '@ethereumjs/rlp';
import { TransactionFactory } from '@ethereumjs/tx';
import * as ethUtil from '@ethereumjs/util';
import * as sigUtil from '@metamask/eth-sig-util';
import EthereumTx from 'ethereumjs-tx';
import HDKey from 'hdkey';

import { LedgerBridge, LedgerBridgeOptions } from './ledger-bridge';
import { LedgerIframeBridge } from './ledger-iframe-bridge';
import { AccountDetails, LedgerKeyring } from './ledger-keyring';

jest.mock('@metamask/eth-sig-util', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('@metamask/eth-sig-util'),
  };
});

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

describe('LedgerKeyring', function () {
  let keyring: LedgerKeyring;
  let bridge: LedgerBridge<LedgerBridgeOptions>;

  /**
   * Sets up the keyring to unlock one account.
   *
   * @param accountIndex - The index of the account to unlock.
   * @returns Returns a promise that resolves when the keyring is unlocked.
   */
  async function basicSetupToUnlockOneAccount(accountIndex = 0) {
    keyring.setAccountToUnlock(accountIndex);
    await keyring.addAccounts();
    jest
      .spyOn(keyring, 'unlock')
      .mockResolvedValue(fakeAccounts[accountIndex] as string);
  }

  beforeEach(async function () {
    bridge = new LedgerIframeBridge();
    keyring = new LedgerKeyring({ bridge });
    keyring.hdk = fakeHdKey;
    await keyring.deserialize();
  });

  afterEach(function () {
    jest.clearAllMocks();
  });

  describe('Keyring.type', function () {
    it('is a class property that returns the type string.', function () {
      const { type } = LedgerKeyring;
      expect(typeof type).toBe('string');
    });

    it('returns the correct value', function () {
      const { type } = keyring;
      const correct = LedgerKeyring.type;
      expect(type).toBe(correct);
    });
  });

  describe('constructor', function () {
    it('constructs', async function () {
      const ledgerKeyring = new LedgerKeyring({
        bridge: new LedgerIframeBridge(),
      });
      expect(typeof ledgerKeyring).toBe('object');

      const accounts = await ledgerKeyring.getAccounts();
      expect(Array.isArray(accounts)).toBe(true);
    });

    it('throws if a bridge is not provided', function () {
      expect(
        () =>
          new LedgerKeyring({
            bridge: undefined as unknown as LedgerBridge<LedgerBridgeOptions>,
          }),
      ).toThrow('Bridge is a required dependency for the keyring');
    });
  });

  describe('init', function () {
    it('calls bridge init', async function () {
      jest.spyOn(bridge, 'init').mockResolvedValue(undefined);

      await keyring.init();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('serialize', function () {
    it('serializes an instance', async function () {
      const output = await keyring.serialize();

      expect(output.hdPath).toBe(`m/44'/60'/0'`);
      expect(Array.isArray(output.accounts)).toBe(true);
      expect(output.accounts).toHaveLength(0);
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
        deviceId: 'some-device',
      });
      const serialized = await keyring.serialize();

      expect(serialized.accounts).toHaveLength(1);
      expect(serialized.hdPath).toBe(someHdPath);
      expect(serialized.accountDetails).toStrictEqual(accountDetails);
      expect(serialized.deviceId).toBe('some-device');
    });

    it('migrates accountIndexes to accountDetails', async function () {
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

      expect(keyring.hdPath).toBe(someHdPath);
      expect(keyring.accounts[0]).toBe(account);
      expect(keyring.accountDetails[checksum]).toStrictEqual({
        bip44: true,
        hdPath: `m/44'/60'/1'/0/0`,
      });
    });

    it('migrates non-bip44 accounts to accountDetails', async function () {
      const someHdPath = `m/44'/60'/0'`;
      const account = fakeAccounts[1];
      const checksum = ethUtil.toChecksumAddress(account);
      await keyring.deserialize({
        accounts: [account],
        hdPath: someHdPath,
        deviceId: 'some-device',
        implementFullBIP44: true,
      });

      expect(keyring.hdPath).toStrictEqual(someHdPath);
      expect(keyring.accounts[0]).toBe(account);
      expect(keyring.accountDetails[checksum]).toStrictEqual({
        bip44: false,
        hdPath: `m/44'/60'/0'/1`,
      });
    });

    it('throws an error when the address is not found', async function () {
      const hdPath = `m/44'/60'/0'`;
      const account = '0x90A5b70d94418d6c25C19071e5b8170607f6302D';

      const accountIndexes: Record<string, number> = {};
      accountIndexes['0x90a'] = 1;

      await expect(
        keyring.deserialize({
          hdPath,
          accounts: [account],
          deviceId: 'some-device',
          implementFullBIP44: true,
          accountIndexes,
        }),
      ).rejects.toThrow('Unknown address');
    });

    describe('setDeviceId', function () {
      it('sets the deviceId', function () {
        keyring.setDeviceId('some-device');
        expect(keyring.getDeviceId()).toBe('some-device');
      });
    });

    describe('getDeviceId', function () {
      it('returns the deviceId', function () {
        keyring.setDeviceId('some-device');
        expect(keyring.getDeviceId()).toBe('some-device');
      });
    });

    describe('isConnected', function () {
      it('returns true if bridge is connected', function () {
        bridge.isDeviceConnected = true;
        expect(keyring.isConnected()).toBe(true);
      });

      it('returns false if bridge is not connected', function () {
        bridge.isDeviceConnected = false;
        expect(keyring.isConnected()).toBe(false);
      });
    });

    describe('getName', function () {
      it('returns the keyring name', function () {
        expect(keyring.getName()).toBe('Ledger Hardware');
      });
    });

    describe('isUnlocked', function () {
      it('returns true if there is a public key', function () {
        expect(keyring.isUnlocked()).toBe(true);
      });
    });

    describe('setAccountToUnlock', function () {
      it('sets unlockedAccount to new value', function () {
        keyring.setAccountToUnlock(3);
        expect(keyring.unlockedAccount).toBe(3);
      });
    });

    describe('setHdPath', function () {
      it('sets the hdPath', function () {
        const someHDPath = `m/44'/99'/0`;
        keyring.setHdPath(someHDPath);
        expect(keyring.hdPath).toBe(someHDPath);
      });

      it('resets the HDKey if the path changes', function () {
        const someHDPath = `m/44'/99'/0`;
        keyring.setHdPath(someHDPath);
        expect(keyring.hdk.publicKey).toBeNull();
      });
    });

    describe('unlock', function () {
      it('resolves to a public key if it exists', async function () {
        expect(async () => {
          await keyring.unlock();
        }).not.toThrow();
      });

      it('updates hdk.publicKey if updateHdk is true', async function () {
        // @ts-expect-error we want to bypass the set publicKey property set method
        keyring.hdk = { publicKey: 'ABC' };

        jest.spyOn(bridge, 'getPublicKey').mockResolvedValue({
          publicKey:
            '04197ced33b63059074b90ddecb9400c45cbc86210a20317b539b8cae84e573342149c3384ae45f27db68e75823323e97e03504b73ecbc47f5922b9b8144345e5a',
          chainCode:
            'ba0fb16e01c463d1635ec36f5adeb93a838adcd1526656c55f828f1e34002a8b',
          address: fakeAccounts[1],
        });

        await keyring.unlock(`m/44'/60'/0'/1`);
        expect(keyring.hdk.publicKey).not.toBe('ABC');
      });

      it('throws an error when the bridge getPublicKey method throws an error and it is not an error type', async function () {
        keyring.setHdPath(`m/44'/60'/0'/0`);
        jest.spyOn(bridge, 'getPublicKey').mockRejectedValue('Some error');
        await expect(keyring.unlock()).rejects.toThrow(
          'Ledger Ethereum app closed. Open it to unlock.',
        );
      });

      it('does not update hdk.publicKey if updateHdk is false', async function () {
        // @ts-expect-error we want to bypass the publicKey property set method
        keyring.hdk = { publicKey: 'ABC' };

        jest.spyOn(bridge, 'getPublicKey').mockResolvedValue({
          publicKey:
            '04197ced33b63059074b90ddecb9400c45cbc86210a20317b539b8cae84e573342149c3384ae45f27db68e75823323e97e03504b73ecbc47f5922b9b8144345e5a',
          chainCode:
            'ba0fb16e01c463d1635ec36f5adeb93a838adcd1526656c55f828f1e34002a8b',
          address: fakeAccounts[1],
        });

        await keyring.unlock(`m/44'/60'/0'/1`, false);
        expect(keyring.hdk.publicKey).toBe('ABC');
      });

      it('unlocks with the set hdPath if a new one is not provided', async function () {
        keyring.setHdPath(`m/44'/60'/0'/0`);
        jest.spyOn(bridge, 'getPublicKey').mockResolvedValue(
          Promise.resolve({
            publicKey: '0x1234',
            chainCode: '0x1234',
            address: fakeAccounts[0],
          }),
        );
        const account = await keyring.unlock(undefined, false);
        expect(account).toBe(fakeAccounts[0]);
      });

      it('throws an error if the bridge getPublicKey method throws an error', async function () {
        keyring.setHdPath(`m/44'/60'/0'/0`);
        jest
          .spyOn(bridge, 'getPublicKey')
          .mockRejectedValue(new Error('Some error'));
        await expect(keyring.unlock()).rejects.toThrow('Some error');
      });
    });

    describe('addAccounts', function () {
      describe('with no arguments', function () {
        it('returns a single account', async function () {
          keyring.setAccountToUnlock(0);
          const accounts = await keyring.addAccounts();
          expect(accounts).toHaveLength(1);
        });
      });

      describe('with a numeric argument', function () {
        it('returns that number of accounts', async function () {
          keyring.setAccountToUnlock(0);
          const accounts = await keyring.addAccounts(5);
          expect(accounts).toHaveLength(5);
        });

        it('returns the expected accounts', async function () {
          keyring.setAccountToUnlock(0);
          const accounts = await keyring.addAccounts(3);
          expect(accounts[0]).toBe(fakeAccounts[0]);
          expect(accounts[1]).toBe(fakeAccounts[1]);
          expect(accounts[2]).toBe(fakeAccounts[2]);
        });
      });

      it('stores account details for bip44 accounts', async function () {
        keyring.setHdPath(`m/44'/60'/0'/0/0`);
        keyring.setAccountToUnlock(1);
        jest.spyOn(keyring, 'unlock').mockResolvedValue(fakeAccounts[0]);
        const accounts = await keyring.addAccounts(1);
        expect(keyring.accountDetails[accounts[0] as string]).toStrictEqual({
          bip44: true,
          hdPath: `m/44'/60'/1'/0/0`,
        });
      });

      it('stores account details for non-bip44 accounts', async function () {
        keyring.setHdPath(`m/44'/60'/0'`);
        keyring.setAccountToUnlock(2);
        const accounts = await keyring.addAccounts(1);
        expect(keyring.accountDetails[accounts[0] as string]).toStrictEqual({
          bip44: false,
          hdPath: `m/44'/60'/0'/2`,
        });
      });

      describe('when called multiple times', function () {
        it('does not remove existing accounts', async function () {
          keyring.setAccountToUnlock(0);
          await keyring.addAccounts(1);
          keyring.setAccountToUnlock(1);
          const accounts = await keyring.addAccounts(1);

          expect(accounts).toHaveLength(2);
          expect(accounts[0]).toBe(fakeAccounts[0]);
          expect(accounts[1]).toBe(fakeAccounts[1]);
        });
      });
    });

    describe('removeAccount', function () {
      describe('if the account exists', function () {
        it('removes that account', async function () {
          keyring.setAccountToUnlock(0);
          const accounts = await keyring.addAccounts();
          expect(accounts).toHaveLength(1);
          keyring.removeAccount(fakeAccounts[0]);
          const accountsAfterRemoval = await keyring.getAccounts();
          expect(accountsAfterRemoval).toHaveLength(0);
        });
      });

      describe('if the account does not exist', function () {
        it('throws an error', function () {
          const unexistingAccount =
            '0x0000000000000000000000000000000000000000';
          expect(() => {
            keyring.removeAccount(unexistingAccount);
          }).toThrow(`Address ${unexistingAccount} not found in this keyring`);
        });
      });
    });

    describe('getFirstPage', function () {
      it('sets the currentPage to 1', async function () {
        await keyring.getFirstPage();
        expect(keyring.page).toBe(1);
      });

      it('returns the list of accounts for current page', async function () {
        const accounts = await keyring.getFirstPage();

        expect(accounts).toHaveLength(keyring.perPage);
        expect(accounts[0]?.address).toBe(fakeAccounts[0]);
        expect(accounts[1]?.address).toBe(fakeAccounts[1]);
        expect(accounts[2]?.address).toBe(fakeAccounts[2]);
        expect(accounts[3]?.address).toBe(fakeAccounts[3]);
        expect(accounts[4]?.address).toBe(fakeAccounts[4]);
      });

      it('returns the list of accounts when isLedgerLiveHdPath is true', async function () {
        keyring.setHdPath(`m/44'/60'/0'/0/0`);
        jest.spyOn(keyring, 'unlock').mockResolvedValue(fakeAccounts[0]);
        const accounts = await keyring.getFirstPage();

        expect(accounts).toHaveLength(keyring.perPage);
        expect(accounts[0]?.address).toBe(
          '0xF30952A1c534CDE7bC471380065726fa8686dfB3',
        );
      });
    });

    describe('getNextPage', function () {
      it('returns the list of accounts for current page', async function () {
        const accounts = await keyring.getNextPage();
        expect(accounts).toHaveLength(keyring.perPage);
        expect(accounts[0]?.address).toBe(fakeAccounts[0]);
        expect(accounts[1]?.address).toBe(fakeAccounts[1]);
        expect(accounts[2]?.address).toBe(fakeAccounts[2]);
        expect(accounts[3]?.address).toBe(fakeAccounts[3]);
        expect(accounts[4]?.address).toBe(fakeAccounts[4]);
      });
    });

    describe('getPreviousPage', function () {
      it('returns the list of accounts for current page', async function () {
        // manually advance 1 page
        await keyring.getNextPage();
        const accounts = await keyring.getPreviousPage();

        expect(accounts).toHaveLength(keyring.perPage);
        expect(accounts[0]?.address).toBe(fakeAccounts[0]);
        expect(accounts[1]?.address).toBe(fakeAccounts[1]);
        expect(accounts[2]?.address).toBe(fakeAccounts[2]);
        expect(accounts[3]?.address).toBe(fakeAccounts[3]);
        expect(accounts[4]?.address).toBe(fakeAccounts[4]);
      });

      it('is able to go back to the previous page', async function () {
        // manually advance 1 page
        await keyring.getNextPage();
        const accounts = await keyring.getPreviousPage();

        expect(accounts).toHaveLength(keyring.perPage);
        expect(accounts[0]?.address).toBe(fakeAccounts[0]);
        expect(accounts[1]?.address).toBe(fakeAccounts[1]);
        expect(accounts[2]?.address).toBe(fakeAccounts[2]);
        expect(accounts[3]?.address).toBe(fakeAccounts[3]);
        expect(accounts[4]?.address).toBe(fakeAccounts[4]);
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
        expect(Array.isArray(accounts)).toBe(true);
        expect(accounts).toHaveLength(1);
      });

      it('returns the expected', function () {
        const expectedAccount = fakeAccounts[accountIndex];
        expect(accounts[0]).toStrictEqual(expectedAccount);
      });
    });

    describe('exportAccount', function () {
      it('throws an error because it is not supported', function () {
        expect(() => {
          keyring.exportAccount();
        }).toThrow('Not supported on this device');
      });
    });

    describe('forgetDevice', function () {
      it('clears the content of the keyring', async function () {
        // Add an account
        keyring.setAccountToUnlock(0);
        await keyring.addAccounts();

        // Wipe the keyring
        keyring.forgetDevice();

        const accounts = await keyring.getAccounts();

        expect(keyring.isUnlocked()).toBe(false);
        expect(accounts).toHaveLength(0);
      });
    });

    describe('attemptMakeApp', function () {
      it('calls the bridge attemptMakeApp method', async function () {
        jest.spyOn(bridge, 'attemptMakeApp').mockResolvedValue(true);

        await keyring.attemptMakeApp();

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(bridge.attemptMakeApp).toHaveBeenCalledTimes(1);
      });
    });

    describe('updateTransportMethod', function () {
      describe('when bridge is connected', function () {
        it('calls the bridge updateTransportMethod method', async function () {
          jest.spyOn(bridge, 'updateTransportMethod').mockResolvedValue(true);

          await keyring.updateTransportMethod('some-transport');

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(bridge.updateTransportMethod).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('signTransaction', function () {
      describe('using old versions of ethereumjs/tx', function () {
        it('passes serialized transaction to ledger and return signed tx', async function () {
          await basicSetupToUnlockOneAccount();
          jest
            .spyOn(keyring.bridge, 'deviceSignTransaction')
            .mockImplementation(async (params) => {
              expect(params).toStrictEqual({
                hdPath: "m/44'/60'/0'/0",
                tx: fakeTx.serialize().toString('hex'),
              });
              return { v: '0x1', r: '0x0', s: '0x0' };
            });

          jest.spyOn(fakeTx, 'verifySignature').mockReturnValue(true);

          const returnedTx = await keyring.signTransaction(
            fakeAccounts[0],
            fakeTx,
          );

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(keyring.bridge.deviceSignTransaction).toHaveBeenCalled();
          expect(returnedTx).toHaveProperty('v');
          expect(returnedTx).toHaveProperty('r');
          expect(returnedTx).toHaveProperty('s');
        });
      });

      describe('using new versions of ethereumjs/tx', function () {
        it('passes correctly encoded legacy transaction to ledger and return signed tx', async function () {
          // Generated by signing newFakeTx with private key eee0290acfa88cf7f97be7525437db1624293f829b8a2cba380390618d62662b
          const expectedRSV = {
            v: '0x26',
            r: '0xf3a7718999d1b87beda810b25cc025153e74df0745279826b9b2f3d1d1b6318',
            s: '0x7e33bdfbf5272dc4f55649e9ba729849670171a68ef8c0fbeed3b879b90b8954',
          };

          await basicSetupToUnlockOneAccount();

          const signedNewFakeTx = TransactionFactory.fromTxData(
            {
              ...newFakeTx.toJSON(),
              ...expectedRSV,
            },
            { freeze: false },
          );

          jest
            .spyOn(TransactionFactory, 'fromTxData')
            .mockReturnValue(signedNewFakeTx);

          jest
            .spyOn(signedNewFakeTx, 'verifySignature')
            .mockImplementation(() => true);

          jest
            .spyOn(keyring.bridge, 'deviceSignTransaction')
            .mockImplementation(async (params) => {
              expect(params).toStrictEqual({
                hdPath: "m/44'/60'/0'/0",
                tx: Buffer.from(
                  RLP.encode(newFakeTx.getMessageToSign(false)),
                ).toString('hex'),
              });
              return expectedRSV;
            });

          const returnedTx = await keyring.signTransaction(
            fakeAccounts[0],
            newFakeTx,
          );

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(keyring.bridge.deviceSignTransaction).toHaveBeenCalled();
          expect(returnedTx.toJSON()).toStrictEqual(signedNewFakeTx.toJSON());
        });

        it('passes correctly encoded EIP1559 transaction to ledger and return signed tx', async function () {
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
          jest
            .spyOn(TransactionFactory, 'fromTxData')
            .mockReturnValue(signedFakeTypeTwoTx);
          jest
            .spyOn(signedFakeTypeTwoTx, 'verifySignature')
            .mockReturnValue(true);

          jest.spyOn(fakeTypeTwoTx, 'verifySignature').mockReturnValue(true);
          jest
            .spyOn(keyring.bridge, 'deviceSignTransaction')
            .mockImplementation(async (params) => {
              expect(params).toStrictEqual({
                hdPath: "m/44'/60'/0'/0",
                tx: fakeTypeTwoTx.getMessageToSign(false).toString('hex'),
              });
              return expectedRSV;
            });

          const returnedTx = await keyring.signTransaction(
            fakeAccounts[0],
            fakeTypeTwoTx,
          );

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(keyring.bridge.deviceSignTransaction).toHaveBeenCalled();
          expect(returnedTx.toJSON()).toStrictEqual(
            signedFakeTypeTwoTx.toJSON(),
          );
        });
      });

      it('throws default error in signTransaction when unlockAccountByAddress returns undefined hdPath', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring, 'unlockAccountByAddress')
          .mockResolvedValue(undefined);

        await expect(
          keyring.signTransaction(fakeAccounts[0], fakeTx),
        ).rejects.toThrow('Ledger: Unknown error while signing transaction');
      });

      it('throws different error to the default one if the bridge error is an instance of the Error object', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignTransaction')
          .mockRejectedValue(new Error('some error'));

        await expect(
          keyring.signTransaction(fakeAccounts[0], fakeTx),
        ).rejects.toThrow('some error');
      });

      it('throws the default error if the bridge error is not an instance of the Error object', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignTransaction')
          .mockRejectedValue('some error');

        await expect(
          keyring.signTransaction(fakeAccounts[0], fakeTx),
        ).rejects.toThrow('Ledger: Unknown error while signing transaction');
      });

      it('throws an error if the signature is invalid', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignTransaction')
          .mockResolvedValue({ v: '0x1', r: '0x0', s: '0x0' });

        jest.spyOn(fakeTx, 'verifySignature').mockReturnValue(false);

        await expect(
          keyring.signTransaction(fakeAccounts[0], fakeTx),
        ).rejects.toThrow('Ledger: The transaction signature is not valid');
      });
    });

    describe('signPersonalMessage', function () {
      it('calls create a listener waiting for the iframe response', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignMessage')
          .mockImplementation(async (params) => {
            expect(params).toStrictEqual({
              hdPath: "m/44'/60'/0'/0",
              message: 'some message',
            });
            return { v: 1, r: '0x0', s: '0x0' };
          });

        jest
          .spyOn(sigUtil, 'recoverPersonalSignature')
          .mockReturnValue(fakeAccounts[0]);

        await keyring.signPersonalMessage(fakeAccounts[0], 'some message');

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(keyring.bridge.deviceSignMessage).toHaveBeenCalled();
      });

      it('throws the default error in personal sign if the unlockAccountByAddress method returns an undefined hdPath', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring, 'unlockAccountByAddress')
          .mockResolvedValue(undefined);

        await expect(
          keyring.signPersonalMessage(fakeAccounts[0], 'fakeTx'),
        ).rejects.toThrow('Ledger: Unknown error while signing message');
      });

      it('throws an error in personal sign if the deviceSignTransaction rejects with an error', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignMessage')
          .mockRejectedValue(new Error('some error'));

        await expect(
          keyring.signPersonalMessage(fakeAccounts[0], 'fakeTx'),
        ).rejects.toThrow('some error');
      });

      it('throws default error in personal sign when deviceSignTransaction rejects with an error that is not an instance of Error object', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignMessage')
          .mockRejectedValue('some error');

        await expect(
          keyring.signPersonalMessage(fakeAccounts[0], 'fakeTx'),
        ).rejects.toThrow('Ledger: Unknown error while signing message');
      });

      it('throws an error if the signature does not match the address', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignMessage')
          .mockResolvedValue({ v: 1, r: '0x0', s: '0x0' });

        jest.spyOn(sigUtil, 'recoverPersonalSignature').mockReturnValue('0x0');

        await expect(
          keyring.signPersonalMessage(fakeAccounts[0], 'some message'),
        ).rejects.toThrow(
          'Ledger: The signature doesnt match the right address',
        );
      });
    });

    describe('signMessage', function () {
      it('calls create a listener waiting for the iframe response', async function () {
        await basicSetupToUnlockOneAccount();
        jest
          .spyOn(keyring.bridge, 'deviceSignMessage')
          .mockImplementation(async (params) => {
            expect(params).toStrictEqual({
              hdPath: "m/44'/60'/0'/0",
              message: 'some message',
            });
            return { v: 1, r: '0x0', s: '0x0' };
          });

        jest
          .spyOn(sigUtil, 'recoverPersonalSignature')
          .mockReturnValue(fakeAccounts[0]);

        await keyring.signMessage(fakeAccounts[0], 'some message');

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(keyring.bridge.deviceSignMessage).toHaveBeenCalled();
      });
    });

    describe('unlockAccountByAddress', function () {
      it('unlocks the given account if found on device', async function () {
        await basicSetupToUnlockOneAccount();
        await keyring.unlockAccountByAddress(fakeAccounts[0]).then((hdPath) => {
          expect(hdPath).toBe("m/44'/60'/0'/0");
        });
      });

      it('rejects if the account is not found on device', async function () {
        const requestedAccount = fakeAccounts[0];
        const incorrectAccount = fakeAccounts[1];
        keyring.setAccountToUnlock(0);
        await keyring.addAccounts();
        jest.spyOn(keyring, 'unlock').mockResolvedValue(incorrectAccount);

        await expect(
          keyring.unlockAccountByAddress(requestedAccount),
        ).rejects.toThrow(
          `Ledger: Account ${fakeAccounts[0]} does not belong to the connected device`,
        );
      });

      it('throws an error if the account detail is not found', async function () {
        await basicSetupToUnlockOneAccount();
        keyring.accountDetails = {};
        await expect(
          keyring.unlockAccountByAddress(fakeAccounts[0]),
        ).rejects.toThrow(
          `Ledger: Account for address '${fakeAccounts[0]}' not found`,
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
        primaryType: 'Mail' as const,
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
        jest
          .spyOn(keyring, 'unlockAccountByAddress')
          .mockResolvedValue(`m/44'/60'/15'`);
        await basicSetupToUnlockOneAccount(15);
      });

      it('resolves properly when called', async function () {
        jest
          .spyOn(keyring.bridge, 'deviceSignTypedData')
          .mockImplementation(async () => ({
            v: 27,
            r: '72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b9',
            s: '46759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e32',
          }));

        const result = await keyring.signTypedData(
          fakeAccounts[15],
          fixtureData,
          options,
        );
        expect(result).toBe(
          '0x72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b946759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e321b',
        );
      });

      it('throws error when address does not match', async function () {
        jest
          .spyOn(keyring.bridge, 'deviceSignTypedData')
          // Changing v to 28 should cause a validation error
          .mockImplementation(async () => ({
            v: 28,
            r: '72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b9',
            s: '46759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e32',
          }));

        await expect(
          keyring.signTypedData(fakeAccounts[15], fixtureData, options),
        ).rejects.toThrow(
          'Ledger: The signature doesnt match the right address',
        );
      });

      it('throws an error if the signTypedData version is not v4', async function () {
        await expect(
          keyring.signTypedData(fakeAccounts[0], fixtureData, {
            version: 'V3',
          }),
        ).rejects.toThrow(
          'Ledger: Only version 4 of typed data signing is supported',
        );
      });

      it('throws an error if the version is not provided', async function () {
        await expect(
          keyring.signTypedData(fakeAccounts[0], fixtureData),
        ).rejects.toThrow(
          'Ledger: Only version 4 of typed data signing is supported',
        );
      });

      it('throws an error if the hdPath is not found', async function () {
        jest
          .spyOn(keyring, 'unlockAccountByAddress')
          .mockResolvedValue(undefined);
        await expect(
          keyring.signTypedData(fakeAccounts[0], fixtureData, options),
        ).rejects.toThrow('Ledger: Unknown error while signing message');
      });

      it('throws an error when deviceSignTypedData rejects with an error', async function () {
        jest
          .spyOn(keyring.bridge, 'deviceSignTypedData')
          .mockRejectedValue(new Error('some error'));

        await expect(
          keyring.signTypedData(fakeAccounts[15], fixtureData, options),
        ).rejects.toThrow('some error');
      });

      it('throws default error when deviceSignTypedData reject with an error that is not an instance of Error object', async function () {
        jest
          .spyOn(keyring.bridge, 'deviceSignTypedData')
          .mockRejectedValue('some error');

        await expect(
          keyring.signTypedData(fakeAccounts[15], fixtureData, options),
        ).rejects.toThrow('Ledger: Unknown error while signing message');
      });

      it('returns signature when recoveryId length < 2', async function () {
        jest.spyOn(keyring.bridge, 'deviceSignTypedData').mockResolvedValue({
          v: 0,
          r: '72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b9',
          s: '46759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e32',
        });
        const result = await keyring.signTypedData(
          fakeAccounts[15],
          fixtureData,
          options,
        );
        expect(result).toBe(
          '0x72d4e38a0e582e09a620fd38e236fe687a1ec782206b56d576f579c026a7e5b946759735981cd0c3efb02d36df28bb2feedfec3d90e408efc93f45b894946e3200',
        );
      });
    });

    describe('destroy', function () {
      it('calls the destroy bridge method', async function () {
        jest.spyOn(keyring.bridge, 'destroy').mockResolvedValue(undefined);

        await keyring.destroy();

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(bridge.destroy).toHaveBeenCalled();
      });
    });
  });
});
