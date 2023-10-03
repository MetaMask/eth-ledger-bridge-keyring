import type LedgerHwAppEth from '@ledgerhq/hw-app-eth';

export type GetPublicKeyParams = { hdPath: string };
export type GetPublicKeyResponse = Awaited<
  ReturnType<LedgerHwAppEth['getAddress']>
> & {
  chainCode: string;
};

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
