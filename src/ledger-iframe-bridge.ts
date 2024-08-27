import {
  GetPublicKeyParams,
  GetPublicKeyResponse,
  LedgerBridge,
  LedgerSignMessageParams,
  LedgerSignMessageResponse,
  LedgerSignTransactionParams,
  LedgerSignTransactionResponse,
  LedgerSignTypedDataParams,
  LedgerSignTypedDataResponse,
} from './ledger-bridge';

const LEDGER_IFRAME_ID = 'LEDGER-IFRAME';

export enum IFrameMessageAction {
  LedgerConnectionChange = 'ledger-connection-change',
  LedgerUnlock = 'ledger-unlock',
  LedgerMakeApp = 'ledger-make-app',
  LedgerUpdateTransport = 'ledger-update-transport',
  LedgerSignTransaction = 'ledger-sign-transaction',
  LedgerSignPersonalMessage = 'ledger-sign-personal-message',
  LedgerSignTypedData = 'ledger-sign-typed-data',
}

type IFrameMessageResponseStub<
  SuccessResult extends Record<string, unknown>,
  FailureResult = Error,
> = {
  messageId: number;
} & (
  | { success: true; payload: SuccessResult }
  | { success: false; payload: { error: FailureResult } }
);

type LedgerConnectionChangeActionResponse = {
  messageId: number;
  action: IFrameMessageAction.LedgerConnectionChange;
  payload: { connected: boolean };
};

type LedgerMakeAppActionResponse = {
  messageId: number;
  action: IFrameMessageAction.LedgerMakeApp;
} & ({ success: true } | { success: false; error?: unknown });

type LedgerUpdateTransportActionResponse = {
  messageId: number;
  action: IFrameMessageAction.LedgerUpdateTransport;
  success: boolean;
};

type LedgerUnlockActionResponse = {
  action: IFrameMessageAction.LedgerUnlock;
} & IFrameMessageResponseStub<GetPublicKeyResponse>;

type LedgerSignTransactionActionResponse = {
  action: IFrameMessageAction.LedgerSignTransaction;
} & IFrameMessageResponseStub<LedgerSignTransactionResponse>;

type LedgerSignPersonalMessageActionResponse = {
  action: IFrameMessageAction.LedgerSignPersonalMessage;
} & IFrameMessageResponseStub<LedgerSignMessageResponse>;

type LedgerSignTypedDataActionResponse = {
  action: IFrameMessageAction.LedgerSignTypedData;
} & IFrameMessageResponseStub<LedgerSignTypedDataResponse>;

export type IFrameMessageResponse =
  | LedgerConnectionChangeActionResponse
  | LedgerMakeAppActionResponse
  | LedgerUpdateTransportActionResponse
  | LedgerUnlockActionResponse
  | LedgerSignTransactionActionResponse
  | LedgerSignPersonalMessageActionResponse
  | LedgerSignTypedDataActionResponse;

type IFrameMessage<TAction extends IFrameMessageAction> = {
  action: TAction;
  params?: Readonly<Record<string, unknown>>;
};

type IFramePostMessage<TAction extends IFrameMessageAction> =
  IFrameMessage<TAction> & {
    messageId: number;
    target: typeof LEDGER_IFRAME_ID;
  };

export type LedgerIframeBridgeOptions = {
  bridgeUrl: string;
};

