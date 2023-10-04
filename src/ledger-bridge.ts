import type LedgerHwAppEth from '@ledgerhq/hw-app-eth';

export type GetPublicKeyParams = { hdPath: string };
export type GetPublicKeyResponse = Awaited<
  ReturnType<LedgerHwAppEth['getAddress']>
>;

export type LedgerSignTransactionParams = { hdPath: string; tx: string };
export type LedgerSignTransactionResponse = Awaited<
  ReturnType<LedgerHwAppEth['signTransaction']>
>;

export type LedgerSignMessageParams = { hdPath: string; message: string };
export type LedgerSignMessageResponse = Awaited<
  ReturnType<LedgerHwAppEth['signPersonalMessage']>
>;

export type LedgerSignTypedDataParams = {
  hdPath: string;
  domainSeparatorHex: string;
  hashStructMessageHex: string;
};
export type LedgerSignTypedDataResponse = Awaited<
  ReturnType<LedgerHwAppEth['signEIP712HashedMessage']>
>;

export type ITransportMiddleware = {
  dispose(): Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface LedgerBridge {
  isDeviceConnected: boolean;
  transportMiddleware: ITransportMiddleware | unknown;

  init(): Promise<void>;

  destroy(): Promise<void>;

  getMetadata(): Promise<Record<string, string>>;

  setMetadata(metadata?: Record<string, string>): Promise<void>;

  attemptMakeApp(): Promise<boolean>;

  getTransportMiddleware(): Promise<unknown>;

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
