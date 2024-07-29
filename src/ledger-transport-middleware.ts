import type Transport from '@ledgerhq/hw-transport';

import { MetaMaskLedgerHwAppEth } from './ledger-hw-app';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TransportMiddleware {
  setTransport(transport: Transport): void;
  getTransport(): Transport;
  getEthApp(): MetaMaskLedgerHwAppEth;
  dispose(): Promise<void>;
}

/**
 * LedgerTransportMiddleware is a middleware to communicate with the Ledger device via transport or LedgerHwAppEth
 */
export class LedgerTransportMiddleware implements TransportMiddleware {
  readonly mainAppName = 'BOLOS';

  readonly ethAppName = 'Ethereum';

  readonly transportEncoding = 'ascii';

  #transport?: Transport;

  /**
   * Method to close the transport connection.
   */
  async dispose(): Promise<void> {
    const transport = this.getTransport();
    await transport.close();
  }

  /**
   * Method to set the transport object.
   *
   * @param transport - The transport object for communicating with a Ledger hardware wallet.
   */
  setTransport(transport: Transport): void {
    this.#transport = transport;
  }

  /**
   * Method to retrieve the transport object.
   *
   * @returns An generic interface for communicating with a Ledger hardware wallet.
   */
  getTransport(): Transport {
    if (!this.#transport) {
      throw new Error('Instance `transport` is not initialized.');
    }
    return this.#transport;
  }

  /**
   * Method to get a new instance of the eth app object.
   *
   * @returns An generic interface for communicating with a Ledger hardware wallet to perform operation.
   */
  getEthApp(): MetaMaskLedgerHwAppEth {
    return new MetaMaskLedgerHwAppEth(this.getTransport());
  }
}
