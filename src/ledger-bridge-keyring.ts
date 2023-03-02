import { EventEmitter } from 'events';
import HDKey from 'hdkey';
import * as ethUtil from 'ethereumjs-util';
import * as sigUtil from 'eth-sig-util';
import { TransactionFactory, TxData, TypedTransaction } from '@ethereumjs/tx';
import type OldEthJsTransaction from 'ethereumjs-tx';

const pathBase = 'm';
const hdPathString = `${pathBase}/44'/60'/0'`;
const keyringType = 'Ledger Hardware';

const BRIDGE_URL = 'https://metamask.github.io/eth-ledger-bridge-keyring';

const MAX_INDEX = 1000;
const NETWORK_API_URLS: Record<string, string> = {
  ropsten: 'http://api-ropsten.etherscan.io',
  kovan: 'http://api-kovan.etherscan.io',
  rinkeby: 'https://api-rinkeby.etherscan.io',
  mainnet: 'https://api.etherscan.io',
};

enum IFrameMessageAction {
  LedgerConnectionChange = 'ledger-connection-change',
  LedgerUnlock = 'ledger-unlock',
  LedgerMakeApp = 'ledger-make-app',
  LedgerUpdateTransport = 'ledger-update-transport',
  LedgerSignTransaction = 'ledger-sign-transaction',
  LedgerSignPersonalMessage = 'ledger-sign-personal-message',
  LedgerSignTypedData = 'ledger-sign-typed-data',
}

interface IFrameMessage {
  action: IFrameMessageAction;
  params: Record<string, unknown>;
  target: string;
  messageId: number;
}

interface IFrameMessageGetAddressResponsePayload {
  publicKey: string;
  address: string;
  chainCode: string;
  error?: string;
}

interface IFrameMessageSignResponsePayload {
  v: string;
  r: string;
  s: string;
  error?: unknown;
}

interface IFrameMessageConnectionResponsePayload {
  connected: boolean;
  error?: unknown;
}

type IFrameMessageResponsePayload =
  | IFrameMessageGetAddressResponsePayload
  | IFrameMessageSignResponsePayload
  | IFrameMessageConnectionResponsePayload;

interface IFrameMessageResponse {
  success: boolean;
  action: IFrameMessageAction;
  messageId: number;
  payload: IFrameMessageResponsePayload;
  error?: unknown;
}

export interface AccountDetails {
  index?: number;
  bip44?: boolean;
  hdPath?: string;
}

export interface LedgerBridgeKeyringOptions {
  hdPath?: string;
  accounts?: string[];
  accountDetails?: Record<string, AccountDetails>;
  accountIndexes?: Record<string, number>;
  bridgeUrl?: string;
  implementFullBIP44?: boolean;
}

/**
 * Check if the given transaction is made with ethereumjs-tx or @ethereumjs/tx
 *
 * Transactions built with older versions of ethereumjs-tx have a
 * getChainId method that newer versions do not.
 * Older versions are mutable
 * while newer versions default to being immutable.
 * Expected shape and type
 * of data for v, r and s differ (Buffer (old) vs BN (new)).
 *
 * @param tx
 * @returns Returns `true` if tx is an old-style ethereumjs-tx transaction.
 */
function isOldStyleEthereumjsTx(
  tx: TypedTransaction | OldEthJsTransaction,
): tx is OldEthJsTransaction {
  return typeof (tx as OldEthJsTransaction).getChainId === 'function';
}

function isSignMessageResponse(
  payload: IFrameMessageResponsePayload,
): payload is IFrameMessageSignResponsePayload {
  return typeof (payload as IFrameMessageSignResponsePayload).v === 'string';
}

function isGetAddressMessageResponse(
  payload: IFrameMessageResponsePayload,
): payload is IFrameMessageGetAddressResponsePayload {
  return (
    typeof (payload as IFrameMessageGetAddressResponsePayload).publicKey ===
    'string'
  );
}

function isConnectionChangedResponse(
  payload: IFrameMessageResponsePayload,
): payload is IFrameMessageConnectionResponsePayload {
  return (
    typeof (payload as IFrameMessageConnectionResponsePayload).connected ===
    'boolean'
  );
}

export class LedgerBridgeKeyring extends EventEmitter {
  static type: string = keyringType;

