import ledgerService from '@ledgerhq/hw-app-eth/lib/services/ledger';
import Transport from '@ledgerhq/hw-transport';

import {
  LedgerMobileBridge,
  LedgerTransportMiddleware,
} from './ledger-mobile-bridge';

const DEVICE_ID = 'DEVICE_ID';

const mockTransport = {
  deviceModel: {
    id: DEVICE_ID,
  },
  send: jest.fn(),
  close: jest.fn(),
  decorateAppAPIMethods: jest.fn(),
};

describe('LedgerMobileBridge', function () {
  let bridge: LedgerMobileBridge;
  let transportMiddleware: LedgerTransportMiddleware;
  let transportMiddlewareDisposeSpy: jest.SpyInstance;
  let transportMiddlewareSetTransportSpy: jest.SpyInstance;
  let transportMiddlewareGetEthAppSpy: jest.SpyInstance;
  let transportMiddlewareInitAppSpy: jest.SpyInstance;
  const mockEthApp = {
    signEIP712HashedMessage: jest.fn(),
    signTransaction: jest.fn(),
    getAddress: jest.fn(),
    signPersonalMessage: jest.fn(),
  };

  beforeEach(async function () {
    transportMiddleware = new LedgerTransportMiddleware();
    transportMiddlewareDisposeSpy = jest
      .spyOn(transportMiddleware, 'dispose')
      .mockImplementation(async () => Promise.resolve());
    transportMiddlewareSetTransportSpy = jest
      .spyOn(transportMiddleware, 'setTransport')
      .mockImplementation(async () => Promise.resolve());
    transportMiddlewareInitAppSpy = jest
      .spyOn(transportMiddleware, 'initEthApp')
      .mockImplementation(async () => Promise.resolve());
    transportMiddlewareGetEthAppSpy = jest
      .spyOn(transportMiddleware, 'getEthApp')
      .mockImplementation(async () => Promise.resolve(mockEthApp as any));
    bridge = new LedgerMobileBridge(transportMiddleware);
  });

  afterEach(function () {
    jest.clearAllMocks();
    mockTransport.deviceModel.id = DEVICE_ID;
  });

  describe('destroy', function () {
    it('trigger middleware dispose', async function () {
      await bridge.connect(mockTransport as unknown as Transport, DEVICE_ID);
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

  describe('updateTransportMethod', function () {
    it('throw error not supported', async function () {
      await expect(bridge.updateTransportMethod()).rejects.toThrow(
        'Method not supported.',
      );
    });
  });

  describe('forgetDevice', function () {
    it('clean up', async function () {
      bridge.setDeviceId(DEVICE_ID);
      await bridge.forgetDevice();
      expect(bridge.isDeviceConnected).toBe(false);
      expect(bridge.getDeviceId()).toBe('');
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

  describe('deserializeData', function () {
    it('data has assigned to instance', async function () {
      bridge.setDeviceId('');
      await bridge.deserializeData({ deviceId: DEVICE_ID });
      expect(bridge.getDeviceId()).toBe(DEVICE_ID);
    });
  });

  describe('serializeData', function () {
    it('return struct data', async function () {
      await bridge.deserializeData({ deviceId: DEVICE_ID });
      const result = await bridge.serializeData();
      expect(result).toStrictEqual({
        deviceId: DEVICE_ID,
      });
    });
  });

  describe('connect', function () {
    it('connect with correct parameters', async function () {
      await bridge.connect(mockTransport as unknown as Transport, DEVICE_ID);
      expect(transportMiddlewareSetTransportSpy).toHaveBeenCalledTimes(1);
      expect(transportMiddlewareSetTransportSpy).toHaveBeenCalledWith(
        mockTransport,
      );
      expect(transportMiddlewareInitAppSpy).toHaveBeenCalledTimes(1);
      expect(bridge.getDeviceId()).toBe(DEVICE_ID);
      expect(bridge.isDeviceConnected).toBe(true);
      mockTransport.deviceModel.id = '';
    });

    it('throw error when device id not set from transport', async function () {
      mockTransport.deviceModel.id = '';
      await expect(
        bridge.connect(mockTransport as unknown as Transport, DEVICE_ID),
      ).rejects.toThrow('device id is not defined.');
    });
  });

  describe('openEthApp', function () {
    it('transport command should send correctly', async function () {
      const transportMiddlewareSendSpy = jest
        .spyOn(transportMiddleware, 'send')
        .mockImplementation(async () => Promise.resolve(Buffer.alloc(1)));
      await bridge.openEthApp();
      expect(transportMiddlewareSendSpy).toHaveBeenCalledTimes(1);
      expect(transportMiddlewareSendSpy).toHaveBeenCalledWith(
        0xe0,
        0xd8,
        0x00,
        0x00,
        Buffer.from(
          transportMiddleware.ethAppName,
          transportMiddleware.transportEncoding,
        ),
      );
    });
  });

  describe('closeApps', function () {
    it('transport command should send correctly', async function () {
      const transportMiddlewareSendSpy = jest
        .spyOn(transportMiddleware, 'send')
        .mockImplementation(async () => Promise.resolve(Buffer.alloc(1)));
      await bridge.closeApps();
      expect(transportMiddlewareSendSpy).toHaveBeenCalledTimes(1);
      expect(transportMiddlewareSendSpy).toHaveBeenCalledWith(
        0xb0,
        0xa7,
        0x00,
        0x00,
      );
    });
  });

  describe('getEthAppNameAndVersion', function () {
    it('transport command should send correctly', async function () {
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

      const transportMiddlewareSendSpy = jest
        .spyOn(transportMiddleware, 'send')
        .mockImplementation(async () => Promise.resolve(buffer));

      const result = await bridge.getEthAppNameAndVersion();
      expect(transportMiddlewareSendSpy).toHaveBeenCalledTimes(1);
      expect(transportMiddlewareSendSpy).toHaveBeenCalledWith(
        0xb0,
        0x01,
        0x00,
        0x00,
      );
      expect(result).toStrictEqual({
        appName: 'appName',
        version: 'verion',
      });
    });

    it('throw error when buffer incorrect', async function () {
      jest
        .spyOn(transportMiddleware, 'send')
        .mockImplementation(async () => Promise.resolve(Buffer.alloc(1)));
      await expect(bridge.getEthAppNameAndVersion()).rejects.toThrow(
        'getEthAppNameAndVersion: format not supported',
      );
    });
  });

  describe('setOption', function () {
    it('option set correctly', async function () {
      bridge.setDeviceId('');
      await bridge.setOptions({ deviceId: DEVICE_ID });
      expect(bridge.getDeviceId()).toBe(DEVICE_ID);
    });

    it('throw error when device id has set but different device id given', async function () {
      await bridge.setOptions({ deviceId: DEVICE_ID });
      await expect(
        bridge.setOptions({ deviceId: 'another id' }),
      ).rejects.toThrow('deviceId mismatch.');
    });
  });

  describe('getOption', function () {
    it('return instance options', async function () {
      await bridge.setOptions({ deviceId: DEVICE_ID });
      const result = await bridge.getOptions();
      expect(result).toStrictEqual({
        deviceId: DEVICE_ID,
      });
    });
  });
});

describe('LedgerTransportMiddleware', function () {
  let transportMiddleware: LedgerTransportMiddleware;

  beforeEach(async function () {
    transportMiddleware = new LedgerTransportMiddleware();
    await transportMiddleware.setTransport(mockTransport as any);
  });

  afterEach(function () {
    jest.clearAllMocks();
  });

  describe('dispose', function () {
    it('transport should close', async function () {
      await transportMiddleware.dispose();
      expect(mockTransport.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('setTransport', function () {
    it('transport should set', async function () {
      transportMiddleware = new LedgerTransportMiddleware();
      await expect(transportMiddleware.getTransport()).rejects.toThrow(Error);
      await transportMiddleware.setTransport(mockTransport as any);
      expect(transportMiddleware.getTransport()).toBeDefined();
    });
  });

  describe('getTransport', function () {
    it('return transport', async function () {
      const transport = await transportMiddleware.getTransport();
      expect(transport).toBe(mockTransport);
    });

    it('throw error when transport not set', async function () {
      transportMiddleware = new LedgerTransportMiddleware();
      await expect(transportMiddleware.getTransport()).rejects.toThrow(
        'Ledger transport is not initialized. You must call setTransport first.',
      );
    });
  });

  describe('getEthApp', function () {
    it('return eth app', async function () {
      transportMiddleware = new LedgerTransportMiddleware();
      await transportMiddleware.setTransport(mockTransport as any);
      await transportMiddleware.initEthApp();
      const app = await transportMiddleware.getEthApp();
      expect(app).toBeDefined();
    });

    it('throw error when app not set', async function () {
      await expect(transportMiddleware.getEthApp()).rejects.toThrow(
        'Ledger app is not initialized. You must call setTransport first.',
      );
    });
  });

  describe('initEthApp', function () {
    it('eth app should set', async function () {
      await expect(transportMiddleware.getEthApp()).rejects.toThrow(Error);
      await transportMiddleware.initEthApp();
      expect(transportMiddleware.getEthApp()).toBeDefined();
    });

    it('throw error when transport not set', async function () {
      transportMiddleware = new LedgerTransportMiddleware();
      await expect(transportMiddleware.initEthApp()).rejects.toThrow(
        'Ledger transport is not initialized. You must call setTransport first.',
      );
    });
  });

  describe('send', function () {
    it('transport cmd should send correctly', async function () {
      await transportMiddleware.send(0xb0, 0x01, 0x00, 0x00);
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      expect(mockTransport.send).toHaveBeenCalledWith(
        0xb0,
        0x01,
        0x00,
        0x00,
        Buffer.alloc(0),
      );
    });
  });
});
