import { hasProperty } from '@metamask/utils';
import { strict as assert } from 'assert';
import chai, { expect } from 'chai';
import spies from 'chai-spies';

import { LedgerIframeBridge } from './ledger-iframe-bridge';
import documentShim from '../test/document.shim';
import windowShim from '../test/window.shim';

global.document = documentShim;
global.window = windowShim;

// eslint-disable-next-line no-restricted-globals
type HTMLIFrameElementShim = HTMLIFrameElement;
// eslint-disable-next-line no-restricted-globals
type WindowShim = Window;

chai.use(spies);

/**
 * Checks if the iframe provided has a valid contentWindow
 * and onload function.
 *
 * @param iframe - The iframe to check.
 * @returns Returns true if the iframe is valid, false otherwise.
 */
function isIFrameValid(
  iframe?: HTMLIFrameElementShim,
): iframe is HTMLIFrameElementShim & { contentWindow: WindowShim } & {
  onload: () => any;
} {
  return (
    iframe !== undefined &&
    hasProperty(iframe, 'contentWindow') &&
    typeof iframe.onload === 'function' &&
    hasProperty(iframe.contentWindow as WindowShim, 'postMessage')
  );
}

/**
 * Simulates the loading of an iframe by calling the onload function.
 *
 * @param iframe - The iframe to simulate the loading of.
 * @returns Returns a promise that resolves when the onload function is called.
 */
async function simulateIFrameLoad(iframe?: HTMLIFrameElementShim) {
  if (!isIFrameValid(iframe)) {
    throw new Error('the iframe is not valid');
  }
  // we call manually the onload event to simulate the iframe loading
  return await iframe.onload();
}