  readonly type: string = keyringType;

  page = 0;

  perPage = 5;

  unlockedAccount = 0;

  accounts: readonly string[] = [];

  accountDetails: Record<string, AccountDetails> = {};

  hdk = new HDKey();

  hdPath = hdPathString;

  paths: Record<string, number> = {};

  network = 'mainnet';

  implementFullBIP44 = false;

  iframeLoaded = false;

  isDeviceConnected = false;

  currentMessageId = 0;

  _eventListener?: (params: {
    origin: string;
    data: IFrameMessageResponse;
  }) => void;

  messageCallbacks: Record<number, (response: IFrameMessageResponse) => void> =
    {};

  bridgeUrl: string = BRIDGE_URL;

  iframe?: HTMLIFrameElement;

  delayedPromise?: {
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    transportType: string;
  };

  constructor(opts = {}) {
    super();
    this.deserialize(opts);

    this._setupIframe();

    this._setupListener();
  }

  serialize() {
    return Promise.resolve({
      hdPath: this.hdPath,
      accounts: this.accounts,
      accountDetails: this.accountDetails,
      bridgeUrl: this.bridgeUrl,
      implementFullBIP44: false,
    });
  }

  deserialize(opts: LedgerBridgeKeyringOptions = {}) {
    this.hdPath = opts.hdPath || hdPathString;
    this.bridgeUrl = opts.bridgeUrl || BRIDGE_URL;
    this.accounts = opts.accounts || [];
    this.accountDetails = opts.accountDetails || {};
    if (!opts.accountDetails) {
      this._migrateAccountDetails(opts);
    }

    this.implementFullBIP44 = opts.implementFullBIP44 || false;

    // Remove accounts that don't have corresponding account details
    this.accounts = this.accounts.filter((account) =>
      Object.keys(this.accountDetails).includes(
        ethUtil.toChecksumAddress(account),
      ),
    );

    return Promise.resolve();
  }

  _migrateAccountDetails(opts: LedgerBridgeKeyringOptions) {
    if (this._isLedgerLiveHdPath() && opts.accountIndexes) {
      for (const account of Object.keys(opts.accountIndexes)) {
        this.accountDetails[account] = {
          bip44: true,
          hdPath: this._getPathForIndex(opts.accountIndexes[account] as number),
        };
      }
    }

    // try to migrate non-LedgerLive accounts too
    if (!this._isLedgerLiveHdPath()) {
      this.accounts
        .filter(
          (account) =>
            !Object.keys(this.accountDetails).includes(
              ethUtil.toChecksumAddress(account),
            ),
        )
        .forEach((account) => {
          try {
            this.accountDetails[ethUtil.toChecksumAddress(account)] = {
              bip44: false,
              hdPath: this._pathFromAddress(account),
            };
          } catch (e) {
            console.log(`failed to migrate account ${account}`);
          }
        });
    }
  }

  isUnlocked() {
    return Boolean(this.hdk?.publicKey);
  }

  isConnected() {
    return this.isDeviceConnected;
  }

  setAccountToUnlock(index: number | string) {
    this.unlockedAccount = parseInt(String(index), 10);
  }

  setHdPath(hdPath: string) {
    // Reset HDKey if the path changes
    if (this.hdPath !== hdPath) {
      this.hdk = new HDKey();
    }
    this.hdPath = hdPath;
  }

