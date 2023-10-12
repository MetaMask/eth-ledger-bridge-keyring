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

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface LedgerTransportMiddleware {
  setTransport(transport: Transport): Promise<void>;
  getTransport(): Promise<Transport>;
  send(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: Buffer,
  ): Promise<Buffer>;
  initEthApp(): Promise<void>;
  dispose(): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface LedgerMobileBridge {
  setDeviceId(deviceId: string): void;
  getDeviceId(): string;
  connect(transport: Transport, deviceId: string): Promise<void>;
  getEthAppNameAndVersion(): Promise<GetEthAppNameAndVersionResponse>;
  openEthApp(): Promise<void>;
  closeApps(): Promise<void>;
}

export type GetEthAppNameAndVersionResponse = {
  appName: string;
  version: string;
};

export type LedgerMobileBridgeOptions = {
  deviceId?: string;
};

/**
 * LedgerTransportMiddleware is a middleware to communicate with the Ledger device via transport or LedgerHwAppEth
 */
export class LedgerTransportMiddleware implements LedgerTransportMiddleware {
  readonly mainAppName = 'BOLOS';

  readonly ethAppName = 'Ethereum';

  readonly transportEncoding = 'ascii';

  #app?: LedgerHwAppEth;

  #transport?: Transport;

  async dispose(): Promise<void> {
    const transport = await this.getTransport();
    await transport.close();
  }

  async setTransport(transport: Transport): Promise<void> {
    this.#transport = transport;
  }

  async getTransport(): Promise<Transport> {
    if (!this.#transport) {
      throw new Error(
        'Ledger transport is not initialized. You must call setTransport first.',
      );
    }
    return this.#transport;
  }

  async getEthApp(): Promise<LedgerHwAppEth> {
    if (!this.#app) {
      throw new Error(
        'Ledger app is not initialized. You must call setTransport first.',
      );
    }
    return this.#app;
  }

  async initEthApp(): Promise<void> {
    this.#app = new LedgerHwAppEth(await this.getTransport());
  }

  async send(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    data: Buffer = Buffer.alloc(0),
  ): Promise<Buffer> {
    const transport = await this.getTransport();
    return await transport.send(cla, ins, p1, p2, data);
  }
}

/**
 * LedgerMobileBridge is a bridge between the LedgerKeyring and the LedgerTransportMiddleware.
 */
export class LedgerMobileBridge
  implements LedgerBridge<LedgerMobileBridgeOptions>, LedgerMobileBridge
{
  #transportMiddleware?: LedgerTransportMiddleware;

  #deviceId = '';

  isDeviceConnected = false;

  constructor(
    transportMiddleware: LedgerTransportMiddleware,
    opts?: LedgerMobileBridgeOptions,
  ) {
    this.#deviceId = opts?.deviceId ?? '';
    this.#transportMiddleware = transportMiddleware;
  }

  // init will be called by the eth keyring controller when new account added
  async init(): Promise<void> {
    return Promise.resolve();
  }

  async connect(transport: Transport, deviceId: string): Promise<void> {
    if (!transport.deviceModel?.id) {
      throw new Error('device id is not defined.');
    }
    await this.#getTransportMiddleWare().setTransport(transport);
    await this.#getTransportMiddleWare().initEthApp();
    this.setDeviceId(deviceId);
    this.isDeviceConnected = true;
  }

  getDeviceId(): string {
    return this.#deviceId;
  }

  setDeviceId(deviceId: string): void {
    if (deviceId) {
      if (this.#deviceId && this.#deviceId !== deviceId) {
        throw new Error('deviceId mismatch.');
      }
      this.#deviceId = deviceId;
    }
  }

  #getTransportMiddleWare(): LedgerTransportMiddleware {
    if (this.#transportMiddleware) {
      return this.#transportMiddleware;
    }
    throw new Error('transportMiddleware is not initialized.');
  }

  async updateTransportMethod(): Promise<boolean> {
    throw new Error('Method not supported.');
  }

  async attemptMakeApp(): Promise<boolean> {
    throw new Error('Method not supported.');
  }

  // function to be called by the keyring controller when the account is removed
  async destroy(): Promise<void> {
    try {
      await this.#getTransportMiddleWare().dispose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    this.isDeviceConnected = false;
  }

  async forgetDevice(): Promise<void> {
    this.#deviceId = '';
    this.isDeviceConnected = false;
  }

  // function to be called by the keyring controller
  async deserializeData(serializeData: Record<string, unknown>): Promise<void> {
    this.#deviceId = (serializeData.deviceId as string) ?? this.#deviceId;
  }

  // function to be called by the keyring controller
  async serializeData(): Promise<Record<string, unknown>> {
    return {
      deviceId: this.#deviceId,
    };
  }

  async getOptions(): Promise<LedgerMobileBridgeOptions> {
    return {
      deviceId: this.#deviceId,
    };
  }

  async setOptions(opts: LedgerMobileBridgeOptions): Promise<void> {
    this.setDeviceId(opts.deviceId ?? '');
  }

  // function to be called by the keyring controller
  async deviceSignMessage({
    hdPath,
    message,
  }: LedgerSignMessageParams): Promise<LedgerSignMessageResponse> {
    const app = await this.#getTransportMiddleWare().getEthApp();
    return app.signPersonalMessage(hdPath, message);
  }

  // function to be called by the keyring controller
  async deviceSignTypedData({
    hdPath,
    domainSeparatorHex,
    hashStructMessageHex,
  }: LedgerSignTypedDataParams): Promise<LedgerSignTypedDataResponse> {
    const app = await this.#getTransportMiddleWare().getEthApp();
    return app.signEIP712HashedMessage(
      hdPath,
      domainSeparatorHex,
      hashStructMessageHex,
    );
  }

  // function to be called by the keyring controller
  async deviceSignTransaction({
    tx,
    hdPath,
  }: LedgerSignTransactionParams): Promise<LedgerSignTransactionResponse> {
    const resolution = await ledgerService.resolveTransaction(tx, {}, {});
    const app = await this.#getTransportMiddleWare().getEthApp();
    return app.signTransaction(hdPath, tx, resolution);
  }

  async getPublicKey({
    hdPath,
  }: GetPublicKeyParams): Promise<GetPublicKeyResponse> {
    const app = await this.#getTransportMiddleWare().getEthApp();
    return app.getAddress(hdPath, false, true);
  }

  async openEthApp(): Promise<void> {
    await this.#getTransportMiddleWare().send(
      0xe0,
      0xd8,
      0x00,
      0x00,
      Buffer.from(
        this.#getTransportMiddleWare().ethAppName,
        this.#getTransportMiddleWare().transportEncoding,
      ),
    );
  }

  async closeApps(): Promise<void> {
    await this.#getTransportMiddleWare().send(0xb0, 0xa7, 0x00, 0x00);
  }

  async getEthAppNameAndVersion(): Promise<GetEthAppNameAndVersionResponse> {
    const response = await this.#getTransportMiddleWare().send(
      0xb0,
      0x01,
      0x00,
      0x00,
    );

    let i = 0;
    const format = response[i];
    i += 1;
    if (format !== 1) {
      throw new Error('getEthAppNameAndVersion: format not supported');
    }

    const nameLength = response[i] ?? 0;
    i += 1;

    const appName = response
      .slice(i, (i += nameLength))
      .toString(this.#getTransportMiddleWare().transportEncoding);

    const versionLength = response[i] ?? 0;
    i += 1;

    const version = response
      .slice(i, (i += versionLength))
      .toString(this.#getTransportMiddleWare().transportEncoding);

    return {
      appName,
      version,
    };
  }
}
