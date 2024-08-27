import Transport from '@ledgerhq/hw-transport';

import { LedgerTransportMiddleware } from './ledger-transport-middleware';

const DEVICE_ID = 'DEVICE_ID';

const mockTransport = {
  deviceModel: {
    id: DEVICE_ID,
  },
  send: jest.fn(),
  close: jest.fn(),
  decorateAppAPIMethods: jest.fn(),
};

describe('LedgerTransportMiddleware', function () {
  let transportMiddleware: LedgerTransportMiddleware;

  beforeEach(async function () {
    transportMiddleware = new LedgerTransportMiddleware();
    transportMiddleware.setTransport(mockTransport as unknown as Transport);
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
      expect(() => transportMiddleware.getTransport()).toThrow(Error);
      transportMiddleware.setTransport(mockTransport as any);
      expect(() => transportMiddleware.getTransport()).toBeDefined();
    });
  });

  describe('getTransport', function () {
    it('return transport', async function () {
      const transport = transportMiddleware.getTransport();
      expect(transport).toBe(mockTransport);
    });

    it('throw error when transport not set', async function () {
      transportMiddleware = new LedgerTransportMiddleware();
      expect(() => transportMiddleware.getTransport()).toThrow(
        'Instance `transport` is not initialized.',
      );
    });
  });

  describe('getEthApp', function () {
    it('return eth app', async function () {
      transportMiddleware = new LedgerTransportMiddleware();
      transportMiddleware.setTransport(mockTransport as unknown as Transport);
      const app = transportMiddleware.getEthApp();
      expect(app).toBeDefined();
    });

    it('throws an error when the transport object is not set', async function () {
      transportMiddleware = new LedgerTransportMiddleware();
      expect(() => transportMiddleware.getEthApp()).toThrow(
        'Instance `transport` is not initialized.',
      );
    });
  });
});
