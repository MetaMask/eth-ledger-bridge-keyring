import ledgerService from '@ledgerhq/hw-app-eth/lib/services/ledger';
import Transport from '@ledgerhq/hw-transport';

import { LedgerMobileBridge } from './ledger-mobile-bridge';
import {
  LedgerTransportMiddleware,
  MetaMaskLedgerHwAppEth,
} from './ledger-mobile-bridge/';

const DEVICE_ID = 'DEVICE_ID';

describe('LedgerMobileBridge', function () {
  let bridge: LedgerMobileBridge;
  let transportMiddleware: LedgerTransportMiddleware;
  let transportMiddlewareDisposeSpy: jest.SpyInstance;
  let transportMiddlewareSetTransportSpy: jest.SpyInstance;
  let transportMiddlewareGetEthAppSpy: jest.SpyInstance;

  const mockEthApp = {
    signEIP712HashedMessage: jest.fn(),
    signTransaction: jest.fn(),
    getAddress: jest.fn(),
    signPersonalMessage: jest.fn(),
    openEthApp: jest.fn(),
    closeApps: jest.fn(),
    getAppNameAndVersion: jest.fn(),
  };

  const mockTransport = {
    deviceModel: {
      id: DEVICE_ID,
    },
    send: jest.fn(),
    close: jest.fn(),
    decorateAppAPIMethods: jest.fn(),
  };

  beforeEach(async function () {
    transportMiddleware = new LedgerTransportMiddleware();
    transportMiddlewareDisposeSpy = jest
      .spyOn(transportMiddleware, 'dispose')
      .mockImplementation(async () => Promise.resolve());
    transportMiddlewareSetTransportSpy = jest.spyOn(
      transportMiddleware,
      'setTransport',
    );
    transportMiddlewareGetEthAppSpy = jest
      .spyOn(transportMiddleware, 'getEthApp')
      .mockImplementation(
        () => mockEthApp as unknown as MetaMaskLedgerHwAppEth,
      );
    bridge = new LedgerMobileBridge(transportMiddleware);
  });

  afterEach(function () {
    jest.clearAllMocks();
    mockTransport.deviceModel.id = DEVICE_ID;
  });

  describe('destroy', function () {
    it('trigger middleware dispose', async function () {
      await bridge.updateTransportMethod(mockTransport as unknown as Transport);
      expect(bridge.isDeviceConnected).toBe(true);
      await bridge.destroy();
      expect(transportMiddlewareDisposeSpy).toHaveBeenCalledTimes(1);
      expect(bridge.isDeviceConnected).toBe(false);
    });

    it('does not throw error when it is not connected', async function () {
      let result = null;
      try {
        await bridge.destroy();
      } catch (error) {
        result = error;
      } finally {
        expect(result).toBeNull();
        expect(transportMiddlewareDisposeSpy).toHaveBeenCalledTimes(1);
        expect(bridge.isDeviceConnected).toBe(false);
      }
    });
  });

  describe('attemptMakeApp', function () {
    it('throw error not supported', async function () {
      await expect(bridge.attemptMakeApp()).rejects.toThrow(
        'Method not supported.',
      );
    });
  });

  describe('deviceSignMessage', function () {
    it('sends and processes a successful ledger-sign-personal-message message', async function () {
      const hdPath = "m/44'/60'/0'/0/0";
      const message = 'message';
      await bridge.deviceSignMessage({
        hdPath,
        message,
      });
      expect(transportMiddlewareGetEthAppSpy).toHaveBeenCalledTimes(1);
      expect(mockEthApp.signPersonalMessage).toHaveBeenCalledTimes(1);
      expect(mockEthApp.signPersonalMessage).toHaveBeenCalledWith(
        hdPath,
        message,
      );
    });
  });

  describe('getPublicKey', function () {
    it('sends and processes a successful ledger-unlock message', async function () {
      const hdPath = "m/44'/60'/0'/0/0";
      await bridge.getPublicKey({
        hdPath,
      });
      expect(transportMiddlewareGetEthAppSpy).toHaveBeenCalledTimes(1);
      expect(mockEthApp.getAddress).toHaveBeenCalledTimes(1);
      expect(mockEthApp.getAddress).toHaveBeenCalledWith(hdPath, false, true);
    });
  });

  describe('deviceSignTransaction', function () {
    it('sends and processes a successful ledger-sign-transaction message', async function () {
      const hdPath = "m/44'/60'/0'/0/0";
      const tx =
        'f86d8202b38477359400825208944592d8f8d7b001e72cb26a73e4fa1806a51ac79d880de0b6b3a7640000802ba0699ff162205967ccbabae13e07cdd4284258d46ec1051a70a51be51ec2bc69f3a04e6944d508244ea54a62ebf9a72683eeadacb73ad7c373ee542f1998147b220e';
      const resolution = await ledgerService.resolveTransaction(tx, {}, {});
      await bridge.deviceSignTransaction({
        hdPath,
        tx,
      });
      expect(transportMiddlewareGetEthAppSpy).toHaveBeenCalledTimes(1);
      expect(mockEthApp.signTransaction).toHaveBeenCalledTimes(1);
      expect(mockEthApp.signTransaction).toHaveBeenCalledWith(
        hdPath,
        tx,
        resolution,
      );
    });

    it('throws an error when tx format is not correct', async function () {
      const hdPath = "m/44'/60'/0'/0/0";
      const tx = '';
      await expect(
        bridge.deviceSignTransaction({
          hdPath,
          tx,
        }),
      ).rejects.toThrow(Error);
      expect(transportMiddlewareGetEthAppSpy).toHaveBeenCalledTimes(0);
      expect(mockEthApp.signTransaction).toHaveBeenCalledTimes(0);
    });
  });

  describe('deviceSignTypedData', function () {
    it('sends and processes a successful ledger-sign-typed-data message', async function () {
      const hdPath = "m/44'/60'/0'/0/0";
      const domainSeparatorHex = 'domainSeparatorHex';
      const hashStructMessageHex = 'hashStructMessageHex';
      await bridge.deviceSignTypedData({
        hdPath,
        domainSeparatorHex,
        hashStructMessageHex,
      });
      expect(transportMiddlewareGetEthAppSpy).toHaveBeenCalledTimes(1);
      expect(mockEthApp.signEIP712HashedMessage).toHaveBeenCalledTimes(1);
      expect(mockEthApp.signEIP712HashedMessage).toHaveBeenCalledWith(
        hdPath,
        domainSeparatorHex,
        hashStructMessageHex,
      );
    });
  });

  describe('updateTransportMethod', function () {
    it('set transport in transportMiddleware and set isDeviceConnected to true', async function () {
      await bridge.updateTransportMethod(mockTransport as unknown as Transport);
      expect(transportMiddlewareSetTransportSpy).toHaveBeenCalledTimes(1);
      expect(transportMiddlewareSetTransportSpy).toHaveBeenCalledWith(
        mockTransport,
      );
      expect(bridge.isDeviceConnected).toBe(true);
    });

    it('throw error when device id not set from transport', async function () {
      mockTransport.deviceModel.id = '';
      await expect(
        bridge.updateTransportMethod(mockTransport as unknown as Transport),
      ).rejects.toThrow(
        'Property `deviceModel.id` is not defined in `transport`.',
      );
    });
  });

  describe('openEthApp', function () {
    it('transport command should send correctly', async function () {
      await bridge.openEthApp();
      expect(mockEthApp.openEthApp).toHaveBeenCalledTimes(1);
    });
  });

  describe('closeApps', function () {
    it('transport command should send correctly', async function () {
      await bridge.closeApps();
      expect(mockEthApp.closeApps).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAppNameAndVersion', function () {
    it('transport command should send correctly', async function () {
      await bridge.getAppNameAndVersion();
      expect(mockEthApp.getAppNameAndVersion).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOption', function () {
    it('return instance options', async function () {
      const result = await bridge.getOptions();
      expect(result).toStrictEqual({});
    });
  });
});
