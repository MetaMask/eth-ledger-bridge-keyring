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
  LedgerBridgeSerializeData,
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

type IFrameMessageResponse<TAction extends IFrameMessageAction> = {
  action: TAction;
  messageId: number;
} & (
  | {
      action: IFrameMessageAction.LedgerConnectionChange;
      payload: { connected: boolean };
    }
  | ({
      action: IFrameMessageAction.LedgerMakeApp;
    } & ({ success: true } | { success: false; error?: unknown }))
  | {
      action: IFrameMessageAction.LedgerUpdateTransport;
      success: boolean;
    }
  | ({
      action: IFrameMessageAction.LedgerUnlock;
    } & (
      | { success: true; payload: GetPublicKeyResponse }
      | { success: false; payload: { error: Error } }
    ))
  | ({
      action: IFrameMessageAction.LedgerSignTransaction;
    } & (
      | { success: true; payload: LedgerSignTransactionResponse }
      | { success: false; payload: { error: Error } }
    ))
  | ({
      action:
        | IFrameMessageAction.LedgerSignPersonalMessage
        | IFrameMessageAction.LedgerSignTypedData;
    } & (
      | {
          success: true;
          payload: LedgerSignMessageResponse | LedgerSignTypedDataResponse;
        }
      | { success: false; payload: { error: Error } }
    ))
);

type IFrameMessage<TAction extends IFrameMessageAction> = {
  action: TAction;
  params?: Readonly<Record<string, unknown>>;
};

type IFramePostMessage<TAction extends IFrameMessageAction> =
  IFrameMessage<TAction> & {
    messageId: number;
    target: typeof LEDGER_IFRAME_ID;
  };

const BRIDGE_URL = 'https://metamask.github.io/eth-ledger-bridge-keyring';

export type LedgerIframeBridgeOptions = {
  bridgeUrl: string;
};

export class LedgerIframeBridge
  implements LedgerBridge<LedgerIframeBridgeOptions>
{
  iframe?: HTMLIFrameElement;

  iframeLoaded = false;

  bridgeUrl = '';

  eventListener?: (eventMessage: {
    origin: string;
    data: IFrameMessageResponse<IFrameMessageAction>;
  }) => void;

  isDeviceConnected = false;

  currentMessageId = 0;

  messageCallbacks: Record<
    number,
    (response: IFrameMessageResponse<IFrameMessageAction>) => void
  > = {};

  delayedPromise?: {
    resolve: (value: boolean) => void;
    reject: (error: unknown) => void;
    transportType: string;
  };

  constructor(opts?: LedgerIframeBridgeOptions) {
    this.bridgeUrl = opts?.bridgeUrl ?? BRIDGE_URL;
  }

  async init() {
    this.#setupIframe(this.bridgeUrl);

    this.eventListener = this.#eventListener.bind(this, this.bridgeUrl);

    window.addEventListener('message', this.eventListener);
  }

  async destroy() {
    if (this.eventListener) {
      window.removeEventListener('message', this.eventListener);
    }
  }

  async deserializeData(
    serializeData: LedgerBridgeSerializeData,
  ): Promise<void> {
    this.bridgeUrl = (serializeData.bridgeUrl as string) ?? this.bridgeUrl;
  }

  async serializeData(): Promise<LedgerBridgeSerializeData> {
    return {
      bridgeUrl: this.bridgeUrl,
    };
  }

  async getOptions(): Promise<LedgerIframeBridgeOptions> {
    return { bridgeUrl: this.bridgeUrl };
  }

  async setOptions(opts: LedgerIframeBridgeOptions): Promise<void> {
    if (opts.bridgeUrl && this.bridgeUrl !== opts.bridgeUrl) {
      this.bridgeUrl = opts.bridgeUrl;
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
          if (response.success) {
            resolve(true);
          } else {
            reject(response.error);
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
        this.delayedPromise = {
          resolve,
          reject,
          transportType,
        };
        return;
      }

      this.#sendMessage(
        {
          action: IFrameMessageAction.LedgerUpdateTransport,
          params: { transportType },
        },
        ({ success }) => {
          if (success) {
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
        ({ success, payload }) => {
          if (success) {
            return resolve(payload);
          }
          return reject(payload.error);
        },
      );
    });
  }

  #setupIframe(bridgeUrl: string) {
    this.iframe = document.createElement('iframe');
    this.iframe.src = bridgeUrl;
    this.iframe.allow = `hid 'src'`;
    this.iframe.onload = async () => {
      // If the ledger live preference was set before the iframe is loaded,
      // set it after the iframe has loaded
      this.iframeLoaded = true;
      if (this.delayedPromise) {
        try {
          const result = await this.updateTransportMethod(
            this.delayedPromise.transportType,
          );
          this.delayedPromise.resolve(result);
        } catch (error) {
          this.delayedPromise.reject(error);
        } finally {
          delete this.delayedPromise;
        }
      }
    };
    document.head.appendChild(this.iframe);
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
      data: IFrameMessageResponse<IFrameMessageAction>;
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
    callback: (response: IFrameMessageResponse<TAction>) => void,
  ) {
    this.currentMessageId += 1;

    const postMsg: IFramePostMessage<TAction> = {
      ...message,
      messageId: this.currentMessageId,
      target: LEDGER_IFRAME_ID,
    };

    this.messageCallbacks[this.currentMessageId] = callback as (
      response: IFrameMessageResponse<IFrameMessageAction>,
    ) => void;

    if (!this.iframeLoaded || !this.iframe || !this.iframe.contentWindow) {
      throw new Error('The iframe is not loaded yet');
    }

    this.iframe.contentWindow.postMessage(postMsg, '*');
  }
}
