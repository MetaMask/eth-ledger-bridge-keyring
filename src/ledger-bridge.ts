import type LedgerHwAppEth from '@ledgerhq/hw-app-eth';
import type Transport from '@ledgerhq/hw-transport';

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

export type LedgerBridgeOptions = Record<string, unknown>;

export type LedgerBridge<T extends LedgerBridgeOptions> = {
  isDeviceConnected: boolean;

  init(): Promise<void>;

  destroy(): Promise<void>;

  /**
   * Method to get the current configuration of the ledger bridge keyring.
   */
  getOptions(): Promise<T>;

  /**
   * Method to set the current configuration of the ledger bridge keyring.
   *
   * @param opts - An object contains configuration of the bridge.
   */
  setOptions(opts: T): Promise<void>;

  attemptMakeApp(): Promise<boolean>;

  updateTransportMethod(transportType: string | Transport): Promise<boolean>;

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
};
