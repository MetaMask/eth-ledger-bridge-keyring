export type GetPublicKeyPayload = { hdPath: string };
export type GetPublicKeyResponse = {
  publicKey: string;
  address: string;
  chainCode?: string | undefined;
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

export class BaseLedgerKeyring {
  public constructor(opts: Record<string, unknown>);

  public init(): Promise<void>;

  public dispose(): Promise<void>;

  protected _getPublicKey(
    payload: GetPublicKeyPayload
  ): Promise<GetPublicKeyResponse>;

  protected _deviceSignTransaction(
    payload: LedgerSignTransactionPayload
  ): Promise<LedgerSignTransactionResponse>;

  protected _deviceSignMessage(
    payload: LedgerSignMessagePayload
  ): Promise<LedgerSignMessageResponse>;

  protected _deviceSignTypedData(
    payload: LedgerSignTypedDataPayload
  ): Promise<LedgerSignTypedDataResponse>;
}
