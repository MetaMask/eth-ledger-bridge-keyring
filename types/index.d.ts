export type GetPublicKeyPayload = { hdPath: string };
export type GetPublicKeyResponse = {
  publicKey: string;
  address: string;
  chainCode?: string;
};

export type LedgerSignTransactionPayload = { hdPath: string; rawTxHex: string };
export type LedgerSignTransactionResponse = {
  s: string;
  v: string;
  r: string;
};

export type LedgerSignMessagePayload = { hdPath: string; message: string };
export type LedgerSignMessageResponse = {
  v: number;
  s: string;
  r: string;
};

export type LedgerSignTypedDataPayload = {
  hdPath: string;
  domainSeparatorHex: string;
  hashStructMessageHex: string;
};
export type LedgerSignTypedDataResponse = {
  v: number;
  s: string;
  r: string;
};

export interface LedgerBridge {
  init(): Promise<void>;

  destroy(): Promise<void>;

  attemptMakeApp(): Promise<boolean>;

  getPublicKey(
    payload: GetPublicKeyPayload
  ): Promise<GetPublicKeyResponse>;

  deviceSignTransaction(
    payload: LedgerSignTransactionPayload
  ): Promise<LedgerSignTransactionResponse>;

  deviceSignMessage(
    payload: LedgerSignMessagePayload
  ): Promise<LedgerSignMessageResponse>;

  deviceSignTypedData(
    payload: LedgerSignTypedDataPayload
  ): Promise<LedgerSignTypedDataResponse>;
}
