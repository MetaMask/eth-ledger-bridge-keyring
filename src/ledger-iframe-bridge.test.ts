import { hasProperty } from '@metamask/utils';

import {
  IFrameMessageAction,
  LedgerIframeBridge,
} from './ledger-iframe-bridge';
import documentShim from '../test/document.shim';
import windowShim from '../test/window.shim';

global.document = documentShim;
global.window = windowShim;

// eslint-disable-next-line no-restricted-globals
type HTMLIFrameElementShim = HTMLIFrameElement;
// eslint-disable-next-line no-restricted-globals
type WindowShim = Window;

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

const LEDGER_IFRAME_ID = 'LEDGER-IFRAME';

describe('LedgerIframeBridge', function () {
  let bridge: LedgerIframeBridge;

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

    jest
      .spyOn(bridgeInstance.iframe.contentWindow, 'postMessage')
      .mockImplementation(fn);
  }

  beforeEach(async function () {
    bridge = new LedgerIframeBridge();
    await bridge.init();
    await simulateIFrameLoad(bridge.iframe);
  });

  afterEach(function () {
    jest.clearAllMocks();
  });

  describe('init', function () {
    it('sets up the listener and iframe', async function () {
      bridge = new LedgerIframeBridge();

      const addEventListenerSpy = jest.spyOn(global.window, 'addEventListener');

      await bridge.init();

      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(bridge.iframeLoaded).toBe(false);

      await simulateIFrameLoad(bridge.iframe);
      expect(bridge.iframeLoaded).toBe(true);
    });
  });

  describe('destroy', function () {
    it('removes the message event listener', async function () {
      const removeEventListenerSpy = jest.spyOn(
        global.window,
        'removeEventListener',
      );

      await bridge.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('attemptMakeApp', function () {
    it('sends and processes a successful ledger-make-app message', async function () {
      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerMakeApp,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerMakeApp,
          messageId: 1,
          success: true,
        });
      });

      const result = await bridge.attemptMakeApp();

      expect(result).toBe(true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });

    it('throws an error when a ledger-make-app message is not successful', async function () {
      const errorMessage = 'Ledger Error';

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerMakeApp,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerMakeApp,
          messageId: 1,
          success: false,
          error: new Error(errorMessage),
        });
      });

      await expect(bridge.attemptMakeApp()).rejects.toThrow(errorMessage);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });
  });

  describe('updateTransportMethod', function () {
    it('sends and processes a successful ledger-update-transport message', async function () {
      bridge.iframeLoaded = true;

      const transportType = 'u2f';

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerUpdateTransport,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params: { transportType },
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerUpdateTransport,
          messageId: 1,
          success: true,
        });
      });

      const result = await bridge.updateTransportMethod(transportType);

      expect(result).toBe(true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });

    it('throws an error when a ledger-update-transport message is not successful', async function () {
      bridge.iframeLoaded = true;

      const transportType = 'u2f';

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: 'ledger-update-transport',
          messageId: 1,
          params: { transportType },
          target: LEDGER_IFRAME_ID,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerUpdateTransport,
          messageId: 1,
          success: false,
        });
      });

      await expect(bridge.updateTransportMethod(transportType)).rejects.toThrow(
        'Ledger transport could not be updated',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });
  });

  describe('getPublicKey', function () {
    it('sends and processes a successful ledger-unlock message', async function () {
      const payload = {
        publicKey: '',
        address: '',
        chainCode: '',
      };
      const params = {
        hdPath: "m/44'/60'/0'/0",
      };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerUnlock,
          params,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerUnlock,
          messageId: 1,
          success: true,
          payload,
        });
      });

      const result = await bridge.getPublicKey(params);

      expect(result).toBe(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });

    it('throws an error when a ledger-unlock message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = {
        hdPath: "m/44'/60'/0'/0",
      };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerUnlock,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerUnlock,
          messageId: 1,
          success: false,
          payload: { error: new Error(errorMessage) },
        });
      });

      await expect(bridge.getPublicKey(params)).rejects.toThrow(errorMessage);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });
  });

  describe('deviceSignTransaction', function () {
    it('sends and processes a successful ledger-sign-transaction message', async function () {
      const payload = {
        v: '',
        r: '',
        s: '',
      };
      const params = {
        hdPath: "m/44'/60'/0'/0",
        tx: '',
      };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerSignTransaction,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerSignTransaction,
          messageId: 1,
          success: true,
          payload,
        });
      });

      const result = await bridge.deviceSignTransaction(params);

      expect(result).toBe(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });

    it('throws an error when a ledger-sign-transaction message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = { hdPath: "m/44'/60'/0'/0", tx: '' };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerSignTransaction,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerSignTransaction,
          messageId: 1,
          success: false,
          payload: { error: new Error(errorMessage) },
        });
      });

      await expect(bridge.deviceSignTransaction(params)).rejects.toThrow(
        errorMessage,
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });
  });

  describe('deviceSignMessage', function () {
    it('sends and processes a successful ledger-sign-personal-message message', async function () {
      const payload = {
        v: 0,
        r: '',
        s: '',
      };
      const params = { hdPath: "m/44'/60'/0'/0", message: '' };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerSignPersonalMessage,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerSignPersonalMessage,
          messageId: 1,
          success: true,
          payload,
        });
      });

      const result = await bridge.deviceSignMessage(params);

      expect(result).toBe(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });

    it('throws an error when a ledger-sign-personal-message message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = { hdPath: "m/44'/60'/0'/0", message: '' };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerSignPersonalMessage,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerSignPersonalMessage,
          messageId: 1,
          success: false,
          payload: { error: new Error(errorMessage) },
        });
      });

      await expect(bridge.deviceSignMessage(params)).rejects.toThrow(
        errorMessage,
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });
  });

  describe('deviceSignTypedData', function () {
    it('sends and processes a successful ledger-sign-typed-data message', async function () {
      const payload = {
        v: 0,
        r: '',
        s: '',
      };
      const params = {
        hdPath: "m/44'/60'/0'/0",
        domainSeparatorHex: '',
        hashStructMessageHex: '',
      };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerSignTypedData,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerSignTypedData,
          messageId: 1,
          success: true,
          payload,
        });
      });

      const result = await bridge.deviceSignTypedData(params);

      expect(result).toBe(payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });

    it('throws an error when a ledger-sign-typed-data message is not successful', async function () {
      const errorMessage = 'Ledger Error';
      const params = {
        hdPath: "m/44'/60'/0'/0",
        domainSeparatorHex: '',
        hashStructMessageHex: '',
      };

      stubKeyringIFramePostMessage(bridge, (message) => {
        expect(message).toStrictEqual({
          action: IFrameMessageAction.LedgerSignTypedData,
          messageId: 1,
          target: LEDGER_IFRAME_ID,
          params,
        });

        bridge.messageCallbacks[message.messageId]?.({
          action: IFrameMessageAction.LedgerSignTypedData,
          messageId: 1,
          success: false,
          payload: { error: new Error(errorMessage) },
        });
      });

      await expect(bridge.deviceSignTypedData(params)).rejects.toThrow(
        errorMessage,
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(bridge.iframe?.contentWindow?.postMessage).toHaveBeenCalled();
    });
  });
});
