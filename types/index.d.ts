export const KEYRING_TYPE: string;

export type GetPublicKeyPayload = { hdPath: string };
export type GetPublicKeyResponse = {
  publicKey: string;
  address: string;
  chainCode?: string | undefined;
};

export type LedgerSignatureResponse = {
  v: string;
  s: string;
  r: string;
};

export type LedgerSignTransactionPayload = { hdPath: string; rawTxHex: string };

export type LedgerSignMessagePayload = { hdPath: string; message: string };

export type LedgerSignTypedDataPayload = {
  hdPath: string;
  domainSeparatorHex: string;
  hashStructMessageHex: string;
};

export class BaseLedgerKeyring {
  static type: string;

  public constructor(opts: Record<string, unknown>);

  public init(): Promise<void>;

  public dispose(): Promise<void>;

  protected _getPublicKey(
    payload: GetPublicKeyPayload
  ): Promise<GetPublicKeyResponse>;

  protected _deviceSignTransaction(
    payload: LedgerSignTransactionPayload
  ): Promise<LedgerSignatureResponse>;

  protected _deviceSignMessage(
    payload: LedgerSignMessagePayload
  ): Promise<LedgerSignatureResponse>;

  protected _deviceSignTypedData(
    payload: LedgerSignTypedDataPayload
  ): Promise<LedgerSignatureResponse>;
}
