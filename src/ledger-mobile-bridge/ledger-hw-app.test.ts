import Transport from '@ledgerhq/hw-transport';

import { MetaMaskLedgerHwAppEth } from './ledger-hw-app';

const DEVICE_ID = 'DEVICE_ID';

const mockTransport = {
  deviceModel: {
    id: DEVICE_ID,
  },
  send: jest.fn(),
  close: jest.fn(),
  decorateAppAPIMethods: jest.fn(),
};

describe('MetaMaskLedgerHwAppEth', function () {
  afterEach(function () {
    jest.clearAllMocks();
  });

  describe('openEthApp', function () {
    it('should send open eth app command correctly', async function () {
      const ethApp = new MetaMaskLedgerHwAppEth(
        mockTransport as unknown as Transport,
      );

      const transportSpy = jest
        .spyOn(mockTransport, 'send')
        .mockImplementation(async () => Promise.resolve(Buffer.alloc(1)));

      await ethApp.openEthApp();
      expect(transportSpy).toHaveBeenCalledTimes(1);
      expect(transportSpy).toHaveBeenCalledWith(
        0xe0,
        0xd8,
        0x00,
        0x00,
        Buffer.from('Ethereum', 'ascii'),
      );
    });
  });

  describe('closeApps', function () {
    it('should send close app command correctly', async function () {
      const ethApp = new MetaMaskLedgerHwAppEth(
        mockTransport as unknown as Transport,
      );

      const transportSpy = jest
        .spyOn(mockTransport, 'send')
        .mockImplementation(async () => Promise.resolve(Buffer.alloc(1)));

      await ethApp.closeApps();
      expect(transportSpy).toHaveBeenCalledTimes(1);
      expect(transportSpy).toHaveBeenCalledWith(0xb0, 0xa7, 0x00, 0x00);
    });
  });

  describe('getAppNameAndVersion', function () {
    it('should get appName and appVersion correctly', async function () {
      const appNameBuf = Buffer.alloc(7, 'appName', 'ascii');
      const verionBuf = Buffer.alloc(6, 'verion', 'ascii');
      const buffer = Buffer.alloc(20);
      buffer[0] = 1;
      buffer[1] = appNameBuf.length;
      let j = 2;
      for (let i = 0; i < appNameBuf.length; i++, j++) {
        buffer[j] = appNameBuf[i] ?? 0;
      }
      buffer[j] = verionBuf.length;
      j += 1;
      for (let i = 0; i < verionBuf.length; i++, j++) {
        buffer[j] = verionBuf[i] ?? 0;
      }

      const ethApp = new MetaMaskLedgerHwAppEth(
        mockTransport as unknown as Transport,
      );

      const transportSpy = jest
        .spyOn(mockTransport, 'send')
        .mockImplementation(async () => Promise.resolve(buffer));

      const result = await ethApp.getAppNameAndVersion();
      expect(transportSpy).toHaveBeenCalledTimes(1);
      expect(transportSpy).toHaveBeenCalledWith(0xb0, 0x01, 0x00, 0x00);
      expect(result).toStrictEqual({
        appName: 'appName',
        version: 'verion',
      });
    });

    it('should not throw error when result length less than expected', async function () {
      const buffer = Buffer.alloc(1);
      buffer[0] = 1;
      const ethApp = new MetaMaskLedgerHwAppEth(
        mockTransport as unknown as Transport,
      );
      const transportSpy = jest
        .spyOn(mockTransport, 'send')
        .mockImplementation(async () => Promise.resolve(buffer));

      const result = await ethApp.getAppNameAndVersion();
      expect(transportSpy).toHaveBeenCalledTimes(1);
      expect(transportSpy).toHaveBeenCalledWith(0xb0, 0x01, 0x00, 0x00);
      expect(result).toStrictEqual({
        appName: '',
        version: '',
      });
    });

    it('should throw error when first byte is not 1', async function () {
      const ethApp = new MetaMaskLedgerHwAppEth(
        mockTransport as unknown as Transport,
      );

      const transportSpy = jest
        .spyOn(mockTransport, 'send')
        .mockImplementation(async () => Promise.resolve(Buffer.alloc(1)));

      await expect(ethApp.getAppNameAndVersion()).rejects.toThrow(
        'Incorrect format return from getAppNameAndVersion.',
      );
      expect(transportSpy).toHaveBeenCalledTimes(1);
      expect(transportSpy).toHaveBeenCalledWith(0xb0, 0x01, 0x00, 0x00);
    });
  });
});