describe('LedgerIframeBridge', function () {
  let bridge: LedgerIframeBridge;
  let sandbox: ChaiSpies.Sandbox;

  /**
   * Stubs the postMessage function of the keyring iframe.
   *
   * @param bridgeInstance - The bridge instance to stub.
   * @param fn - The function to call when the postMessage function is called.
   */
  function stubKeyringIFramePostMessage(
    bridgeInstance: LedgerIframeBridge,
    fn: (message: any) => void,
  ) {
    if (!isIFrameValid(bridgeInstance.iframe)) {
      throw new Error('the iframe is not valid');
    }

    sandbox.on(bridgeInstance.iframe.contentWindow, 'postMessage', fn);
  }

  beforeEach(async function () {
    sandbox = chai.spy.sandbox();

    bridge = new LedgerIframeBridge();
    await bridge.init('bridgeUrl');
    await simulateIFrameLoad(bridge.iframe);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('init', function () {
    it('sets up the listener and iframe', async function () {
      bridge = new LedgerIframeBridge();

      sandbox.on(global.window, 'addEventListener');

      const bridgeUrl = 'bridgeUrl';
      await bridge.init(bridgeUrl);

      expect(global.window.addEventListener).to.have.been.called();

      expect(bridge.bridgeUrl).to.equal(bridgeUrl);

      expect(bridge.iframeLoaded).to.equal(false);

      await simulateIFrameLoad(bridge.iframe);

      expect(bridge.iframeLoaded).to.equal(true);
    });
  });

  describe('destroy', function () {
    it('removes the message event listener', async function () {
      sandbox.on(global.window, 'removeEventListener');

      await bridge.destroy();

      expect(global.window.removeEventListener).to.have.been.called();
    });
  });

  describe('attemptMakeApp', function () {
    it('sends and processes a successful ledger-make-app message', async function () {
      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-make-app',
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: true,
        } as any);
      });

      const result = await bridge.attemptMakeApp();

      expect(result).to.equal(true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });

    it('throws an error when a ledger-make-app message is not successful', async function () {
      const errorMessage = 'Ledger Error';

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-make-app',
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          error: new Error(errorMessage),
          success: false,
        } as any);
      });

      try {
        await bridge.attemptMakeApp();
      } catch (error: any) {
        expect(error).to.be.an('error');
        expect(error.name).to.be.equal('Error');
        expect(error.message).to.be.equal(errorMessage);
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });

  describe('updateTransportMethod', function () {
    it('sends and processes a successful ledger-update-transport message', async function () {
      bridge.iframeLoaded = true;

      const transportType = 'u2f';

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-update-transport',
          params: { transportType },
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: true,
        } as any);
      });

      const result = await bridge.updateTransportMethod(transportType);

      expect(result).to.equal(true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });

    it('throws an error when a ledger-update-transport message is not successful', async function () {
      bridge.iframeLoaded = true;

      const transportType = 'u2f';

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-update-transport',
          params: { transportType },
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: false,
        } as any);
      });

      try {
        await bridge.updateTransportMethod(transportType);
      } catch (error: any) {
        expect(error).to.be.an('error');
        expect(error.name).to.be.equal('Error');
        expect(error.message).to.be.equal(
          'Ledger transport could not be updated',
        );
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });

  describe('getPublicKey', function () {
    it('sends and processes a successful ledger-unlock message', async function () {
      const payload = {};
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-unlock',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: true,
          payload,
        } as any);
      });

      const result = await bridge.getPublicKey(params);

      expect(result).to.equal(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });

    it('throws an error when a ledger-unlock message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-unlock',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: false,
          payload: { error: new Error(errorMessage) },
        } as any);
      });

      try {
        await bridge.getPublicKey(params);
      } catch (error: any) {
        expect(error).to.be.an('error');
        expect(error.name).to.be.equal('Error');
        expect(error.message).to.be.equal(errorMessage);
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });

  describe('deviceSignTransaction', function () {
    it('sends and processes a successful ledger-sign-transaction message', async function () {
      const payload = {};
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-sign-transaction',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: true,
          payload,
        } as any);
      });

      const result = await bridge.deviceSignTransaction(params);

      expect(result).to.equal(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });

    it('throws an error when a ledger-sign-transaction message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-sign-transaction',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: false,
          payload: { error: new Error(errorMessage) },
        } as any);
      });

      try {
        await bridge.deviceSignTransaction(params);
      } catch (error: any) {
        expect(error).to.be.an('error');
        expect(error.name).to.be.equal('Error');
        expect(error.message).to.be.equal(errorMessage);
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });

  describe('deviceSignMessage', function () {
    it('sends and processes a successful ledger-sign-personal-message message', async function () {
      const payload = {};
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-sign-personal-message',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: true,
          payload,
        } as any);
      });

      const result = await bridge.deviceSignMessage(params);

      expect(result).to.equal(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });

    it('throws an error when a ledger-sign-personal-message message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-sign-personal-message',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: false,
          payload: { error: new Error(errorMessage) },
        } as any);
      });

      try {
        await bridge.deviceSignMessage(params);
      } catch (error: any) {
        expect(error).to.be.an('error');
        expect(error.name).to.be.equal('Error');
        expect(error.message).to.be.equal(errorMessage);
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });

  describe('deviceSignTypedData', function () {
    it('sends and processes a successful ledger-sign-typed-data message', async function () {
      const payload = {};
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-sign-typed-data',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: true,
          payload,
        } as any);
      });

      const result = await bridge.deviceSignTypedData(params);

      expect(result).to.equal(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });

    it('throws an error when a ledger-sign-typed-data message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = {};

      stubKeyringIFramePostMessage(bridge, (message) => {
        assert.deepStrictEqual(message, {
          action: 'ledger-sign-typed-data',
          params,
          messageId: 1,
          target: 'LEDGER-IFRAME',
        });

        bridge.messageCallbacks[message.messageId]?.({
          success: false,
          payload: { error: new Error(errorMessage) },
        } as any);
      });

      try {
        await bridge.deviceSignTypedData(params);
      } catch (error: any) {
        expect(error).to.be.an('error');
        expect(error.name).to.be.equal('Error');
        expect(error.message).to.be.equal(errorMessage);
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).to.have.been.called();
    });
  });
});
