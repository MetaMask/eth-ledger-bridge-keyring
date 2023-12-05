import ledgerService from '@ledgerhq/hw-app-eth/lib/services/ledger';
import type Transport from '@ledgerhq/hw-transport';

// eslint-disable-next-line import/no-nodejs-modules
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
import {
  GetAppNameAndVersionResponse,
  LedgerMobileBridgeOptions,
  TransportMiddleware,
  type MetaMaskLedgerHwAppEth,
} from './ledger-mobile-bridge/';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface LedgerMobileBridge {
  getAppNameAndVersion(): Promise<GetAppNameAndVersionResponse>;
  openEthApp(): Promise<void>;
  closeApps(): Promise<void>;
}

/**
 * LedgerMobileBridge is a bridge between the LedgerKeyring and the LedgerTransportMiddleware.
 */
export class LedgerMobileBridge
  implements LedgerBridge<LedgerMobileBridgeOptions>, LedgerMobileBridge
{
  #transportMiddleware?: TransportMiddleware;

  #opts: LedgerMobileBridgeOptions;

  isDeviceConnected = false;

  constructor(
    transportMiddleware: TransportMiddleware,
    opts: LedgerMobileBridgeOptions = {},
  ) {
    this.#opts = opts;
    this.#transportMiddleware = transportMiddleware;
  }

  /**
   * Method to initializes the keyring.
   * Mobile ledger doesnt not require init.
   */
  async init(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Method to destroy the keyring.
   * Set isDeviceConnected to false. and dispose the transport.
   */
  async destroy(): Promise<void> {
    try {
      await this.#getTransportMiddleWare().dispose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    this.isDeviceConnected = false;
  }

  /**
   * Method to sign a string Message.
   * Sending the string message to the device and returning the signed message.
   *
   * @param params - The descriptor to open the transport with.
   * @param params.hdPath - The descriptor to open the transport with.
   * @param params.message - An optional timeout for the transport connection.
   * @returns A promise that resolves with a Transport instance.
   */
  async deviceSignMessage({
    hdPath,
    message,
  }: LedgerSignMessageParams): Promise<LedgerSignMessageResponse> {
    return this.#getEthApp().signPersonalMessage(hdPath, message);
  }

  /**
   * Method to sign a EIP712 Message.
   * Sending the typed data message to the device and returning the signed message.
   *
   * @param params - An object contains hdPath, domainSeparatorHex and hashStructMessageHex.
   * @param params.hdPath - The BIP 32 path of the account.
   * @param params.domainSeparatorHex - The domain separator.
   * @param params.hashStructMessageHex - The hashed struct message.
   */
  async deviceSignTypedData({
    hdPath,
    domainSeparatorHex,
    hashStructMessageHex,
  }: LedgerSignTypedDataParams): Promise<LedgerSignTypedDataResponse> {
    return this.#getEthApp().signEIP712HashedMessage(
      hdPath,
      domainSeparatorHex,
      hashStructMessageHex,
    );
  }

  /**
   * Method to sign a transaction
   * Sending the hexadecimal transaction message to the device and returning the signed transaction.
   *
   * @param params - An object contains tx, hdPath.
   * @param params.tx - The raw ethereum transaction in hexadecimal to sign.
   * @param params.hdPath - The BIP 32 path of the account.
   */
  async deviceSignTransaction({
    tx,
    hdPath,
  }: LedgerSignTransactionParams): Promise<LedgerSignTransactionResponse> {
    const resolution = await ledgerService.resolveTransaction(tx, {}, {});
    return this.#getEthApp().signTransaction(hdPath, tx, resolution);
  }

  /**
   * Method to get Ethereum address for a given BIP 32 path.
   *
   * @param params - An object contains hdPath.
   * @param params.hdPath - The BIP 32 path of the account.
   */
  async getPublicKey({
    hdPath,
  }: GetPublicKeyParams): Promise<GetPublicKeyResponse> {
    return await this.#getEthApp().getAddress(hdPath, false, true);
  }

  /**
   * Method to get the current configuration of the ledger bridge keyring.
   */
  async getOptions(): Promise<LedgerMobileBridgeOptions> {
    return this.#opts;
  }

  /**
   * Method to set the current configuration of the ledger bridge keyring.
   *
   * @param opts - An configuration object.
   */
  async setOptions(opts: LedgerMobileBridgeOptions): Promise<void> {
    this.#opts = opts;
  }

  /**
   * Method set the transport object to communicate with the device.
   * The transport object will be passed to underlying middleware.
   *
   * @param transport - The communication interface with the Ledger hardware wallet. There are different kind of transports based on the technology (channels like U2F, HID, Bluetooth, Webusb).
   */
  async updateTransportMethod(transport: Transport): Promise<boolean> {
    if (!transport.deviceModel?.id) {
      throw new Error(
        'Property `deviceModel.id` is not defined in `transport`.',
      );
    }
    this.#getTransportMiddleWare().setTransport(transport);
    this.isDeviceConnected = true;
    return Promise.resolve(true);
  }

  /**
   * Method to init eth app object on ledger device.
   * This method is not supported on mobile.
   */
  async attemptMakeApp(): Promise<boolean> {
    throw new Error('Method not supported.');
  }

  /**
   * Method to open Ethereum application on ledger device.
   *
   */
  async openEthApp(): Promise<void> {
    await this.#getEthApp().openEthApp();
  }

  /**
   * Method to close all running application on ledger device.
   *
   */
  async closeApps(): Promise<void> {
    await this.#getEthApp().closeApps();
  }

  /**
   * Method to get running application name and version on ledger device.
   */
  async getAppNameAndVersion(): Promise<GetAppNameAndVersionResponse> {
    return this.#getEthApp().getAppNameAndVersion();
  }

  /**
   * Method to get Transport MiddleWare object.
   *
   * @returns The TransportMiddleware object.
   */
  #getTransportMiddleWare(): TransportMiddleware {
    if (this.#transportMiddleware) {
      return this.#transportMiddleware;
    }
    throw new Error('Instance `transportMiddleware` is not initialized.');
  }

  /**
   * Method to get ledger Eth App.
   *
   * @returns The ledger Eth App object.
   */
  #getEthApp(): MetaMaskLedgerHwAppEth {
    return this.#getTransportMiddleWare().getEthApp();
  }
}
