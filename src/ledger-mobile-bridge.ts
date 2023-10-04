import LedgerHwAppEth from '@ledgerhq/hw-app-eth';
import ledgerService from '@ledgerhq/hw-app-eth/lib/services/ledger';
import type Transport from '@ledgerhq/hw-transport';
// eslint-disable-next-line import/no-nodejs-modules
import { Buffer } from 'buffer';

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

type GetEthAppNameAndVersionResponse = { appName: string; version: string };

export type ITransportMiddleware = {
  dispose(): Promise<void>;
};

export type ILedgerMobileTransportMiddleware = {
  getEthAppNameAndVersion(): Promise<GetEthAppNameAndVersionResponse>;
  openEthApp(): Promise<void>;
  closeApps(): Promise<void>;
  setTransport(transport: Transport): Promise<boolean>;
  getTransport(): Promise<Transport>;
  getEthApp(): Promise<LedgerHwAppEth>;
  initEthApp(): Promise<void>;
} & ITransportMiddleware;

export type LedgerMobileBridgeOptions = {
  deviceId: string;
};

export type ILedgerMobileBridge = {
  setDeviceId(deviceId: string): void;
  getDeviceId(): string;
} & LedgerBridge<LedgerMobileBridgeOptions>;

/**
 * LedgerMobileTransportMiddleware is a middleware to communicate with the Ledger device via transport or LedgerHwAppEth
 */
export class LedgerMobileTransportMiddleware
  implements ILedgerMobileTransportMiddleware
{
  readonly mainAppName = 'BOLOS';

  readonly ethAppName = 'Ethereum';

  readonly transportEncoding = 'ascii';

  app?: LedgerHwAppEth;

  transport?: Transport;

  async dispose(): Promise<void> {
    const transport = await this.getTransport();
    await transport.close();
  }

  async setTransport(transport: Transport): Promise<boolean> {
    this.transport = transport;
    return Promise.resolve(true);
  }

  async getTransport(): Promise<Transport> {
    if (!this.transport) {
      throw new Error(
        'Ledger transport is not initialized. You must call setTransport first.',
      );
    }
    return Promise.resolve(this.transport);
  }

  async getEthApp(): Promise<LedgerHwAppEth> {
    if (!this.app) {
      throw new Error(
        'Ledger app is not initialized. You must call setTransport first.',
      );
    }
    return Promise.resolve(this.app);
  }

  async initEthApp(): Promise<void> {
    this.app = new LedgerHwAppEth(await this.getTransport());
  }

  async openEthApp(): Promise<void> {
    const transport = await this.getTransport();
    await transport.send(
      0xe0,
      0xd8,
      0x00,
      0x00,
      Buffer.from(this.ethAppName, this.transportEncoding),
    );
  }

  async closeApps(): Promise<void> {
    const transport = await this.getTransport();
    await transport.send(0xb0, 0xa7, 0x00, 0x00);
  }

  async getEthAppNameAndVersion(): Promise<GetEthAppNameAndVersionResponse> {
    const transport = await this.getTransport();

    const response = await transport.send(0xb0, 0x01, 0x00, 0x00);

    let i = 1;
    const format = response[i];

    if (format !== 1) {
      throw new Error('getEthAppNameAndVersion: format not supported');
    }

    i += 1;
    const nameLength = response[i] ?? 0;
    const appName = response
      .slice(i, (i += nameLength))
      .toString(this.transportEncoding);

    i += 1;
    const versionLength = response[i] ?? 0;
    const version = response
      .slice(i, (i += versionLength))
      .toString(this.transportEncoding);

    return {
      appName,
      version,
    };
  }
}

/**
 * LedgerMobileBridge is a bridge between the LedgerKeyring and the LedgerMobileTransportMiddleware.
 */
export default class LedgerMobileBridge implements ILedgerMobileBridge {
  transportMiddleware: ILedgerMobileTransportMiddleware;

  deviceId = '';

  isDeviceConnected = false;

  constructor(opts?: LedgerMobileBridgeOptions) {
    if (opts) {
      this.setOptions(opts);
    }
    this.transportMiddleware = new LedgerMobileTransportMiddleware();
  }

  // init will be called by the eth keyring controller when new account added
  async init(): Promise<void> {
    return Promise.resolve();
  }

  setDeviceId(deviceId: string): void {
    if (this.deviceId && this.deviceId !== deviceId) {
      throw new Error('LedgerKeyring: deviceId mismatch.');
    }
    this.deviceId = deviceId;
    this.isDeviceConnected = true;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  async updateTransportMethod(): Promise<boolean> {
    throw new Error('Method not supported.');
  }

  async attemptMakeApp(): Promise<boolean> {
    throw new Error('Method not supported.');
  }

  async destroy(): Promise<void> {
    await this.transportMiddleware.dispose();
    this.isDeviceConnected = false;
  }

  async forgetDevice(): Promise<void> {
    this.deviceId = '';
    this.isDeviceConnected = false;
  }

  getOptions(): LedgerMobileBridgeOptions {
    return {
      deviceId: this.deviceId,
    };
  }

  setOptions(opts: LedgerMobileBridgeOptions): void {
    this.deviceId = opts.deviceId ?? '';
  }

  async deviceSignMessage({
    hdPath,
    message,
  }: LedgerSignMessageParams): Promise<LedgerSignMessageResponse> {
    const app = await this.transportMiddleware.getEthApp();
    return app.signPersonalMessage(hdPath, message);
  }

  async deviceSignTypedData({
    hdPath,
    domainSeparatorHex,
    hashStructMessageHex,
  }: LedgerSignTypedDataParams): Promise<LedgerSignTypedDataResponse> {
    const app = await this.transportMiddleware.getEthApp();
    return app.signEIP712HashedMessage(
      hdPath,
      domainSeparatorHex,
      hashStructMessageHex,
    );
  }

  async deviceSignTransaction({
    tx,
    hdPath,
  }: LedgerSignTransactionParams): Promise<LedgerSignTransactionResponse> {
    const resolution = await ledgerService.resolveTransaction(tx, {}, {});
    const app = await this.transportMiddleware.getEthApp();
    return app.signTransaction(hdPath, tx, resolution);
  }

  async getPublicKey({
    hdPath,
  }: GetPublicKeyParams): Promise<GetPublicKeyResponse> {
    const app = await this.transportMiddleware.getEthApp();
    return app.getAddress(hdPath, false, true);
  }
}