export class LedgerIframeBridge
  implements LedgerBridge<LedgerIframeBridgeOptions>
{
  iframe?: HTMLIFrameElement;

  iframeLoaded = false;

  #opts: LedgerIframeBridgeOptions;

  eventListener?: (eventMessage: {
    origin: string;
    data: IFrameMessageResponse;
  }) => void;

  isDeviceConnected = false;

  currentMessageId = 0;

  messageCallbacks: Record<number, (response: IFrameMessageResponse) => void> =
    {};

  constructor(
    opts: LedgerIframeBridgeOptions = {
      bridgeUrl: 'https://metamask.github.io/eth-ledger-bridge-keyring',
    },
  ) {
    this.#validateConfiguration(opts);
    this.#opts = {
      bridgeUrl: opts?.bridgeUrl,
    };
  }

  async init() {
    await this.#setupIframe(this.#opts.bridgeUrl);

    this.eventListener = this.#eventListener.bind(this, this.#opts.bridgeUrl);

    window.addEventListener('message', this.eventListener);
  }

  async destroy() {
    if (this.eventListener) {
      window.removeEventListener('message', this.eventListener);
    }
  }

  async getOptions(): Promise<LedgerIframeBridgeOptions> {
    return this.#opts;
  }

  async setOptions(opts: LedgerIframeBridgeOptions): Promise<void> {
    this.#validateConfiguration(opts);
    if (this.#opts?.bridgeUrl !== opts.bridgeUrl) {
      this.#opts.bridgeUrl = opts.bridgeUrl;
      await this.destroy();
      await this.init();
    }
  }

  async attemptMakeApp(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.#sendMessage(
        {
          action: IFrameMessageAction.LedgerMakeApp,
        },
        (response) => {
          if ('success' in response && response.success) {
            resolve(true);
          } else if ('error' in response) {
            reject(response.error);
          } else {
            reject(new Error('Unknown error occurred'));
          }
        },
      );
    });
  }

  async updateTransportMethod(transportType: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // If the iframe isn't loaded yet, let's store the desired transportType value and
      // optimistically return a successful promise
      if (!this.iframeLoaded) {
        throw new Error('The iframe is not loaded yet');
      }

      this.#sendMessage(
        {
          action: IFrameMessageAction.LedgerUpdateTransport,
          params: { transportType },
        },
        (response) => {
          if ('success' in response && response.success) {
            return resolve(true);
          }
          return reject(new Error('Ledger transport could not be updated'));
        },
      );
    });
  }

  async getPublicKey(
    params: GetPublicKeyParams,
  ): Promise<GetPublicKeyResponse> {
    return this.#deviceActionMessage(IFrameMessageAction.LedgerUnlock, params);
  }

  async deviceSignTransaction(
    params: LedgerSignTransactionParams,
  ): Promise<LedgerSignTransactionResponse> {
    return this.#deviceActionMessage(
      IFrameMessageAction.LedgerSignTransaction,
      params,
    );
  }

  async deviceSignMessage(
    params: LedgerSignMessageParams,
  ): Promise<LedgerSignMessageResponse> {
    return this.#deviceActionMessage(
      IFrameMessageAction.LedgerSignPersonalMessage,
      params,
    );
  }

  async deviceSignTypedData(
    params: LedgerSignTypedDataParams,
  ): Promise<LedgerSignTypedDataResponse> {
    return this.#deviceActionMessage(
      IFrameMessageAction.LedgerSignTypedData,
      params,
    );
  }

  async #deviceActionMessage(
    action: IFrameMessageAction.LedgerUnlock,
    params: GetPublicKeyParams,
  ): Promise<GetPublicKeyResponse>;

  async #deviceActionMessage(
    action: IFrameMessageAction.LedgerSignTransaction,
    params: LedgerSignTransactionParams,
  ): Promise<LedgerSignTransactionResponse>;

  async #deviceActionMessage(
    action: IFrameMessageAction.LedgerSignPersonalMessage,
    params: LedgerSignMessageParams,
  ): Promise<LedgerSignMessageResponse>;

  async #deviceActionMessage(
    action: IFrameMessageAction.LedgerSignTypedData,
    params: LedgerSignTypedDataParams,
  ): Promise<LedgerSignTypedDataResponse>;

  async #deviceActionMessage(
    ...[action, params]:
      | [IFrameMessageAction.LedgerUnlock, GetPublicKeyParams]
      | [IFrameMessageAction.LedgerSignTransaction, LedgerSignTransactionParams]
      | [IFrameMessageAction.LedgerSignPersonalMessage, LedgerSignMessageParams]
      | [IFrameMessageAction.LedgerSignTypedData, LedgerSignTypedDataParams]
  ) {
    return new Promise((resolve, reject) => {
      this.#sendMessage(
        {
          action,
          params,
        },
        (response) => {
          if ('payload' in response && response.payload) {
            if ('success' in response && response.success) {
              return resolve(response.payload);
            }
            if ('error' in response.payload) {
              return reject(response.payload.error);
            }
          }
          return reject(new Error('Unknown error occurred'));
        },
      );
    });
  }

  async #setupIframe(bridgeUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.iframe = document.createElement('iframe');
      this.iframe.src = bridgeUrl;
      this.iframe.allow = `hid 'src'`;
      this.iframe.onload = async () => {
        this.iframeLoaded = true;
        resolve();
      };
      document.head.appendChild(this.iframe);
    });
  }

  #getOrigin(bridgeUrl: string) {
    const tmp = bridgeUrl.split('/');
    tmp.splice(-1, 1);
    return tmp.join('/');
  }

  #eventListener(
    bridgeUrl: string,
    eventMessage: {
      origin: string;
      data: IFrameMessageResponse;
    },
  ) {
    if (eventMessage.origin !== this.#getOrigin(bridgeUrl)) {
      return;
    }

    if (eventMessage.data) {
      const messageCallback =
        this.messageCallbacks[eventMessage.data.messageId];
      if (messageCallback) {
        messageCallback(eventMessage.data);
      } else if (
        eventMessage.data.action === IFrameMessageAction.LedgerConnectionChange
      ) {
        this.isDeviceConnected = eventMessage.data.payload.connected;
      }
    }
  }

  #sendMessage<TAction extends IFrameMessageAction>(
    message: IFrameMessage<TAction>,
    callback: (response: IFrameMessageResponse) => void,
  ) {
    this.currentMessageId += 1;

    const postMsg: IFramePostMessage<TAction> = {
      ...message,
      messageId: this.currentMessageId,
      target: LEDGER_IFRAME_ID,
    };

    this.messageCallbacks[this.currentMessageId] = callback;

    if (!this.iframeLoaded || !this.iframe || !this.iframe.contentWindow) {
      throw new Error('The iframe is not loaded yet');
    }

    this.iframe.contentWindow.postMessage(postMsg, '*');
  }

  #validateConfiguration(opts: LedgerIframeBridgeOptions): void {
    if (typeof opts.bridgeUrl !== 'string' || opts.bridgeUrl.length === 0) {
      throw new Error('bridgeURL is not a valid URL');
    }
  }
}
