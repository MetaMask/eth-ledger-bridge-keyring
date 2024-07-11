import ledgerService from '@ledgerhq/hw-app-eth/lib/services/ledger';
import type Transport from '@ledgerhq/hw-transport';

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
import { MetaMaskLedgerHwAppEth } from './ledger-hw-app';
import { TransportMiddleware } from './ledger-transport-middleware';
import {
  GetAppNameAndVersionResponse,
  LedgerMobileBridgeOptions,
} from './type';

// MobileBridge Type will always use LedgerBridge with LedgerMobileBridgeOptions
export type MobileBridge = LedgerBridge<LedgerMobileBridgeOptions> & {
  getAppNameAndVersion(): Promise<GetAppNameAndVersionResponse>;
  openEthApp(): Promise<void>;
  closeApps(): Promise<void>;
};

/**
 * LedgerMobileBridge is a bridge between the LedgerKeyring and the LedgerTransportMiddleware.
 */
export class LedgerMobileBridge implements MobileBridge {
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
   * It will dispose the transportmiddleware and set isDeviceConnected to false.
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
   * @param params - An object contains hdPath and message.
   * @param params.hdPath - The BIP 32 path of the account.
   * @param params.message - The message to sign.
   * @returns Retrieve v, r, s from the signed message.
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
   * @returns Retrieve v, r, s from the signed message.
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
   * @returns Retrieve v, r, s from the signed transaction.
   */
  async deviceSignTransaction({
    tx,
    hdPath,
  }: LedgerSignTransactionParams): Promise<LedgerSignTransactionResponse> {
    const resolution = await ledgerService.resolveTransaction(tx, {}, {});
    return this.#getEthApp().signTransaction(hdPath, tx, resolution);
  }

  /**
   * Method to retrieve the ethereum address for a given BIP 32 path.
   *
   * @param params - An object contains hdPath.
   * @param params.hdPath - The BIP 32 path of the account.
   * @returns An object contains publicKey, address and chainCode.
   */
  async getPublicKey({
    hdPath,
  }: GetPublicKeyParams): Promise<GetPublicKeyResponse> {
    return await this.#getEthApp().getAddress(hdPath, false, true);
  }

  /**
   * Method to retrieve the current configuration.
   *
   * @returns Retrieve current configuration.
   */
  async getOptions(): Promise<LedgerMobileBridgeOptions> {
    return this.#opts;
  }

  /**
   * Method to set the current configuration.
   *
   * @param opts - An configuration object.
   */
  async setOptions(opts: LedgerMobileBridgeOptions): Promise<void> {
    this.#opts = opts;
  }

  /**
   * Method to set the transport object to communicate with the device.
   *
   * @param transport - The communication interface with the Ledger hardware wallet. There are different kind of transports based on the technology (channels like U2F, HID, Bluetooth, Webusb).
   * @returns Retrieve boolean.
   */
  async updateTransportMethod(transport: Transport): Promise<boolean> {
    if (!transport.deviceModel) {
      throw new Error('Property `deviceModel` is not defined in `transport`.');
    }
    if (!transport.deviceModel.id) {
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
   * Method to open ethereum application on ledger device.
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
   * Method to retrieve the name and version of the running application in ledger device.
   *
   * @returns An object contains appName and version.
   */
  async getAppNameAndVersion(): Promise<GetAppNameAndVersionResponse> {
    return this.#getEthApp().getAppNameAndVersion();
  }

  /**
   * Method to retrieve the transport middleWare object.
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
   * Method to retrieve the ledger Eth App object.
   *
   * @returns The ledger Eth App object.
   */
  #getEthApp(): MetaMaskLedgerHwAppEth {
    return this.#getTransportMiddleWare().getEthApp();
  }
}
