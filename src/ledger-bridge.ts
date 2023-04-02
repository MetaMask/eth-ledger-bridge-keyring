export type GetPublicKeyParams = { hdPath: string };
export type GetPublicKeyResponse = {
  publicKey: string;
  address: string;
  chainCode?: string;
};

export type LedgerSignTransactionParams = { hdPath: string; tx: string };
export type LedgerSignTransactionResponse = {
  s: string;
  v: string;
  r: string;
};

export type LedgerSignMessageParams = { hdPath: string; message: string };
export type LedgerSignMessageResponse = {
  v: number;
  s: string;
  r: string;
};

export type LedgerSignTypedDataParams = {
  hdPath: string;
  domainSeparatorHex: string;
  hashStructMessageHex: string;
};
export type LedgerSignTypedDataResponse = {
  v: number;
  s: string;
  r: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface LedgerBridge {
  isDeviceConnected: boolean;

  init(bridgeUrl: string): Promise<void>;

  destroy(): Promise<void>;

  attemptMakeApp(): Promise<boolean>;

  updateTransportMethod(transportType: string): Promise<boolean>;

  getPublicKey(params: GetPublicKeyParams): Promise<GetPublicKeyResponse>;

  deviceSignTransaction(
    params: LedgerSignTransactionParams,
  ): Promise<LedgerSignTransactionResponse>;

  deviceSignMessage(
    params: LedgerSignMessageParams,
  ): Promise<LedgerSignMessageResponse>;

  deviceSignTypedData(
    params: LedgerSignTypedDataParams,
  ): Promise<LedgerSignTypedDataResponse>;
}