  unlock(hdPath?: string, updateHdk = true): Promise<string> {
    if (this.isUnlocked() && !hdPath) {
      return Promise.resolve('already unlocked');
    }
    const path = hdPath ? this._toLedgerPath(hdPath) : this.hdPath;
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: IFrameMessageAction.LedgerUnlock,
          params: {
            hdPath: path,
          },
        },
        ({ success, payload }) => {
          if (success && isGetAddressMessageResponse(payload)) {
            if (updateHdk) {
              this.hdk.publicKey = Buffer.from(payload.publicKey, 'hex');
              this.hdk.chainCode = Buffer.from(payload.chainCode, 'hex');
            }
            resolve(payload.address);
          } else {
            reject(payload.error || new Error('Unknown error'));
          }
        },
      );
    });
  }

  addAccounts(n = 1): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.unlock()
        .then(async (_) => {
          const from = this.unlockedAccount;
          const to = from + n;
          for (let i = from; i < to; i++) {
            const path = this._getPathForIndex(i);
            let address;
            if (this._isLedgerLiveHdPath()) {
              address = await this.unlock(path);
            } else {
              address = this._addressFromIndex(pathBase, i);
            }

            this.accountDetails[ethUtil.toChecksumAddress(address)] = {
              // TODO: consider renaming this property, as the current name is misleading
              // It's currently used to represent whether an account uses the Ledger Live path.
              bip44: this._isLedgerLiveHdPath(),
              hdPath: path,
            };

            if (!this.accounts.includes(address)) {
              this.accounts = [...this.accounts, address];
            }
            this.page = 0;
          }
          resolve(this.accounts.slice());
        })
        .catch(reject);
    });
  }

  getFirstPage() {
    this.page = 0;
    return this.__getPage(1);
  }

  getNextPage() {
    return this.__getPage(1);
  }

  getPreviousPage() {
    return this.__getPage(-1);
  }

  getAccounts() {
    return Promise.resolve(this.accounts.slice());
  }

  removeAccount(address: string) {
    if (
      !this.accounts.map((a) => a.toLowerCase()).includes(address.toLowerCase())
    ) {
      throw new Error(`Address ${address} not found in this keyring`);
    }

    this.accounts = this.accounts.filter(
      (a) => a.toLowerCase() !== address.toLowerCase(),
    );
    delete this.accountDetails[ethUtil.toChecksumAddress(address)];
  }

  attemptMakeApp() {
    return new Promise((resolve, reject) => {
      this._sendMessage(
        {
          action: IFrameMessageAction.LedgerMakeApp,
        },
        ({ success, error }) => {
          if (success) {
            resolve(true);
          } else {
            reject(error);
          }
        },
      );
    });
  }

  updateTransportMethod(transportType: string) {
    return new Promise((resolve, reject) => {
      // If the iframe isn't loaded yet, let's store the desired transportType value and
      // optimistically return a successful promise
      if (!this.iframeLoaded) {
        this.delayedPromise = {
          resolve,
          reject,
          transportType,
        };
        return;
      }

      this._sendMessage(
        {
          action: IFrameMessageAction.LedgerUpdateTransport,
          params: { transportType },
        },
        ({ success }) => {
          if (success) {
            resolve(true);
          } else {
            reject(new Error('Ledger transport could not be updated'));
          }
        },
      );
    });
  }

  // tx is an instance of the ethereumjs-transaction class.
  signTransaction(
    address: string,
    tx: TypedTransaction | OldEthJsTransaction,
  ): Promise<TypedTransaction | OldEthJsTransaction> {
    let rawTxHex;
    // transactions built with older versions of ethereumjs-tx have a
    // getChainId method that newer versions do not. Older versions are mutable
    // while newer versions default to being immutable. Expected shape and type
    // of data for v, r and s differ (Buffer (old) vs BN (new))
    if (isOldStyleEthereumjsTx(tx)) {
      // In this version of ethereumjs-tx we must add the chainId in hex format
      // to the initial v value. The chainId must be included in the serialized
      // transaction which is only communicated to ethereumjs-tx in this
      // value. In newer versions the chainId is communicated via the 'Common'
      // object.
      // TODO: Understand why we where passing strings here
      // moreover, getChainId should return a number.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore next-line
      tx.v = ethUtil.bufferToHex(tx.getChainId());
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore next-line
      tx.r = '0x00';
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore next-line
      tx.s = '0x00';

      rawTxHex = tx.serialize().toString('hex');

      return this._signTransaction(address, rawTxHex, (payload) => {
        tx.v = Buffer.from(payload.v, 'hex');
        tx.r = Buffer.from(payload.r, 'hex');
        tx.s = Buffer.from(payload.s, 'hex');
        return tx;
      });
    }

    // The below `encode` call is only necessary for legacy transactions, as `getMessageToSign`
    // calls `rlp.encode` internally for non-legacy transactions. As per the "Transaction Execution"
    // section of the ethereum yellow paper, transactions need to be "well-formed RLP, with no additional
    // trailing bytes".

    // Note also that `getMessageToSign` will return valid RLP for all transaction types, whereas the
    // `serialize` method will not for any transaction type except legacy. This is because `serialize` includes
    // empty r, s and v values in the encoded rlp. This is why we use `getMessageToSign` here instead of `serialize`.
    const messageToSign = tx.getMessageToSign(false);

    rawTxHex = Buffer.isBuffer(messageToSign)
      ? messageToSign.toString('hex')
      : ethUtil.rlp.encode(messageToSign).toString('hex');

    return this._signTransaction(address, rawTxHex, (payload) => {
      // Because tx will be immutable, first get a plain javascript object that
      // represents the transaction. Using txData here as it aligns with the
      // nomenclature of ethereumjs/tx.
      const txData: TxData = tx.toJSON();
      // The fromTxData utility expects a type to support transactions with a type other than 0
      txData.type = tx.type;
      // The fromTxData utility expects v,r and s to be hex prefixed
      txData.v = ethUtil.addHexPrefix(payload.v);
      txData.r = ethUtil.addHexPrefix(payload.r);
      txData.s = ethUtil.addHexPrefix(payload.s);
      // Adopt the 'common' option from the original transaction and set the
      // returned object to be frozen if the original is frozen.
      return TransactionFactory.fromTxData(txData, {
        common: tx.common,
        freeze: Object.isFrozen(tx),
      });
    });
  }

  _signTransaction(
    address: string,
    rawTxHex: string,
    handleSigning: (
      payload: IFrameMessageSignResponsePayload,
    ) => TypedTransaction | OldEthJsTransaction,
  ): Promise<TypedTransaction | OldEthJsTransaction> {
    return new Promise((resolve, reject) => {
      this.unlockAccountByAddress(address)
        .then((hdPath) => {
          this._sendMessage(
            {
              action: IFrameMessageAction.LedgerSignTransaction,
              params: {
                tx: rawTxHex,
                hdPath,
              },
            },
            ({ success, payload }) => {
              if (success && isSignMessageResponse(payload)) {
                const newOrMutatedTx = handleSigning(payload);
                const valid = newOrMutatedTx.verifySignature();
                if (valid) {
                  resolve(newOrMutatedTx);
                } else {
                  reject(
                    new Error('Ledger: The transaction signature is not valid'),
                  );
                }
              } else {
                reject(
                  payload.error ||
                    new Error(
                      'Ledger: Unknown error while signing transaction',
                    ),
                );
              }
            },
          );
        })
        .catch(reject);
    });
  }

  signMessage(withAccount: string, data: string) {
    return this.signPersonalMessage(withAccount, data);
  }

  // For personal_sign, we need to prefix the message:
  signPersonalMessage(withAccount: string, message: string) {
    return new Promise((resolve, reject) => {
      this.unlockAccountByAddress(withAccount)
        .then((hdPath) => {
          this._sendMessage(
            {
              action: IFrameMessageAction.LedgerSignPersonalMessage,
              params: {
                hdPath,
                message: ethUtil.stripHexPrefix(message),
              },
            },
            ({ success, payload }) => {
              if (success && isSignMessageResponse(payload)) {
                let v = parseInt(payload.v, 10).toString(16);
                if (v.length < 2) {
                  v = `0${v}`;
                }
                const signature = `0x${payload.r}${payload.s}${v}`;
                const addressSignedWith = sigUtil.recoverPersonalSignature({
                  data: message,
                  sig: signature,
                });
                if (
                  ethUtil.toChecksumAddress(addressSignedWith) !==
                  ethUtil.toChecksumAddress(withAccount)
                ) {
                  reject(
                    new Error(
                      'Ledger: The signature doesnt match the right address',
                    ),
                  );
                }
                resolve(signature);
              } else {
                reject(
                  payload.error ||
                    new Error('Ledger: Unknown error while signing message'),
                );
              }
            },
          );
        })
        .catch(reject);
    });
  }

  async unlockAccountByAddress(address: string) {
    const checksummedAddress = ethUtil.toChecksumAddress(address);
    if (!Object.keys(this.accountDetails).includes(checksummedAddress)) {
      throw new Error(
        `Ledger: Account for address '${checksummedAddress}' not found`,
      );
    }
    const { hdPath } = this.accountDetails[
      checksummedAddress
    ] as AccountDetails;
    const unlockedAddress = await this.unlock(hdPath, false);

    // unlock resolves to the address for the given hdPath as reported by the ledger device
    // if that address is not the requested address, then this account belongs to a different device or seed
    if (unlockedAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(
        `Ledger: Account ${address} does not belong to the connected device`,
      );
    }
    return hdPath;
  }

  async signTypedData(
    withAccount: string,
    data: sigUtil.EIP712TypedData,
    options: { version?: string } = {},
  ) {
    const isV4 = options.version === 'V4';
    if (!isV4) {
      throw new Error(
        'Ledger: Only version 4 of typed data signing is supported',
      );
    }

    const { domain, types, primaryType, message } =
      sigUtil.TypedDataUtils.sanitizeData(data);
    const domainSeparatorHex = sigUtil.TypedDataUtils.hashStruct(
      'EIP712Domain',
      domain,
      types,
      // @types/eth-sig-util seems to be wrong
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore next-line
      isV4,
    ).toString('hex');
    const hashStructMessageHex = sigUtil.TypedDataUtils.hashStruct(
      primaryType,
      message,
      types,
      // @types/eth-sig-util seems to be wrong
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore next-line
      isV4,
    ).toString('hex');

    const hdPath = await this.unlockAccountByAddress(withAccount);
    const { success, payload }: IFrameMessageResponse = await new Promise(
      (resolve) => {
        this._sendMessage(
          {
            action: IFrameMessageAction.LedgerSignTypedData,
            params: {
              hdPath,
              domainSeparatorHex,
              hashStructMessageHex,
            },
          },
          (result) => resolve(result),
        );
      },
    );

    if (success && isSignMessageResponse(payload)) {
      let v = parseInt(payload.v, 10).toString(16);
      if (v.length < 2) {
        v = `0${v}`;
      }
      const signature = `0x${payload.r}${payload.s}${v}`;
      // @types/eth-sig-util seems to be wrong
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore next-line
      const addressSignedWith = sigUtil.recoverTypedSignature_v4({
        data,
        sig: signature,
      });
      if (
        ethUtil.toChecksumAddress(addressSignedWith) !==
        ethUtil.toChecksumAddress(withAccount)
      ) {
        throw new Error('Ledger: The signature doesnt match the right address');
      }
      return signature;
    }
    throw (
      payload.error || new Error('Ledger: Unknown error while signing message')
    );
  }

  exportAccount() {
    throw new Error('Not supported on this device');
  }

  forgetDevice() {
    this.accounts = [];
    this.page = 0;
    this.unlockedAccount = 0;
    this.paths = {};
    this.accountDetails = {};
    this.hdk = new HDKey();
  }

  /* PRIVATE METHODS */

  _setupIframe() {
    this.iframe = document.createElement('iframe');
    this.iframe.src = this.bridgeUrl;
    this.iframe.allow = `hid 'src'`;
    this.iframe.onload = async () => {
      // If the ledger live preference was set before the iframe is loaded,
      // set it after the iframe has loaded
      this.iframeLoaded = true;
      if (this.delayedPromise) {
        try {
          const result = await this.updateTransportMethod(
            this.delayedPromise.transportType,
          );
          this.delayedPromise.resolve(result);
        } catch (e) {
          this.delayedPromise.reject(e);
        } finally {
          delete this.delayedPromise;
        }
      }
    };
    document.head.appendChild(this.iframe);
  }

  _getOrigin() {
    const tmp = this.bridgeUrl.split('/');
    tmp.splice(-1, 1);
    return tmp.join('/');
  }

  _sendMessage(
    msg: Partial<IFrameMessage>,
    cb: (response: IFrameMessageResponse) => void,
  ) {
    msg.target = 'LEDGER-IFRAME';

    this.currentMessageId += 1;
    msg.messageId = this.currentMessageId;

    this.messageCallbacks[this.currentMessageId] = cb;
    this.iframe?.contentWindow?.postMessage(msg, '*');
  }

  _setupListener() {
    this._eventListener = ({ origin, data }) => {
      if (origin !== this._getOrigin()) {
        return false;
      }

      if (data) {
        if (this.messageCallbacks[data.messageId]) {
          this.messageCallbacks[data.messageId]?.(data);
        } else if (
          data.action === IFrameMessageAction.LedgerConnectionChange &&
          isConnectionChangedResponse(data.payload)
        ) {
          this.isDeviceConnected = data.payload.connected;
        }
      }

      return undefined;
    };
    window.addEventListener('message', this._eventListener);
  }

  destroy() {
    if (this._eventListener) {
      window.removeEventListener('message', this._eventListener);
    }
  }

  async __getPage(increment: number) {
    this.page += increment;

    if (this.page <= 0) {
      this.page = 1;
    }
    const from = (this.page - 1) * this.perPage;
    const to = from + this.perPage;

    await this.unlock();
    let accounts;
    if (this._isLedgerLiveHdPath()) {
      accounts = await this._getAccountsBIP44(from, to);
    } else {
      accounts = this._getAccountsLegacy(from, to);
    }
    return accounts;
  }

  async _getAccountsBIP44(from: number, to: number) {
    const accounts: {
      address: string;
      balance: number | null;
      index: number;
    }[] = [];

    for (let i = from; i < to; i++) {
      const path = this._getPathForIndex(i);
      const address = await this.unlock(path);
      const valid = this.implementFullBIP44
        ? await this._hasPreviousTransactions(address)
        : true;
      accounts.push({
        address,
        balance: null,
        index: i,
      });

      // PER BIP44
      // "Software should prevent a creation of an account if
      // a previous account does not have a transaction history
      // (meaning none of its addresses have been used before)."
      if (!valid) {
        break;
      }
    }
    return accounts;
  }

  _getAccountsLegacy(from: number, to: number) {
    const accounts: {
      address: string;
      balance: number | null;
      index: number;
    }[] = [];

    for (let i = from; i < to; i++) {
      const address = this._addressFromIndex(pathBase, i);
      accounts.push({
        address,
        balance: null,
        index: i,
      });
      this.paths[ethUtil.toChecksumAddress(address)] = i;
    }
    return accounts;
  }

  _padLeftEven(hex: string) {
    return hex.length % 2 === 0 ? hex : `0${hex}`;
  }

  _normalize(buf: Buffer) {
    return this._padLeftEven(ethUtil.bufferToHex(buf).toLowerCase());
  }

  // eslint-disable-next-line no-shadow
  _addressFromIndex(basePath: string, i: number) {
    const dkey = this.hdk.derive(`${basePath}/${i}`);
    const address = ethUtil
      .publicToAddress(dkey.publicKey, true)
      .toString('hex');
    return ethUtil.toChecksumAddress(`0x${address}`);
  }

  _pathFromAddress(address: string) {
    const checksummedAddress = ethUtil.toChecksumAddress(address);
    let index = this.paths[checksummedAddress];
    if (typeof index === 'undefined') {
      for (let i = 0; i < MAX_INDEX; i++) {
        if (checksummedAddress === this._addressFromIndex(pathBase, i)) {
          index = i;
          break;
        }
      }
    }

    if (typeof index === 'undefined') {
      throw new Error('Unknown address');
    }
    return this._getPathForIndex(index);
  }

  _toAscii(hex: string) {
    let str = '';
    let i = 0;
    const l = hex.length;
    if (hex.substring(0, 2) === '0x') {
      i = 2;
    }

    for (; i < l; i += 2) {
      const code = parseInt(hex.substr(i, 2), 16);
      str += String.fromCharCode(code);
    }

    return str;
  }

  _getPathForIndex(index: number) {
    // Check if the path is BIP 44 (Ledger Live)
    return this._isLedgerLiveHdPath()
      ? `m/44'/60'/${index}'/0/0`
      : `${this.hdPath}/${index}`;
  }

  _isLedgerLiveHdPath() {
    return this.hdPath === `m/44'/60'/0'/0/0`;
  }

  _toLedgerPath(path: string) {
    return path.toString().replace('m/', '');
  }

  async _hasPreviousTransactions(address: string) {
    const apiUrl = this._getApiUrl();
    const response = await window.fetch(
      `${apiUrl}/api?module=account&action=txlist&address=${address}&tag=latest&page=1&offset=1`,
    );
    const parsedResponse = await response.json();
    if (parsedResponse.status !== '0' && parsedResponse.result.length > 0) {
      return true;
    }
    return false;
  }

  _getApiUrl() {
    return NETWORK_API_URLS[this.network] || NETWORK_API_URLS.mainnet;
  }
}
