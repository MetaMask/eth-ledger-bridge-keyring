(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _hwTransportU2f = require('@ledgerhq/hw-transport-u2f');

var _hwTransportU2f2 = _interopRequireDefault(_hwTransportU2f);

var _hwAppEth = require('@ledgerhq/hw-app-eth');

var _hwAppEth2 = _interopRequireDefault(_hwAppEth);

var _erc = require('@ledgerhq/hw-app-eth/erc20');

var _WebSocketTransport = require('@ledgerhq/hw-transport-http/lib/WebSocketTransport');

var _WebSocketTransport2 = _interopRequireDefault(_WebSocketTransport);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require('buffer');

// URL which triggers Ledger Live app to open and handle communication
var BRIDGE_URL = 'ws://localhost:8435';

// Number of seconds to poll for Ledger Live and Ethereum app opening
var TRANSPORT_CHECK_LIMIT = 180;
var TRANSPORT_CHECK_DELAY = 1000;

var LedgerBridge = function () {
    function LedgerBridge() {
        _classCallCheck(this, LedgerBridge);

        this.addEventListeners();
        this.useLedgerLive = false;
    }

    _createClass(LedgerBridge, [{
        key: 'addEventListeners',
        value: function addEventListeners() {
            var _this = this;

            window.addEventListener('message', async function (e) {
                if (e && e.data && e.data.target === 'LEDGER-IFRAME') {
                    var _e$data = e.data,
                        action = _e$data.action,
                        params = _e$data.params;

                    var replyAction = action + '-reply';

                    switch (action) {
                        case 'ledger-unlock':
                            _this.unlock(replyAction, params.hdPath);
                            break;
                        case 'ledger-sign-transaction':
                            _this.signTransaction(replyAction, params.hdPath, params.tx, params.to);
                            break;
                        case 'ledger-sign-personal-message':
                            _this.signPersonalMessage(replyAction, params.hdPath, params.message);
                            break;
                        case 'ledger-close-bridge':
                            _this.cleanUp(replyAction);
                            break;
                        case 'ledger-update-transport':
                            _this.updateLedgerLivePreference(replyAction, params.useLedgerLive);
                            break;
                        case 'ledger-sign-typed-data':
                            _this.signTypedData(replyAction, params.hdPath, params.domainSeparatorHex, params.hashStructMessageHex);
                            break;
                    }
                }
            }, false);
        }
    }, {
        key: 'sendMessageToExtension',
        value: function sendMessageToExtension(msg) {
            window.parent.postMessage(msg, '*');
        }
    }, {
        key: 'checkTransportLoop',
        value: function checkTransportLoop(i) {
            var _this2 = this;

            var iterator = i || 0;
            return _WebSocketTransport2.default.check(BRIDGE_URL, TRANSPORT_CHECK_DELAY).catch(async function () {
                if (iterator < TRANSPORT_CHECK_LIMIT) {
                    return _this2.checkTransportLoop(iterator + 1);
                } else {
                    throw new Error('Ledger transport check timeout');
                }
            });
        }
    }, {
        key: 'makeApp',
        value: async function makeApp() {
            try {
                if (this.useLedgerLive) {
                    var reestablish = false;
                    try {
                        await _WebSocketTransport2.default.check(BRIDGE_URL, TRANSPORT_CHECK_DELAY);
                    } catch (_err) {
                        window.open('ledgerlive://bridge?appName=Ethereum');
                        await this.checkTransportLoop();
                        reestablish = true;
                    }
                    if (!this.app || reestablish) {
                        this.transport = await _WebSocketTransport2.default.open(BRIDGE_URL);
                        this.app = new _hwAppEth2.default(this.transport);
                    }
                } else {
                    this.transport = await _hwTransportU2f2.default.create();
                    this.app = new _hwAppEth2.default(this.transport);
                }
            } catch (e) {
                console.log('LEDGER:::CREATE APP ERROR', e);
                throw e;
            }
        }
    }, {
        key: 'updateLedgerLivePreference',
        value: function updateLedgerLivePreference(replyAction, useLedgerLive) {
            this.useLedgerLive = useLedgerLive;
            this.cleanUp();
            this.sendMessageToExtension({
                action: replyAction,
                success: true
            });
        }
    }, {
        key: 'cleanUp',
        value: function cleanUp(replyAction) {
            this.app = null;
            if (this.transport) {
                this.transport.close();
            }
            if (replyAction) {
                this.sendMessageToExtension({
                    action: replyAction,
                    success: true
                });
            }
        }
    }, {
        key: 'unlock',
        value: async function unlock(replyAction, hdPath) {
            try {
                await this.makeApp();
                var res = await this.app.getAddress(hdPath, false, true);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: true,
                    payload: res
                });
            } catch (err) {
                var e = this.ledgerErrToMessage(err);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: false,
                    payload: { error: e.toString() }
                });
            } finally {
                if (!this.useLedgerLive) {
                    this.cleanUp();
                }
            }
        }
    }, {
        key: 'signTransaction',
        value: async function signTransaction(replyAction, hdPath, tx, to) {
            try {
                await this.makeApp();
                if (to) {
                    var isKnownERC20Token = (0, _erc.byContractAddress)(to);
                    if (isKnownERC20Token) await this.app.provideERC20TokenInformation(isKnownERC20Token);
                }
                var res = await this.app.signTransaction(hdPath, tx);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: true,
                    payload: res
                });
            } catch (err) {
                var e = this.ledgerErrToMessage(err);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: false,
                    payload: { error: e.toString() }
                });
            } finally {
                if (!this.useLedgerLive) {
                    this.cleanUp();
                }
            }
        }
    }, {
        key: 'signPersonalMessage',
        value: async function signPersonalMessage(replyAction, hdPath, message) {
            try {
                await this.makeApp();

                var res = await this.app.signPersonalMessage(hdPath, message);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: true,
                    payload: res
                });
            } catch (err) {
                var e = this.ledgerErrToMessage(err);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: false,
                    payload: { error: e.toString() }
                });
            } finally {
                if (!this.useLedgerLive) {
                    this.cleanUp();
                }
            }
        }
    }, {
        key: 'signTypedData',
        value: async function signTypedData(replyAction, hdPath, domainSeparatorHex, hashStructMessageHex) {
            try {
                await this.makeApp();
                var res = await this.app.signEIP712HashedMessage(hdPath, domainSeparatorHex, hashStructMessageHex);

                this.sendMessageToExtension({
                    action: replyAction,
                    success: true,
                    payload: res
                });
            } catch (err) {
                var e = this.ledgerErrToMessage(err);
                this.sendMessageToExtension({
                    action: replyAction,
                    success: false,
                    payload: { error: e.toString() }
                });
            } finally {
                this.cleanUp();
            }
        }
    }, {
        key: 'ledgerErrToMessage',
        value: function ledgerErrToMessage(err) {
            var isU2FError = function isU2FError(err) {
                return !!err && !!err.metaData;
            };
            var isStringError = function isStringError(err) {
                return typeof err === 'string';
            };
            var isErrorWithId = function isErrorWithId(err) {
                return err.hasOwnProperty('id') && err.hasOwnProperty('message');
            };
            var isWrongAppError = function isWrongAppError(err) {
                return String(err.message || err).includes('6804');
            };
            var isLedgerLockedError = function isLedgerLockedError(err) {
                return err.message && err.message.includes('OpenFailed');
            };

            // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
            if (isU2FError(err)) {
                if (err.metaData.code === 5) {
                    return 'LEDGER_TIMEOUT';
                }
                return err.metaData.type;
            }

            if (isWrongAppError(err)) {
                return 'LEDGER_WRONG_APP';
            }

            if (isLedgerLockedError(err) || isStringError(err) && err.includes('6801')) {
                return 'LEDGER_LOCKED';
            }

            if (isErrorWithId(err)) {
                // Browser doesn't support U2F
                if (err.message.includes('U2F not supported')) {
                    return 'U2F_NOT_SUPPORTED';
                }
            }

            // Other
            return err.toString();
        }
    }]);

    return LedgerBridge;
}();

exports.default = LedgerBridge;

},{"@ledgerhq/hw-app-eth":6,"@ledgerhq/hw-app-eth/erc20":5,"@ledgerhq/hw-transport-http/lib/WebSocketTransport":9,"@ledgerhq/hw-transport-u2f":13,"buffer":20}],2:[function(require,module,exports){
'use strict';

var _ledgerBridge = require('./ledger-bridge');

var _ledgerBridge2 = _interopRequireDefault(_ledgerBridge);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(async function () {
    var bridge = new _ledgerBridge2.default();
})();
console.log('MetaMask < = > Ledger Bridge initialized from ' + window.location + '!');

},{"./ledger-bridge":1}],3:[function(require,module,exports){
module.exports = "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";
},{}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/* eslint-disable no-continue */
/* eslint-disable no-unused-vars */
/* eslint-disable no-param-reassign */
/* eslint-disable no-prototype-builtins */
var errorClasses = {};
var deserializers = {};
var addCustomErrorDeserializer = function (name, deserializer) {
    deserializers[name] = deserializer;
};
var createCustomErrorClass = function (name) {
    var C = function CustomError(message, fields) {
        Object.assign(this, fields);
        this.name = name;
        this.message = message || name;
        this.stack = new Error().stack;
    };
    C.prototype = new Error();
    errorClasses[name] = C;
    return C;
};
// inspired from https://github.com/programble/errio/blob/master/index.js
var deserializeError = function (object) {
    if (typeof object === "object" && object) {
        try {
            // $FlowFixMe FIXME HACK
            var msg = JSON.parse(object.message);
            if (msg.message && msg.name) {
                object = msg;
            }
        }
        catch (e) {
            // nothing
        }
        var error = void 0;
        if (typeof object.name === "string") {
            var name_1 = object.name;
            var des = deserializers[name_1];
            if (des) {
                error = des(object);
            }
            else {
                var constructor = name_1 === "Error" ? Error : errorClasses[name_1];
                if (!constructor) {
                    console.warn("deserializing an unknown class '" + name_1 + "'");
                    constructor = createCustomErrorClass(name_1);
                }
                error = Object.create(constructor.prototype);
                try {
                    for (var prop in object) {
                        if (object.hasOwnProperty(prop)) {
                            error[prop] = object[prop];
                        }
                    }
                }
                catch (e) {
                    // sometimes setting a property can fail (e.g. .name)
                }
            }
        }
        else {
            error = new Error(object.message);
        }
        if (!error.stack && Error.captureStackTrace) {
            Error.captureStackTrace(error, deserializeError);
        }
        return error;
    }
    return new Error(String(object));
};
// inspired from https://github.com/sindresorhus/serialize-error/blob/master/index.js
var serializeError = function (value) {
    if (!value)
        return value;
    if (typeof value === "object") {
        return destroyCircular(value, []);
    }
    if (typeof value === "function") {
        return "[Function: " + (value.name || "anonymous") + "]";
    }
    return value;
};
// https://www.npmjs.com/package/destroy-circular
function destroyCircular(from, seen) {
    var to = {};
    seen.push(from);
    for (var _i = 0, _a = Object.keys(from); _i < _a.length; _i++) {
        var key = _a[_i];
        var value = from[key];
        if (typeof value === "function") {
            continue;
        }
        if (!value || typeof value !== "object") {
            to[key] = value;
            continue;
        }
        if (seen.indexOf(from[key]) === -1) {
            to[key] = destroyCircular(from[key], seen.slice(0));
            continue;
        }
        to[key] = "[Circular]";
    }
    if (typeof from.name === "string") {
        to.name = from.name;
    }
    if (typeof from.message === "string") {
        to.message = from.message;
    }
    if (typeof from.stack === "string") {
        to.stack = from.stack;
    }
    return to;
}

var AccountNameRequiredError = createCustomErrorClass("AccountNameRequired");
var AccountNotSupported = createCustomErrorClass("AccountNotSupported");
var AmountRequired = createCustomErrorClass("AmountRequired");
var BluetoothRequired = createCustomErrorClass("BluetoothRequired");
var BtcUnmatchedApp = createCustomErrorClass("BtcUnmatchedApp");
var CantOpenDevice = createCustomErrorClass("CantOpenDevice");
var CashAddrNotSupported = createCustomErrorClass("CashAddrNotSupported");
var CurrencyNotSupported = createCustomErrorClass("CurrencyNotSupported");
var DeviceAppVerifyNotSupported = createCustomErrorClass("DeviceAppVerifyNotSupported");
var DeviceGenuineSocketEarlyClose = createCustomErrorClass("DeviceGenuineSocketEarlyClose");
var DeviceNotGenuineError = createCustomErrorClass("DeviceNotGenuine");
var DeviceOnDashboardExpected = createCustomErrorClass("DeviceOnDashboardExpected");
var DeviceOnDashboardUnexpected = createCustomErrorClass("DeviceOnDashboardUnexpected");
var DeviceInOSUExpected = createCustomErrorClass("DeviceInOSUExpected");
var DeviceHalted = createCustomErrorClass("DeviceHalted");
var DeviceNameInvalid = createCustomErrorClass("DeviceNameInvalid");
var DeviceSocketFail = createCustomErrorClass("DeviceSocketFail");
var DeviceSocketNoBulkStatus = createCustomErrorClass("DeviceSocketNoBulkStatus");
var DisconnectedDevice = createCustomErrorClass("DisconnectedDevice");
var DisconnectedDeviceDuringOperation = createCustomErrorClass("DisconnectedDeviceDuringOperation");
var EnpointConfigError = createCustomErrorClass("EnpointConfig");
var EthAppPleaseEnableContractData = createCustomErrorClass("EthAppPleaseEnableContractData");
var FeeEstimationFailed = createCustomErrorClass("FeeEstimationFailed");
var FirmwareNotRecognized = createCustomErrorClass("FirmwareNotRecognized");
var HardResetFail = createCustomErrorClass("HardResetFail");
var InvalidXRPTag = createCustomErrorClass("InvalidXRPTag");
var InvalidAddress = createCustomErrorClass("InvalidAddress");
var InvalidAddressBecauseDestinationIsAlsoSource = createCustomErrorClass("InvalidAddressBecauseDestinationIsAlsoSource");
var LatestMCUInstalledError = createCustomErrorClass("LatestMCUInstalledError");
var UnknownMCU = createCustomErrorClass("UnknownMCU");
var LedgerAPIError = createCustomErrorClass("LedgerAPIError");
var LedgerAPIErrorWithMessage = createCustomErrorClass("LedgerAPIErrorWithMessage");
var LedgerAPINotAvailable = createCustomErrorClass("LedgerAPINotAvailable");
var ManagerAppAlreadyInstalledError = createCustomErrorClass("ManagerAppAlreadyInstalled");
var ManagerAppRelyOnBTCError = createCustomErrorClass("ManagerAppRelyOnBTC");
var ManagerAppDepInstallRequired = createCustomErrorClass("ManagerAppDepInstallRequired");
var ManagerAppDepUninstallRequired = createCustomErrorClass("ManagerAppDepUninstallRequired");
var ManagerDeviceLockedError = createCustomErrorClass("ManagerDeviceLocked");
var ManagerFirmwareNotEnoughSpaceError = createCustomErrorClass("ManagerFirmwareNotEnoughSpace");
var ManagerNotEnoughSpaceError = createCustomErrorClass("ManagerNotEnoughSpace");
var ManagerUninstallBTCDep = createCustomErrorClass("ManagerUninstallBTCDep");
var NetworkDown = createCustomErrorClass("NetworkDown");
var NoAddressesFound = createCustomErrorClass("NoAddressesFound");
var NotEnoughBalance = createCustomErrorClass("NotEnoughBalance");
var NotEnoughBalanceToDelegate = createCustomErrorClass("NotEnoughBalanceToDelegate");
var NotEnoughBalanceInParentAccount = createCustomErrorClass("NotEnoughBalanceInParentAccount");
var NotEnoughSpendableBalance = createCustomErrorClass("NotEnoughSpendableBalance");
var NotEnoughBalanceBecauseDestinationNotCreated = createCustomErrorClass("NotEnoughBalanceBecauseDestinationNotCreated");
var NoAccessToCamera = createCustomErrorClass("NoAccessToCamera");
var NotEnoughGas = createCustomErrorClass("NotEnoughGas");
var NotSupportedLegacyAddress = createCustomErrorClass("NotSupportedLegacyAddress");
var GasLessThanEstimate = createCustomErrorClass("GasLessThanEstimate");
var PasswordsDontMatchError = createCustomErrorClass("PasswordsDontMatch");
var PasswordIncorrectError = createCustomErrorClass("PasswordIncorrect");
var RecommendSubAccountsToEmpty = createCustomErrorClass("RecommendSubAccountsToEmpty");
var RecommendUndelegation = createCustomErrorClass("RecommendUndelegation");
var TimeoutTagged = createCustomErrorClass("TimeoutTagged");
var UnexpectedBootloader = createCustomErrorClass("UnexpectedBootloader");
var MCUNotGenuineToDashboard = createCustomErrorClass("MCUNotGenuineToDashboard");
var RecipientRequired = createCustomErrorClass("RecipientRequired");
var UnavailableTezosOriginatedAccountReceive = createCustomErrorClass("UnavailableTezosOriginatedAccountReceive");
var UnavailableTezosOriginatedAccountSend = createCustomErrorClass("UnavailableTezosOriginatedAccountSend");
var UpdateFetchFileFail = createCustomErrorClass("UpdateFetchFileFail");
var UpdateIncorrectHash = createCustomErrorClass("UpdateIncorrectHash");
var UpdateIncorrectSig = createCustomErrorClass("UpdateIncorrectSig");
var UpdateYourApp = createCustomErrorClass("UpdateYourApp");
var UserRefusedDeviceNameChange = createCustomErrorClass("UserRefusedDeviceNameChange");
var UserRefusedAddress = createCustomErrorClass("UserRefusedAddress");
var UserRefusedFirmwareUpdate = createCustomErrorClass("UserRefusedFirmwareUpdate");
var UserRefusedAllowManager = createCustomErrorClass("UserRefusedAllowManager");
var UserRefusedOnDevice = createCustomErrorClass("UserRefusedOnDevice"); // TODO rename because it's just for transaction refusal
var TransportOpenUserCancelled = createCustomErrorClass("TransportOpenUserCancelled");
var TransportInterfaceNotAvailable = createCustomErrorClass("TransportInterfaceNotAvailable");
var TransportRaceCondition = createCustomErrorClass("TransportRaceCondition");
var TransportWebUSBGestureRequired = createCustomErrorClass("TransportWebUSBGestureRequired");
var DeviceShouldStayInApp = createCustomErrorClass("DeviceShouldStayInApp");
var WebsocketConnectionError = createCustomErrorClass("WebsocketConnectionError");
var WebsocketConnectionFailed = createCustomErrorClass("WebsocketConnectionFailed");
var WrongDeviceForAccount = createCustomErrorClass("WrongDeviceForAccount");
var WrongAppForCurrency = createCustomErrorClass("WrongAppForCurrency");
var ETHAddressNonEIP = createCustomErrorClass("ETHAddressNonEIP");
var CantScanQRCode = createCustomErrorClass("CantScanQRCode");
var FeeNotLoaded = createCustomErrorClass("FeeNotLoaded");
var FeeRequired = createCustomErrorClass("FeeRequired");
var FeeTooHigh = createCustomErrorClass("FeeTooHigh");
var SyncError = createCustomErrorClass("SyncError");
var PairingFailed = createCustomErrorClass("PairingFailed");
var GenuineCheckFailed = createCustomErrorClass("GenuineCheckFailed");
var LedgerAPI4xx = createCustomErrorClass("LedgerAPI4xx");
var LedgerAPI5xx = createCustomErrorClass("LedgerAPI5xx");
var FirmwareOrAppUpdateRequired = createCustomErrorClass("FirmwareOrAppUpdateRequired");
// db stuff, no need to translate
var NoDBPathGiven = createCustomErrorClass("NoDBPathGiven");
var DBWrongPassword = createCustomErrorClass("DBWrongPassword");
var DBNotReset = createCustomErrorClass("DBNotReset");
/**
 * TransportError is used for any generic transport errors.
 * e.g. Error thrown when data received by exchanges are incorrect or if exchanged failed to communicate with the device for various reason.
 */
function TransportError(message, id) {
    this.name = "TransportError";
    this.message = message;
    this.stack = new Error().stack;
    this.id = id;
}
TransportError.prototype = new Error();
addCustomErrorDeserializer("TransportError", function (e) { return new TransportError(e.message, e.id); });
var StatusCodes = {
    PIN_REMAINING_ATTEMPTS: 0x63c0,
    INCORRECT_LENGTH: 0x6700,
    MISSING_CRITICAL_PARAMETER: 0x6800,
    COMMAND_INCOMPATIBLE_FILE_STRUCTURE: 0x6981,
    SECURITY_STATUS_NOT_SATISFIED: 0x6982,
    CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
    INCORRECT_DATA: 0x6a80,
    NOT_ENOUGH_MEMORY_SPACE: 0x6a84,
    REFERENCED_DATA_NOT_FOUND: 0x6a88,
    FILE_ALREADY_EXISTS: 0x6a89,
    INCORRECT_P1_P2: 0x6b00,
    INS_NOT_SUPPORTED: 0x6d00,
    CLA_NOT_SUPPORTED: 0x6e00,
    TECHNICAL_PROBLEM: 0x6f00,
    OK: 0x9000,
    MEMORY_PROBLEM: 0x9240,
    NO_EF_SELECTED: 0x9400,
    INVALID_OFFSET: 0x9402,
    FILE_NOT_FOUND: 0x9404,
    INCONSISTENT_FILE: 0x9408,
    ALGORITHM_NOT_SUPPORTED: 0x9484,
    INVALID_KCV: 0x9485,
    CODE_NOT_INITIALIZED: 0x9802,
    ACCESS_CONDITION_NOT_FULFILLED: 0x9804,
    CONTRADICTION_SECRET_CODE_STATUS: 0x9808,
    CONTRADICTION_INVALIDATION: 0x9810,
    CODE_BLOCKED: 0x9840,
    MAX_VALUE_REACHED: 0x9850,
    GP_AUTH_FAILED: 0x6300,
    LICENSING: 0x6f42,
    HALTED: 0x6faa,
};
function getAltStatusMessage(code) {
    switch (code) {
        // improve text of most common errors
        case 0x6700:
            return "Incorrect length";
        case 0x6800:
            return "Missing critical parameter";
        case 0x6982:
            return "Security not satisfied (dongle locked or have invalid access rights)";
        case 0x6985:
            return "Condition of use not satisfied (denied by the user?)";
        case 0x6a80:
            return "Invalid data received";
        case 0x6b00:
            return "Invalid parameter received";
    }
    if (0x6f00 <= code && code <= 0x6fff) {
        return "Internal error, please report";
    }
}
/**
 * Error thrown when a device returned a non success status.
 * the error.statusCode is one of the `StatusCodes` exported by this library.
 */
function TransportStatusError(statusCode) {
    this.name = "TransportStatusError";
    var statusText = Object.keys(StatusCodes).find(function (k) { return StatusCodes[k] === statusCode; }) ||
        "UNKNOWN_ERROR";
    var smsg = getAltStatusMessage(statusCode) || statusText;
    var statusCodeStr = statusCode.toString(16);
    this.message = "Ledger device: " + smsg + " (0x" + statusCodeStr + ")";
    this.stack = new Error().stack;
    this.statusCode = statusCode;
    this.statusText = statusText;
}
TransportStatusError.prototype = new Error();
addCustomErrorDeserializer("TransportStatusError", function (e) { return new TransportStatusError(e.statusCode); });

exports.AccountNameRequiredError = AccountNameRequiredError;
exports.AccountNotSupported = AccountNotSupported;
exports.AmountRequired = AmountRequired;
exports.BluetoothRequired = BluetoothRequired;
exports.BtcUnmatchedApp = BtcUnmatchedApp;
exports.CantOpenDevice = CantOpenDevice;
exports.CantScanQRCode = CantScanQRCode;
exports.CashAddrNotSupported = CashAddrNotSupported;
exports.CurrencyNotSupported = CurrencyNotSupported;
exports.DBNotReset = DBNotReset;
exports.DBWrongPassword = DBWrongPassword;
exports.DeviceAppVerifyNotSupported = DeviceAppVerifyNotSupported;
exports.DeviceGenuineSocketEarlyClose = DeviceGenuineSocketEarlyClose;
exports.DeviceHalted = DeviceHalted;
exports.DeviceInOSUExpected = DeviceInOSUExpected;
exports.DeviceNameInvalid = DeviceNameInvalid;
exports.DeviceNotGenuineError = DeviceNotGenuineError;
exports.DeviceOnDashboardExpected = DeviceOnDashboardExpected;
exports.DeviceOnDashboardUnexpected = DeviceOnDashboardUnexpected;
exports.DeviceShouldStayInApp = DeviceShouldStayInApp;
exports.DeviceSocketFail = DeviceSocketFail;
exports.DeviceSocketNoBulkStatus = DeviceSocketNoBulkStatus;
exports.DisconnectedDevice = DisconnectedDevice;
exports.DisconnectedDeviceDuringOperation = DisconnectedDeviceDuringOperation;
exports.ETHAddressNonEIP = ETHAddressNonEIP;
exports.EnpointConfigError = EnpointConfigError;
exports.EthAppPleaseEnableContractData = EthAppPleaseEnableContractData;
exports.FeeEstimationFailed = FeeEstimationFailed;
exports.FeeNotLoaded = FeeNotLoaded;
exports.FeeRequired = FeeRequired;
exports.FeeTooHigh = FeeTooHigh;
exports.FirmwareNotRecognized = FirmwareNotRecognized;
exports.FirmwareOrAppUpdateRequired = FirmwareOrAppUpdateRequired;
exports.GasLessThanEstimate = GasLessThanEstimate;
exports.GenuineCheckFailed = GenuineCheckFailed;
exports.HardResetFail = HardResetFail;
exports.InvalidAddress = InvalidAddress;
exports.InvalidAddressBecauseDestinationIsAlsoSource = InvalidAddressBecauseDestinationIsAlsoSource;
exports.InvalidXRPTag = InvalidXRPTag;
exports.LatestMCUInstalledError = LatestMCUInstalledError;
exports.LedgerAPI4xx = LedgerAPI4xx;
exports.LedgerAPI5xx = LedgerAPI5xx;
exports.LedgerAPIError = LedgerAPIError;
exports.LedgerAPIErrorWithMessage = LedgerAPIErrorWithMessage;
exports.LedgerAPINotAvailable = LedgerAPINotAvailable;
exports.MCUNotGenuineToDashboard = MCUNotGenuineToDashboard;
exports.ManagerAppAlreadyInstalledError = ManagerAppAlreadyInstalledError;
exports.ManagerAppDepInstallRequired = ManagerAppDepInstallRequired;
exports.ManagerAppDepUninstallRequired = ManagerAppDepUninstallRequired;
exports.ManagerAppRelyOnBTCError = ManagerAppRelyOnBTCError;
exports.ManagerDeviceLockedError = ManagerDeviceLockedError;
exports.ManagerFirmwareNotEnoughSpaceError = ManagerFirmwareNotEnoughSpaceError;
exports.ManagerNotEnoughSpaceError = ManagerNotEnoughSpaceError;
exports.ManagerUninstallBTCDep = ManagerUninstallBTCDep;
exports.NetworkDown = NetworkDown;
exports.NoAccessToCamera = NoAccessToCamera;
exports.NoAddressesFound = NoAddressesFound;
exports.NoDBPathGiven = NoDBPathGiven;
exports.NotEnoughBalance = NotEnoughBalance;
exports.NotEnoughBalanceBecauseDestinationNotCreated = NotEnoughBalanceBecauseDestinationNotCreated;
exports.NotEnoughBalanceInParentAccount = NotEnoughBalanceInParentAccount;
exports.NotEnoughBalanceToDelegate = NotEnoughBalanceToDelegate;
exports.NotEnoughGas = NotEnoughGas;
exports.NotEnoughSpendableBalance = NotEnoughSpendableBalance;
exports.NotSupportedLegacyAddress = NotSupportedLegacyAddress;
exports.PairingFailed = PairingFailed;
exports.PasswordIncorrectError = PasswordIncorrectError;
exports.PasswordsDontMatchError = PasswordsDontMatchError;
exports.RecipientRequired = RecipientRequired;
exports.RecommendSubAccountsToEmpty = RecommendSubAccountsToEmpty;
exports.RecommendUndelegation = RecommendUndelegation;
exports.StatusCodes = StatusCodes;
exports.SyncError = SyncError;
exports.TimeoutTagged = TimeoutTagged;
exports.TransportError = TransportError;
exports.TransportInterfaceNotAvailable = TransportInterfaceNotAvailable;
exports.TransportOpenUserCancelled = TransportOpenUserCancelled;
exports.TransportRaceCondition = TransportRaceCondition;
exports.TransportStatusError = TransportStatusError;
exports.TransportWebUSBGestureRequired = TransportWebUSBGestureRequired;
exports.UnavailableTezosOriginatedAccountReceive = UnavailableTezosOriginatedAccountReceive;
exports.UnavailableTezosOriginatedAccountSend = UnavailableTezosOriginatedAccountSend;
exports.UnexpectedBootloader = UnexpectedBootloader;
exports.UnknownMCU = UnknownMCU;
exports.UpdateFetchFileFail = UpdateFetchFileFail;
exports.UpdateIncorrectHash = UpdateIncorrectHash;
exports.UpdateIncorrectSig = UpdateIncorrectSig;
exports.UpdateYourApp = UpdateYourApp;
exports.UserRefusedAddress = UserRefusedAddress;
exports.UserRefusedAllowManager = UserRefusedAllowManager;
exports.UserRefusedDeviceNameChange = UserRefusedDeviceNameChange;
exports.UserRefusedFirmwareUpdate = UserRefusedFirmwareUpdate;
exports.UserRefusedOnDevice = UserRefusedOnDevice;
exports.WebsocketConnectionError = WebsocketConnectionError;
exports.WebsocketConnectionFailed = WebsocketConnectionFailed;
exports.WrongAppForCurrency = WrongAppForCurrency;
exports.WrongDeviceForAccount = WrongDeviceForAccount;
exports.addCustomErrorDeserializer = addCustomErrorDeserializer;
exports.createCustomErrorClass = createCustomErrorClass;
exports.deserializeError = deserializeError;
exports.getAltStatusMessage = getAltStatusMessage;
exports.serializeError = serializeError;

},{}],5:[function(require,module,exports){
module.exports = require("./lib/erc20");

},{"./lib/erc20":7}],6:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _utils = require("./utils");

var _errors = require("@ledgerhq/errors");

var _bignumber = require("bignumber.js");

var _rlp = require("rlp");

/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
// FIXME drop:
const starkQuantizationTypeMap = {
  eth: 1,
  erc20: 2,
  erc721: 3,
  erc20mintable: 4,
  erc721mintable: 5
};

function hexBuffer(str) {
  return Buffer.from(str.startsWith("0x") ? str.slice(2) : str, "hex");
}

function maybeHexBuffer(str) {
  if (!str) return null;
  return hexBuffer(str);
}

const remapTransactionRelatedErrors = e => {
  if (e && e.statusCode === 0x6a80) {
    return new _errors.EthAppPleaseEnableContractData("Please enable Contract data on the Ethereum app Settings");
  }

  return e;
};
/**
 * Ethereum API
 *
 * @example
 * import Eth from "@ledgerhq/hw-app-eth";
 * const eth = new Eth(transport)
 */


class Eth {
  constructor(transport, scrambleKey = "w0w") {
    this.transport = void 0;
    this.transport = transport;
    transport.decorateAppAPIMethods(this, ["getAddress", "provideERC20TokenInformation", "signTransaction", "signPersonalMessage", "getAppConfiguration", "signEIP712HashedMessage", "starkGetPublicKey", "starkSignOrder", "starkSignOrder_v2", "starkSignTransfer", "starkSignTransfer_v2", "starkProvideQuantum", "starkProvideQuantum_v2", "starkUnsafeSign", "eth2GetPublicKey", "eth2SetWithdrawalIndex"], scrambleKey);
  }
  /**
   * get Ethereum address for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay optionally enable or not the display
   * @option boolChaincode optionally enable or not the chaincode request
   * @return an object with a publicKey, address and (optionally) chainCode
   * @example
   * eth.getAddress("44'/60'/0'/0/0").then(o => o.address)
   */


  getAddress(path, boolDisplay, boolChaincode) {
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4);
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return this.transport.send(0xe0, 0x02, boolDisplay ? 0x01 : 0x00, boolChaincode ? 0x01 : 0x00, buffer).then(response => {
      let result = {};
      let publicKeyLength = response[0];
      let addressLength = response[1 + publicKeyLength];
      result.publicKey = response.slice(1, 1 + publicKeyLength).toString("hex");
      result.address = "0x" + response.slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength).toString("ascii");

      if (boolChaincode) {
        result.chainCode = response.slice(1 + publicKeyLength + 1 + addressLength, 1 + publicKeyLength + 1 + addressLength + 32).toString("hex");
      }

      return result;
    });
  }
  /**
   * This commands provides a trusted description of an ERC 20 token
   * to associate a contract address with a ticker and number of decimals.
   *
   * It shall be run immediately before performing a transaction involving a contract
   * calling this contract address to display the proper token information to the user if necessary.
   *
   * @param {*} info: a blob from "erc20.js" utilities that contains all token information.
   *
   * @example
   * import { byContractAddress } from "@ledgerhq/hw-app-eth/erc20"
   * const zrxInfo = byContractAddress("0xe41d2489571d322189246dafa5ebde1f4699f498")
   * if (zrxInfo) await appEth.provideERC20TokenInformation(zrxInfo)
   * const signed = await appEth.signTransaction(path, rawTxHex)
   */


  provideERC20TokenInformation({
    data
  }) {
    return this.transport.send(0xe0, 0x0a, 0x00, 0x00, data).then(() => true, e => {
      if (e && e.statusCode === 0x6d00) {
        // this case happen for older version of ETH app, since older app version had the ERC20 data hardcoded, it's fine to assume it worked.
        // we return a flag to know if the call was effective or not
        return false;
      }

      throw e;
    });
  }
  /**
   * You can sign a transaction and retrieve v, r, s given the raw transaction and the BIP 32 path of the account to sign
   * @example
   eth.signTransaction("44'/60'/0'/0/0", "e8018504e3b292008252089428ee52a8f3d6e5d15f8b131996950d7f296c7952872bd72a2487400080").then(result => ...)
   */


  signTransaction(path, rawTxHex) {
    let paths = (0, _utils.splitPath)(path);
    let offset = 0;
    let rawTx = Buffer.from(rawTxHex, "hex");
    let toSend = [];
    let response; // Check if the TX is encoded following EIP 155

    let rlpTx = (0, _rlp.decode)(rawTx);
    let rlpOffset = 0;
    let chainIdPrefix = "";

    if (rlpTx.length > 6) {
      let rlpVrs = (0, _rlp.encode)(rlpTx.slice(-3));
      rlpOffset = rawTx.length - (rlpVrs.length - 1);
      const chainIdSrc = rlpTx[6];
      const chainIdBuf = Buffer.alloc(4);
      chainIdSrc.copy(chainIdBuf, 4 - chainIdSrc.length);
      chainIdPrefix = (chainIdBuf.readUInt32BE(0) * 2 + 35).toString(16).slice(0, -2); // Drop the low byte, that comes from the ledger.

      if (chainIdPrefix.length % 2 === 1) {
        chainIdPrefix = "0" + chainIdPrefix;
      }
    }

    while (offset !== rawTx.length) {
      let maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 : 150;
      let chunkSize = offset + maxChunkSize > rawTx.length ? rawTx.length - offset : maxChunkSize;

      if (rlpOffset != 0 && offset + chunkSize == rlpOffset) {
        // Make sure that the chunk doesn't end right on the EIP 155 marker if set
        chunkSize--;
      }

      let buffer = Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + chunkSize : chunkSize);

      if (offset === 0) {
        buffer[0] = paths.length;
        paths.forEach((element, index) => {
          buffer.writeUInt32BE(element, 1 + 4 * index);
        });
        rawTx.copy(buffer, 1 + 4 * paths.length, offset, offset + chunkSize);
      } else {
        rawTx.copy(buffer, 0, offset, offset + chunkSize);
      }

      toSend.push(buffer);
      offset += chunkSize;
    }

    return (0, _utils.foreach)(toSend, (data, i) => this.transport.send(0xe0, 0x04, i === 0 ? 0x00 : 0x80, 0x00, data).then(apduResponse => {
      response = apduResponse;
    })).then(() => {
      const v = chainIdPrefix + response.slice(0, 1).toString("hex");
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    }, e => {
      throw remapTransactionRelatedErrors(e);
    });
  }
  /**
   */


  getAppConfiguration() {
    return this.transport.send(0xe0, 0x06, 0x00, 0x00).then(response => {
      let result = {};
      result.arbitraryDataEnabled = response[0] & 0x01;
      result.erc20ProvisioningNecessary = response[0] & 0x02;
      result.starkEnabled = response[0] & 0x04;
      result.starkv2Supported = response[0] & 0x08;
      result.version = "" + response[1] + "." + response[2] + "." + response[3];
      return result;
    });
  }
  /**
  * You can sign a message according to eth_sign RPC call and retrieve v, r, s given the message and the BIP 32 path of the account to sign.
  * @example
  eth.signPersonalMessage("44'/60'/0'/0/0", Buffer.from("test").toString("hex")).then(result => {
  var v = result['v'] - 27;
  v = v.toString(16);
  if (v.length < 2) {
    v = "0" + v;
  }
  console.log("Signature 0x" + result['r'] + result['s'] + v);
  })
   */


  signPersonalMessage(path, messageHex) {
    let paths = (0, _utils.splitPath)(path);
    let offset = 0;
    let message = Buffer.from(messageHex, "hex");
    let toSend = [];
    let response;

    while (offset !== message.length) {
      let maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 - 4 : 150;
      let chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
      let buffer = Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + 4 + chunkSize : chunkSize);

      if (offset === 0) {
        buffer[0] = paths.length;
        paths.forEach((element, index) => {
          buffer.writeUInt32BE(element, 1 + 4 * index);
        });
        buffer.writeUInt32BE(message.length, 1 + 4 * paths.length);
        message.copy(buffer, 1 + 4 * paths.length + 4, offset, offset + chunkSize);
      } else {
        message.copy(buffer, 0, offset, offset + chunkSize);
      }

      toSend.push(buffer);
      offset += chunkSize;
    }

    return (0, _utils.foreach)(toSend, (data, i) => this.transport.send(0xe0, 0x08, i === 0 ? 0x00 : 0x80, 0x00, data).then(apduResponse => {
      response = apduResponse;
    })).then(() => {
      const v = response[0];
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    });
  }
  /**
  * Sign a prepared message following web3.eth.signTypedData specification. The host computes the domain separator and hashStruct(message)
  * @example
  eth.signEIP712HashedMessage("44'/60'/0'/0/0", Buffer.from("0101010101010101010101010101010101010101010101010101010101010101").toString("hex"), Buffer.from("0202020202020202020202020202020202020202020202020202020202020202").toString("hex")).then(result => {
  var v = result['v'] - 27;
  v = v.toString(16);
  if (v.length < 2) {
    v = "0" + v;
  }
  console.log("Signature 0x" + result['r'] + result['s'] + v);
  })
   */


  signEIP712HashedMessage(path, domainSeparatorHex, hashStructMessageHex) {
    const domainSeparator = hexBuffer(domainSeparatorHex);
    const hashStruct = hexBuffer(hashStructMessageHex);
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 32 + 32, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;
    domainSeparator.copy(buffer, offset);
    offset += 32;
    hashStruct.copy(buffer, offset);
    return this.transport.send(0xe0, 0x0c, 0x00, 0x00, buffer).then(response => {
      const v = response[0];
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    });
  }
  /**
   * get Stark public key for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay optionally enable or not the display
   * @return the Stark public key
   */


  starkGetPublicKey(path, boolDisplay) {
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4);
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return this.transport.send(0xf0, 0x02, boolDisplay ? 0x01 : 0x00, 0x00, buffer).then(response => {
      return response.slice(0, response.length - 2);
    });
  }
  /**
   * sign a Stark order
   * @param path a path in BIP 32 format
   * @option sourceTokenAddress contract address of the source token (not present for ETH)
   * @param sourceQuantization quantization used for the source token
   * @option destinationTokenAddress contract address of the destination token (not present for ETH)
   * @param destinationQuantization quantization used for the destination token
   * @param sourceVault ID of the source vault
   * @param destinationVault ID of the destination vault
   * @param amountSell amount to sell
   * @param amountBuy amount to buy
   * @param nonce transaction nonce
   * @param timestamp transaction validity timestamp
   * @return the signature
   */


  starkSignOrder(path, sourceTokenAddress, sourceQuantization, destinationTokenAddress, destinationQuantization, sourceVault, destinationVault, amountSell, amountBuy, nonce, timestamp) {
    const sourceTokenAddressHex = maybeHexBuffer(sourceTokenAddress);
    const destinationTokenAddressHex = maybeHexBuffer(destinationTokenAddress);
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 20 + 32 + 20 + 32 + 4 + 4 + 8 + 8 + 4 + 4, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;

    if (sourceTokenAddressHex) {
      sourceTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;
    Buffer.from(sourceQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    offset += 32;

    if (destinationTokenAddressHex) {
      destinationTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;
    Buffer.from(destinationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    offset += 32;
    buffer.writeUInt32BE(sourceVault, offset);
    offset += 4;
    buffer.writeUInt32BE(destinationVault, offset);
    offset += 4;
    Buffer.from(amountSell.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    Buffer.from(amountBuy.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    buffer.writeUInt32BE(nonce, offset);
    offset += 4;
    buffer.writeUInt32BE(timestamp, offset);
    return this.transport.send(0xf0, 0x04, 0x01, 0x00, buffer).then(response => {
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        r,
        s
      };
    });
  }
  /**
   * sign a Stark order using the Starkex V2 protocol
   * @param path a path in BIP 32 format
   * @option sourceTokenAddress contract address of the source token (not present for ETH)
   * @param sourceQuantizationType quantization type used for the source token
   * @option sourceQuantization quantization used for the source token (not present for erc 721 or mintable erc 721)
   * @option sourceMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) associated to the source token
   * @option destinationTokenAddress contract address of the destination token (not present for ETH)
   * @param destinationQuantizationType quantization type used for the destination token
   * @option destinationQuantization quantization used for the destination token (not present for erc 721 or mintable erc 721)
   * @option destinationMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) associated to the destination token
   * @param sourceVault ID of the source vault
   * @param destinationVault ID of the destination vault
   * @param amountSell amount to sell
   * @param amountBuy amount to buy
   * @param nonce transaction nonce
   * @param timestamp transaction validity timestamp
   * @return the signature
   */


  starkSignOrder_v2(path, sourceTokenAddress, sourceQuantizationType, sourceQuantization, sourceMintableBlobOrTokenId, destinationTokenAddress, destinationQuantizationType, destinationQuantization, destinationMintableBlobOrTokenId, sourceVault, destinationVault, amountSell, amountBuy, nonce, timestamp) {
    const sourceTokenAddressHex = maybeHexBuffer(sourceTokenAddress);
    const destinationTokenAddressHex = maybeHexBuffer(destinationTokenAddress);

    if (!(sourceQuantizationType in starkQuantizationTypeMap)) {
      throw new Error("eth.starkSignOrderv2 invalid source quantization type=" + sourceQuantizationType);
    }

    if (!(destinationQuantizationType in starkQuantizationTypeMap)) {
      throw new Error("eth.starkSignOrderv2 invalid destination quantization type=" + destinationQuantizationType);
    }

    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 1 + 20 + 32 + 32 + 1 + 20 + 32 + 32 + 4 + 4 + 8 + 8 + 4 + 4, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;
    buffer[offset] = starkQuantizationTypeMap[sourceQuantizationType];
    offset++;

    if (sourceTokenAddressHex) {
      sourceTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;

    if (sourceQuantization) {
      Buffer.from(sourceQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    offset += 32;

    if (sourceMintableBlobOrTokenId) {
      Buffer.from(sourceMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    offset += 32;
    buffer[offset] = starkQuantizationTypeMap[destinationQuantizationType];
    offset++;

    if (destinationTokenAddressHex) {
      destinationTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;

    if (destinationQuantization) {
      Buffer.from(destinationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    offset += 32;

    if (destinationMintableBlobOrTokenId) {
      Buffer.from(destinationMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    offset += 32;
    buffer.writeUInt32BE(sourceVault, offset);
    offset += 4;
    buffer.writeUInt32BE(destinationVault, offset);
    offset += 4;
    Buffer.from(amountSell.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    Buffer.from(amountBuy.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    buffer.writeUInt32BE(nonce, offset);
    offset += 4;
    buffer.writeUInt32BE(timestamp, offset);
    return this.transport.send(0xf0, 0x04, 0x03, 0x00, buffer).then(response => {
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        r,
        s
      };
    });
  }
  /**
   * sign a Stark transfer
   * @param path a path in BIP 32 format
   * @option transferTokenAddress contract address of the token to be transferred (not present for ETH)
   * @param transferQuantization quantization used for the token to be transferred
   * @param targetPublicKey target Stark public key
   * @param sourceVault ID of the source vault
   * @param destinationVault ID of the destination vault
   * @param amountTransfer amount to transfer
   * @param nonce transaction nonce
   * @param timestamp transaction validity timestamp
   * @return the signature
   */


  starkSignTransfer(path, transferTokenAddress, transferQuantization, targetPublicKey, sourceVault, destinationVault, amountTransfer, nonce, timestamp) {
    const transferTokenAddressHex = maybeHexBuffer(transferTokenAddress);
    const targetPublicKeyHex = hexBuffer(targetPublicKey);
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 20 + 32 + 32 + 4 + 4 + 8 + 4 + 4, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;

    if (transferTokenAddressHex) {
      transferTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;
    Buffer.from(transferQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    offset += 32;
    targetPublicKeyHex.copy(buffer, offset);
    offset += 32;
    buffer.writeUInt32BE(sourceVault, offset);
    offset += 4;
    buffer.writeUInt32BE(destinationVault, offset);
    offset += 4;
    Buffer.from(amountTransfer.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    buffer.writeUInt32BE(nonce, offset);
    offset += 4;
    buffer.writeUInt32BE(timestamp, offset);
    return this.transport.send(0xf0, 0x04, 0x02, 0x00, buffer).then(response => {
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        r,
        s
      };
    });
  }
  /**
   * sign a Stark transfer or conditional transfer using the Starkex V2 protocol
   * @param path a path in BIP 32 format
   * @option transferTokenAddress contract address of the token to be transferred (not present for ETH)
   * @param transferQuantizationType quantization type used for the token to be transferred
   * @option transferQuantization quantization used for the token to be transferred (not present for erc 721 or mintable erc 721)
   * @option transferMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) associated to the token to be transferred
   * @param targetPublicKey target Stark public key
   * @param sourceVault ID of the source vault
   * @param destinationVault ID of the destination vault
   * @param amountTransfer amount to transfer
   * @param nonce transaction nonce
   * @param timestamp transaction validity timestamp
   * @option conditionalTransferAddress onchain address of the condition for a conditional transfer
   * @option conditionalTransferFact fact associated to the condition for a conditional transfer
   * @return the signature
   */


  starkSignTransfer_v2(path, transferTokenAddress, transferQuantizationType, transferQuantization, transferMintableBlobOrTokenId, targetPublicKey, sourceVault, destinationVault, amountTransfer, nonce, timestamp, conditionalTransferAddress, conditionalTransferFact) {
    const transferTokenAddressHex = maybeHexBuffer(transferTokenAddress);
    const targetPublicKeyHex = hexBuffer(targetPublicKey);
    const conditionalTransferAddressHex = maybeHexBuffer(conditionalTransferAddress);

    if (!(transferQuantizationType in starkQuantizationTypeMap)) {
      throw new Error("eth.starkSignTransferv2 invalid quantization type=" + transferQuantizationType);
    }

    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 1 + 20 + 32 + 32 + 32 + 4 + 4 + 8 + 4 + 4 + (conditionalTransferAddressHex ? 32 + 20 : 0), 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;
    buffer[offset] = starkQuantizationTypeMap[transferQuantizationType];
    offset++;

    if (transferTokenAddressHex) {
      transferTokenAddressHex.copy(buffer, offset);
    }

    offset += 20;

    if (transferQuantization) {
      Buffer.from(transferQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    offset += 32;

    if (transferMintableBlobOrTokenId) {
      Buffer.from(transferMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    offset += 32;
    targetPublicKeyHex.copy(buffer, offset);
    offset += 32;
    buffer.writeUInt32BE(sourceVault, offset);
    offset += 4;
    buffer.writeUInt32BE(destinationVault, offset);
    offset += 4;
    Buffer.from(amountTransfer.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
    offset += 8;
    buffer.writeUInt32BE(nonce, offset);
    offset += 4;
    buffer.writeUInt32BE(timestamp, offset);

    if (conditionalTransferAddressHex && conditionalTransferFact) {
      offset += 4;
      Buffer.from(conditionalTransferFact.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      offset += 32;
      conditionalTransferAddressHex.copy(buffer, offset);
    }

    return this.transport.send(0xf0, 0x04, conditionalTransferAddressHex ? 0x05 : 0x04, 0x00, buffer).then(response => {
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        r,
        s
      };
    });
  }
  /**
   * provide quantization information before singing a deposit or withdrawal Stark powered contract call
   *
   * It shall be run following a provideERC20TokenInformation call for the given contract
   *
   * @param operationContract contract address of the token to be transferred (not present for ETH)
   * @param operationQuantization quantization used for the token to be transferred
   */


  starkProvideQuantum(operationContract, operationQuantization) {
    const operationContractHex = maybeHexBuffer(operationContract);
    let buffer = Buffer.alloc(20 + 32, 0);

    if (operationContractHex) {
      operationContractHex.copy(buffer, 0);
    }

    Buffer.from(operationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, 20);
    return this.transport.send(0xf0, 0x08, 0x00, 0x00, buffer).then(() => true, e => {
      if (e && e.statusCode === 0x6d00) {
        // this case happen for ETH application versions not supporting Stark extensions
        return false;
      }

      throw e;
    });
  }
  /**
   * provide quantization information before singing a deposit or withdrawal Stark powered contract call using the Starkex V2 protocol
   *
   * It shall be run following a provideERC20TokenInformation call for the given contract
   *
   * @param operationContract contract address of the token to be transferred (not present for ETH)
   * @param operationQuantizationType quantization type of the token to be transferred
   * @option operationQuantization quantization used for the token to be transferred (not present for erc 721 or mintable erc 721)
   * @option operationMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) of the token to be transferred
   */


  starkProvideQuantum_v2(operationContract, operationQuantizationType, operationQuantization, operationMintableBlobOrTokenId) {
    const operationContractHex = maybeHexBuffer(operationContract);

    if (!(operationQuantizationType in starkQuantizationTypeMap)) {
      throw new Error("eth.starkProvideQuantumV2 invalid quantization type=" + operationQuantizationType);
    }

    let buffer = Buffer.alloc(20 + 32 + 32, 0);
    let offset = 0;

    if (operationContractHex) {
      operationContractHex.copy(buffer, offset);
    }

    offset += 20;

    if (operationQuantization) {
      Buffer.from(operationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    offset += 32;

    if (operationMintableBlobOrTokenId) {
      Buffer.from(operationMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
    }

    return this.transport.send(0xf0, 0x08, starkQuantizationTypeMap[operationQuantizationType], 0x00, buffer).then(() => true, e => {
      if (e && e.statusCode === 0x6d00) {
        // this case happen for ETH application versions not supporting Stark extensions
        return false;
      }

      throw e;
    });
  }
  /**
   * sign the given hash over the Stark curve
   * It is intended for speed of execution in case an unknown Stark model is pushed and should be avoided as much as possible.
   * @param path a path in BIP 32 format
   * @param hash hexadecimal hash to sign
   * @return the signature
   */


  starkUnsafeSign(path, hash) {
    const hashHex = hexBuffer(hash);
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4 + 32);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;
    hashHex.copy(buffer, offset);
    return this.transport.send(0xf0, 0x0a, 0x00, 0x00, buffer).then(response => {
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        r,
        s
      };
    });
  }
  /**
   * get an Ethereum 2 BLS-12 381 public key for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolDisplay optionally enable or not the display
   * @return an object with a publicKey
   * @example
   * eth.eth2GetPublicKey("12381/3600/0/0").then(o => o.publicKey)
   */


  eth2GetPublicKey(path, boolDisplay) {
    let paths = (0, _utils.splitPath)(path);
    let buffer = Buffer.alloc(1 + paths.length * 4);
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return this.transport.send(0xe0, 0x0e, boolDisplay ? 0x01 : 0x00, 0x00, buffer).then(response => {
      let result = {};
      result.publicKey = response.slice(0, -2).toString("hex");
      return result;
    });
  }
  /**
   * Set the index of a Withdrawal key used as withdrawal credentials in an ETH 2 deposit contract call signature
   *
   * It shall be run before the ETH 2 deposit transaction is signed. If not called, the index is set to 0
   *
   * @param withdrawalIndex index path in the EIP 2334 path m/12381/3600/withdrawalIndex/0
   * @return True if the method was executed successfully
   */


  eth2SetWithdrawalIndex(withdrawalIndex) {
    let buffer = Buffer.alloc(4, 0);
    buffer.writeUInt32BE(withdrawalIndex, 0);
    return this.transport.send(0xe0, 0x10, 0x00, 0x00, buffer).then(() => true, e => {
      if (e && e.statusCode === 0x6d00) {
        // this case happen for ETH application versions not supporting ETH 2
        return false;
      }

      throw e;
    });
  }

}

exports.default = Eth;

}).call(this,require("buffer").Buffer)
},{"./utils":8,"@ledgerhq/errors":4,"bignumber.js":17,"buffer":20,"rlp":23}],7:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.list = exports.byContractAddress = void 0;

var _erc20Signatures = _interopRequireDefault(require("@ledgerhq/cryptoassets/data/erc20-signatures"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Retrieve the token information by a given contract address if any
 */
const byContractAddress = contract => get().byContract(asContractAddress(contract));
/**
 * list all the ERC20 tokens informations
 */


exports.byContractAddress = byContractAddress;

const list = () => get().list();

exports.list = list;

const asContractAddress = addr => {
  const a = addr.toLowerCase();
  return a.startsWith("0x") ? a : "0x" + a;
}; // this internal get() will lazy load and cache the data from the erc20 data blob


const get = (() => {
  let cache;
  return () => {
    if (cache) return cache;
    const buf = Buffer.from(_erc20Signatures.default, "base64");
    const byContract = {};
    const entries = [];
    let i = 0;

    while (i < buf.length) {
      const length = buf.readUInt32BE(i);
      i += 4;
      const item = buf.slice(i, i + length);
      let j = 0;
      const tickerLength = item.readUInt8(j);
      j += 1;
      const ticker = item.slice(j, j + tickerLength).toString("ascii");
      j += tickerLength;
      const contractAddress = asContractAddress(item.slice(j, j + 20).toString("hex"));
      j += 20;
      const decimals = item.readUInt32BE(j);
      j += 4;
      const chainId = item.readUInt32BE(j);
      j += 4;
      const signature = item.slice(j);
      const entry = {
        ticker,
        contractAddress,
        decimals,
        chainId,
        signature,
        data: item
      };
      entries.push(entry);
      byContract[contractAddress] = entry;
      i += length;
    }

    const api = {
      list: () => entries,
      byContract: contractAddress => byContract[contractAddress]
    };
    cache = api;
    return api;
  };
})();

}).call(this,require("buffer").Buffer)
},{"@ledgerhq/cryptoassets/data/erc20-signatures":3,"buffer":20}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.defer = defer;
exports.splitPath = splitPath;
exports.eachSeries = eachSeries;
exports.foreach = foreach;
exports.doIf = doIf;
exports.asyncWhile = asyncWhile;

/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
function defer() {
  let resolve, reject;
  let promise = new Promise(function (success, failure) {
    resolve = success;
    reject = failure;
  });
  if (!resolve || !reject) throw "defer() error"; // this never happens and is just to make flow happy

  return {
    promise,
    resolve,
    reject
  };
} // TODO use bip32-path library


function splitPath(path) {
  let result = [];
  let components = path.split("/");
  components.forEach(element => {
    let number = parseInt(element, 10);

    if (isNaN(number)) {
      return; // FIXME shouldn't it throws instead?
    }

    if (element.length > 1 && element[element.length - 1] === "'") {
      number += 0x80000000;
    }

    result.push(number);
  });
  return result;
} // TODO use async await


function eachSeries(arr, fun) {
  return arr.reduce((p, e) => p.then(() => fun(e)), Promise.resolve());
}

function foreach(arr, callback) {
  function iterate(index, array, result) {
    if (index >= array.length) {
      return result;
    } else return callback(array[index], index).then(function (res) {
      result.push(res);
      return iterate(index + 1, array, result);
    });
  }

  return Promise.resolve().then(() => iterate(0, arr, []));
}

function doIf(condition, callback) {
  return Promise.resolve().then(() => {
    if (condition) {
      return callback();
    }
  });
}

function asyncWhile(predicate, callback) {
  function iterate(result) {
    if (!predicate()) {
      return result;
    } else {
      return callback().then(res => {
        result.push(res);
        return iterate(result);
      });
    }
  }

  return Promise.resolve([]).then(iterate);
}

},{}],9:[function(require,module,exports){
(function (global,Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _hwTransport = _interopRequireDefault(require("@ledgerhq/hw-transport"));

var _errors = require("@ledgerhq/errors");

var _logs = require("@ledgerhq/logs");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const WebSocket = global.WebSocket || require("ws");
/**
 * WebSocket transport implementation
 */


class WebSocketTransport extends _hwTransport.default {
  // this transport is not discoverable
  static async open(url) {
    const exchangeMethods = await new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(url);
        const exchangeMethods = {
          resolveExchange: _b => {},
          rejectExchange: _e => {},
          onDisconnect: () => {},
          close: () => socket.close(),
          send: msg => socket.send(msg)
        };

        socket.onopen = () => {
          socket.send("open");
        };

        socket.onerror = e => {
          exchangeMethods.onDisconnect();
          reject(e);
        };

        socket.onclose = () => {
          exchangeMethods.onDisconnect();
          reject(new _errors.TransportError("OpenFailed", "OpenFailed"));
        };

        socket.onmessage = e => {
          if (typeof e.data !== "string") return;
          const data = JSON.parse(e.data);

          switch (data.type) {
            case "opened":
              return resolve(exchangeMethods);

            case "error":
              reject(new Error(data.error));
              return exchangeMethods.rejectExchange(new _errors.TransportError(data.error, "WSError"));

            case "response":
              return exchangeMethods.resolveExchange(Buffer.from(data.data, "hex"));
          }
        };
      } catch (e) {
        reject(e);
      }
    });
    return new WebSocketTransport(exchangeMethods);
  }

  constructor(hook) {
    super();
    this.hook = void 0;
    this.hook = hook;

    hook.onDisconnect = () => {
      this.emit("disconnect");
      this.hook.rejectExchange(new _errors.TransportError("WebSocket disconnected", "WSDisconnect"));
    };
  }

  async exchange(apdu) {
    const hex = apdu.toString("hex");
    (0, _logs.log)("apdu", "=> " + hex);
    const res = await new Promise((resolve, reject) => {
      this.hook.rejectExchange = e => reject(e);

      this.hook.resolveExchange = b => resolve(b);

      this.hook.send(hex);
    });
    (0, _logs.log)("apdu", "<= " + res.toString("hex"));
    return res;
  }

  setScrambleKey() {}

  async close() {
    this.hook.close();
    return new Promise(success => {
      setTimeout(success, 200);
    });
  }

}

exports.default = WebSocketTransport;

WebSocketTransport.isSupported = () => Promise.resolve(typeof WebSocket === "function");

WebSocketTransport.list = () => Promise.resolve([]);

WebSocketTransport.listen = _observer => ({
  unsubscribe: () => {}
});

WebSocketTransport.check = async (url, timeout = 5000) => new Promise((resolve, reject) => {
  const socket = new WebSocket(url);
  let success = false;
  setTimeout(() => {
    socket.close();
  }, timeout);

  socket.onopen = () => {
    success = true;
    socket.close();
  };

  socket.onclose = () => {
    if (success) resolve();else {
      reject(new _errors.TransportError("failed to access WebSocketTransport(" + url + ")", "WebSocketTransportNotAccessible"));
    }
  };

  socket.onerror = () => {
    reject(new _errors.TransportError("failed to access WebSocketTransport(" + url + "): error", "WebSocketTransportNotAccessible"));
  };
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"@ledgerhq/errors":10,"@ledgerhq/hw-transport":11,"@ledgerhq/logs":12,"buffer":20,"ws":27}],10:[function(require,module,exports){
arguments[4][4][0].apply(exports,arguments)
},{"dup":4}],11:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "TransportError", {
  enumerable: true,
  get: function () {
    return _errors.TransportError;
  }
});
Object.defineProperty(exports, "StatusCodes", {
  enumerable: true,
  get: function () {
    return _errors.StatusCodes;
  }
});
Object.defineProperty(exports, "getAltStatusMessage", {
  enumerable: true,
  get: function () {
    return _errors.getAltStatusMessage;
  }
});
Object.defineProperty(exports, "TransportStatusError", {
  enumerable: true,
  get: function () {
    return _errors.TransportStatusError;
  }
});
exports.default = void 0;

var _events = _interopRequireDefault(require("events"));

var _errors = require("@ledgerhq/errors");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Transport defines the generic interface to share between node/u2f impl
 * A **Descriptor** is a parametric type that is up to be determined for the implementation.
 * it can be for instance an ID, an file path, a URL,...
 */
class Transport {
  constructor() {
    this.exchangeTimeout = 30000;
    this.unresponsiveTimeout = 15000;
    this.deviceModel = null;
    this._events = new _events.default();

    this.send = async (cla, ins, p1, p2, data = Buffer.alloc(0), statusList = [_errors.StatusCodes.OK]) => {
      if (data.length >= 256) {
        throw new _errors.TransportError("data.length exceed 256 bytes limit. Got: " + data.length, "DataLengthTooBig");
      }

      const response = await this.exchange(Buffer.concat([Buffer.from([cla, ins, p1, p2]), Buffer.from([data.length]), data]));
      const sw = response.readUInt16BE(response.length - 2);

      if (!statusList.some(s => s === sw)) {
        throw new _errors.TransportStatusError(sw);
      }

      return response;
    };

    this.exchangeBusyPromise = void 0;

    this.exchangeAtomicImpl = async f => {
      if (this.exchangeBusyPromise) {
        throw new _errors.TransportRaceCondition("An action was already pending on the Ledger device. Please deny or reconnect.");
      }

      let resolveBusy;
      const busyPromise = new Promise(r => {
        resolveBusy = r;
      });
      this.exchangeBusyPromise = busyPromise;
      let unresponsiveReached = false;
      const timeout = setTimeout(() => {
        unresponsiveReached = true;
        this.emit("unresponsive");
      }, this.unresponsiveTimeout);

      try {
        const res = await f();

        if (unresponsiveReached) {
          this.emit("responsive");
        }

        return res;
      } finally {
        clearTimeout(timeout);
        if (resolveBusy) resolveBusy();
        this.exchangeBusyPromise = null;
      }
    };

    this._appAPIlock = null;
  }

  /**
   * low level api to communicate with the device
   * This method is for implementations to implement but should not be directly called.
   * Instead, the recommanded way is to use send() method
   * @param apdu the data to send
   * @return a Promise of response data
   */
  exchange(_apdu) {
    throw new Error("exchange not implemented");
  }
  /**
   * set the "scramble key" for the next exchanges with the device.
   * Each App can have a different scramble key and they internally will set it at instanciation.
   * @param key the scramble key
   */


  setScrambleKey(_key) {}
  /**
   * close the exchange with the device.
   * @return a Promise that ends when the transport is closed.
   */


  close() {
    return Promise.resolve();
  }

  /**
   * Listen to an event on an instance of transport.
   * Transport implementation can have specific events. Here is the common events:
   * * `"disconnect"` : triggered if Transport is disconnected
   */
  on(eventName, cb) {
    this._events.on(eventName, cb);
  }
  /**
   * Stop listening to an event on an instance of transport.
   */


  off(eventName, cb) {
    this._events.removeListener(eventName, cb);
  }

  emit(event, ...args) {
    this._events.emit(event, ...args);
  }
  /**
   * Enable or not logs of the binary exchange
   */


  setDebugMode() {
    console.warn("setDebugMode is deprecated. use @ledgerhq/logs instead. No logs are emitted in this anymore.");
  }
  /**
   * Set a timeout (in milliseconds) for the exchange call. Only some transport might implement it. (e.g. U2F)
   */


  setExchangeTimeout(exchangeTimeout) {
    this.exchangeTimeout = exchangeTimeout;
  }
  /**
   * Define the delay before emitting "unresponsive" on an exchange that does not respond
   */


  setExchangeUnresponsiveTimeout(unresponsiveTimeout) {
    this.unresponsiveTimeout = unresponsiveTimeout;
  }
  /**
   * wrapper on top of exchange to simplify work of the implementation.
   * @param cla
   * @param ins
   * @param p1
   * @param p2
   * @param data
   * @param statusList is a list of accepted status code (shorts). [0x9000] by default
   * @return a Promise of response buffer
   */


  /**
   * create() allows to open the first descriptor available or
   * throw if there is none or if timeout is reached.
   * This is a light helper, alternative to using listen() and open() (that you may need for any more advanced usecase)
   * @example
  TransportFoo.create().then(transport => ...)
   */
  static create(openTimeout = 3000, listenTimeout) {
    return new Promise((resolve, reject) => {
      let found = false;
      const sub = this.listen({
        next: e => {
          found = true;
          if (sub) sub.unsubscribe();
          if (listenTimeoutId) clearTimeout(listenTimeoutId);
          this.open(e.descriptor, openTimeout).then(resolve, reject);
        },
        error: e => {
          if (listenTimeoutId) clearTimeout(listenTimeoutId);
          reject(e);
        },
        complete: () => {
          if (listenTimeoutId) clearTimeout(listenTimeoutId);

          if (!found) {
            reject(new _errors.TransportError(this.ErrorMessage_NoDeviceFound, "NoDeviceFound"));
          }
        }
      });
      const listenTimeoutId = listenTimeout ? setTimeout(() => {
        sub.unsubscribe();
        reject(new _errors.TransportError(this.ErrorMessage_ListenTimeout, "ListenTimeout"));
      }, listenTimeout) : null;
    });
  }

  decorateAppAPIMethods(self, methods, scrambleKey) {
    for (let methodName of methods) {
      self[methodName] = this.decorateAppAPIMethod(methodName, self[methodName], self, scrambleKey);
    }
  }

  decorateAppAPIMethod(methodName, f, ctx, scrambleKey) {
    return async (...args) => {
      const {
        _appAPIlock
      } = this;

      if (_appAPIlock) {
        return Promise.reject(new _errors.TransportError("Ledger Device is busy (lock " + _appAPIlock + ")", "TransportLocked"));
      }

      try {
        this._appAPIlock = methodName;
        this.setScrambleKey(scrambleKey);
        return await f.apply(ctx, args);
      } finally {
        this._appAPIlock = null;
      }
    };
  }

}

exports.default = Transport;
Transport.isSupported = void 0;
Transport.list = void 0;
Transport.listen = void 0;
Transport.open = void 0;
Transport.ErrorMessage_ListenTimeout = "No Ledger device found (timeout)";
Transport.ErrorMessage_NoDeviceFound = "No Ledger device found";

}).call(this,require("buffer").Buffer)
},{"@ledgerhq/errors":10,"buffer":20,"events":21}],12:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.listen = exports.log = void 0;

/**
 * A Log object
 */
let id = 0;
const subscribers = [];
/**
 * log something
 * @param type a namespaced identifier of the log (it is not a level like "debug", "error" but more like "apdu-in", "apdu-out", etc...)
 * @param message a clear message of the log associated to the type
 */

const log = (type, message, data) => {
  const obj = {
    type,
    id: String(++id),
    date: new Date()
  };
  if (message) obj.message = message;
  if (data) obj.data = data;
  dispatch(obj);
};
/**
 * listen to logs.
 * @param cb that is called for each future log() with the Log object
 * @return a function that can be called to unsubscribe the listener
 */


exports.log = log;

const listen = cb => {
  subscribers.push(cb);
  return () => {
    const i = subscribers.indexOf(cb);

    if (i !== -1) {
      // equivalent of subscribers.splice(i, 1) // https://twitter.com/Rich_Harris/status/1125850391155965952
      subscribers[i] = subscribers[subscribers.length - 1];
      subscribers.pop();
    }
  };
};

exports.listen = listen;

function dispatch(log) {
  for (let i = 0; i < subscribers.length; i++) {
    try {
      subscribers[i](log);
    } catch (e) {
      console.error(e);
    }
  }
} // for debug purpose


if (typeof window !== "undefined") {
  window.__ledgerLogsListen = listen;
}

},{}],13:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _u2fApi = require("u2f-api");

var _hwTransport = _interopRequireDefault(require("@ledgerhq/hw-transport"));

var _logs = require("@ledgerhq/logs");

var _errors = require("@ledgerhq/errors");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function wrapU2FTransportError(originalError, message, id) {
  const err = new _errors.TransportError(message, id); // $FlowFixMe

  err.originalError = originalError;
  return err;
}

function wrapApdu(apdu, key) {
  const result = Buffer.alloc(apdu.length);

  for (let i = 0; i < apdu.length; i++) {
    result[i] = apdu[i] ^ key[i % key.length];
  }

  return result;
} // Convert from normal to web-safe, strip trailing "="s


const webSafe64 = base64 => base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // Convert from web-safe to normal, add trailing "="s


const normal64 = base64 => base64.replace(/-/g, "+").replace(/_/g, "/") + "==".substring(0, 3 * base64.length % 4);

function attemptExchange(apdu, timeoutMillis, scrambleKey, unwrap) {
  const keyHandle = wrapApdu(apdu, scrambleKey);
  const challenge = Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex");
  const signRequest = {
    version: "U2F_V2",
    keyHandle: webSafe64(keyHandle.toString("base64")),
    challenge: webSafe64(challenge.toString("base64")),
    appId: location.origin
  };
  (0, _logs.log)("apdu", "=> " + apdu.toString("hex"));
  return (0, _u2fApi.sign)(signRequest, timeoutMillis / 1000).then(response => {
    const {
      signatureData
    } = response;

    if (typeof signatureData === "string") {
      const data = Buffer.from(normal64(signatureData), "base64");
      let result;

      if (!unwrap) {
        result = data;
      } else {
        result = data.slice(5);
      }

      (0, _logs.log)("apdu", "<= " + result.toString("hex"));
      return result;
    } else {
      throw response;
    }
  });
}

let transportInstances = [];

function emitDisconnect() {
  transportInstances.forEach(t => t.emit("disconnect"));
  transportInstances = [];
}

function isTimeoutU2FError(u2fError) {
  return u2fError.metaData.code === 5;
}
/**
 * U2F web Transport implementation
 * @example
 * import TransportU2F from "@ledgerhq/hw-transport-u2f";
 * ...
 * TransportU2F.create().then(transport => ...)
 */


class TransportU2F extends _hwTransport.default {
  /*
   */

  /*
   */

  /**
   * static function to create a new Transport from a connected Ledger device discoverable via U2F (browser support)
   */
  static async open(_, _openTimeout = 5000) {
    return new TransportU2F();
  }

  constructor() {
    super();
    this.scrambleKey = void 0;
    this.unwrap = true;
    transportInstances.push(this);
  }
  /**
   * Exchange with the device using APDU protocol.
   * @param apdu
   * @returns a promise of apdu response
   */


  async exchange(apdu) {
    try {
      return await attemptExchange(apdu, this.exchangeTimeout, this.scrambleKey, this.unwrap);
    } catch (e) {
      const isU2FError = typeof e.metaData === "object";

      if (isU2FError) {
        if (isTimeoutU2FError(e)) {
          emitDisconnect();
        } // the wrapping make error more usable and "printable" to the end user.


        throw wrapU2FTransportError(e, "Failed to sign with Ledger device: U2F " + e.metaData.type, "U2F_" + e.metaData.code);
      } else {
        throw e;
      }
    }
  }
  /**
   */


  setScrambleKey(scrambleKey) {
    this.scrambleKey = Buffer.from(scrambleKey, "ascii");
  }
  /**
   */


  setUnwrap(unwrap) {
    this.unwrap = unwrap;
  }

  close() {
    // u2f have no way to clean things up
    return Promise.resolve();
  }

}

exports.default = TransportU2F;
TransportU2F.isSupported = _u2fApi.isSupported;

TransportU2F.list = () => // this transport is not discoverable but we are going to guess if it is here with isSupported()
(0, _u2fApi.isSupported)().then(supported => supported ? [null] : []);

TransportU2F.listen = observer => {
  let unsubscribed = false;
  (0, _u2fApi.isSupported)().then(supported => {
    if (unsubscribed) return;

    if (supported) {
      observer.next({
        type: "add",
        descriptor: null
      });
      observer.complete();
    } else {
      observer.error(new _errors.TransportError("U2F browser support is needed for Ledger. " + "Please use Chrome, Opera or Firefox with a U2F extension. " + "Also make sure you're on an HTTPS connection", "U2FNotSupported"));
    }
  });
  return {
    unsubscribe: () => {
      unsubscribed = true;
    }
  };
};

}).call(this,require("buffer").Buffer)
},{"@ledgerhq/errors":4,"@ledgerhq/hw-transport":14,"@ledgerhq/logs":15,"buffer":20,"u2f-api":24}],14:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"@ledgerhq/errors":4,"buffer":20,"dup":11,"events":21}],15:[function(require,module,exports){
arguments[4][12][0].apply(exports,arguments)
},{"dup":12}],16:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  for (var i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],17:[function(require,module,exports){
;(function (globalObject) {
  'use strict';

/*
 *      bignumber.js v9.0.1
 *      A JavaScript library for arbitrary-precision arithmetic.
 *      https://github.com/MikeMcl/bignumber.js
 *      Copyright (c) 2020 Michael Mclaughlin <M8ch88l@gmail.com>
 *      MIT Licensed.
 *
 *      BigNumber.prototype methods     |  BigNumber methods
 *                                      |
 *      absoluteValue            abs    |  clone
 *      comparedTo                      |  config               set
 *      decimalPlaces            dp     |      DECIMAL_PLACES
 *      dividedBy                div    |      ROUNDING_MODE
 *      dividedToIntegerBy       idiv   |      EXPONENTIAL_AT
 *      exponentiatedBy          pow    |      RANGE
 *      integerValue                    |      CRYPTO
 *      isEqualTo                eq     |      MODULO_MODE
 *      isFinite                        |      POW_PRECISION
 *      isGreaterThan            gt     |      FORMAT
 *      isGreaterThanOrEqualTo   gte    |      ALPHABET
 *      isInteger                       |  isBigNumber
 *      isLessThan               lt     |  maximum              max
 *      isLessThanOrEqualTo      lte    |  minimum              min
 *      isNaN                           |  random
 *      isNegative                      |  sum
 *      isPositive                      |
 *      isZero                          |
 *      minus                           |
 *      modulo                   mod    |
 *      multipliedBy             times  |
 *      negated                         |
 *      plus                            |
 *      precision                sd     |
 *      shiftedBy                       |
 *      squareRoot               sqrt   |
 *      toExponential                   |
 *      toFixed                         |
 *      toFormat                        |
 *      toFraction                      |
 *      toJSON                          |
 *      toNumber                        |
 *      toPrecision                     |
 *      toString                        |
 *      valueOf                         |
 *
 */


  var BigNumber,
    isNumeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i,
    mathceil = Math.ceil,
    mathfloor = Math.floor,

    bignumberError = '[BigNumber Error] ',
    tooManyDigits = bignumberError + 'Number primitive has more than 15 significant digits: ',

    BASE = 1e14,
    LOG_BASE = 14,
    MAX_SAFE_INTEGER = 0x1fffffffffffff,         // 2^53 - 1
    // MAX_INT32 = 0x7fffffff,                   // 2^31 - 1
    POWS_TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13],
    SQRT_BASE = 1e7,

    // EDITABLE
    // The limit on the value of DECIMAL_PLACES, TO_EXP_NEG, TO_EXP_POS, MIN_EXP, MAX_EXP, and
    // the arguments to toExponential, toFixed, toFormat, and toPrecision.
    MAX = 1E9;                                   // 0 to MAX_INT32


  /*
   * Create and return a BigNumber constructor.
   */
  function clone(configObject) {
    var div, convertBase, parseNumeric,
      P = BigNumber.prototype = { constructor: BigNumber, toString: null, valueOf: null },
      ONE = new BigNumber(1),


      //----------------------------- EDITABLE CONFIG DEFAULTS -------------------------------


      // The default values below must be integers within the inclusive ranges stated.
      // The values can also be changed at run-time using BigNumber.set.

      // The maximum number of decimal places for operations involving division.
      DECIMAL_PLACES = 20,                     // 0 to MAX

      // The rounding mode used when rounding to the above decimal places, and when using
      // toExponential, toFixed, toFormat and toPrecision, and round (default value).
      // UP         0 Away from zero.
      // DOWN       1 Towards zero.
      // CEIL       2 Towards +Infinity.
      // FLOOR      3 Towards -Infinity.
      // HALF_UP    4 Towards nearest neighbour. If equidistant, up.
      // HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
      // HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
      // HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
      // HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
      ROUNDING_MODE = 4,                       // 0 to 8

      // EXPONENTIAL_AT : [TO_EXP_NEG , TO_EXP_POS]

      // The exponent value at and beneath which toString returns exponential notation.
      // Number type: -7
      TO_EXP_NEG = -7,                         // 0 to -MAX

      // The exponent value at and above which toString returns exponential notation.
      // Number type: 21
      TO_EXP_POS = 21,                         // 0 to MAX

      // RANGE : [MIN_EXP, MAX_EXP]

      // The minimum exponent value, beneath which underflow to zero occurs.
      // Number type: -324  (5e-324)
      MIN_EXP = -1e7,                          // -1 to -MAX

      // The maximum exponent value, above which overflow to Infinity occurs.
      // Number type:  308  (1.7976931348623157e+308)
      // For MAX_EXP > 1e7, e.g. new BigNumber('1e100000000').plus(1) may be slow.
      MAX_EXP = 1e7,                           // 1 to MAX

      // Whether to use cryptographically-secure random number generation, if available.
      CRYPTO = false,                          // true or false

      // The modulo mode used when calculating the modulus: a mod n.
      // The quotient (q = a / n) is calculated according to the corresponding rounding mode.
      // The remainder (r) is calculated as: r = a - n * q.
      //
      // UP        0 The remainder is positive if the dividend is negative, else is negative.
      // DOWN      1 The remainder has the same sign as the dividend.
      //             This modulo mode is commonly known as 'truncated division' and is
      //             equivalent to (a % n) in JavaScript.
      // FLOOR     3 The remainder has the same sign as the divisor (Python %).
      // HALF_EVEN 6 This modulo mode implements the IEEE 754 remainder function.
      // EUCLID    9 Euclidian division. q = sign(n) * floor(a / abs(n)).
      //             The remainder is always positive.
      //
      // The truncated division, floored division, Euclidian division and IEEE 754 remainder
      // modes are commonly used for the modulus operation.
      // Although the other rounding modes can also be used, they may not give useful results.
      MODULO_MODE = 1,                         // 0 to 9

      // The maximum number of significant digits of the result of the exponentiatedBy operation.
      // If POW_PRECISION is 0, there will be unlimited significant digits.
      POW_PRECISION = 0,                    // 0 to MAX

      // The format specification used by the BigNumber.prototype.toFormat method.
      FORMAT = {
        prefix: '',
        groupSize: 3,
        secondaryGroupSize: 0,
        groupSeparator: ',',
        decimalSeparator: '.',
        fractionGroupSize: 0,
        fractionGroupSeparator: '\xA0',      // non-breaking space
        suffix: ''
      },

      // The alphabet used for base conversion. It must be at least 2 characters long, with no '+',
      // '-', '.', whitespace, or repeated character.
      // '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_'
      ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';


    //------------------------------------------------------------------------------------------


    // CONSTRUCTOR


    /*
     * The BigNumber constructor and exported function.
     * Create and return a new instance of a BigNumber object.
     *
     * v {number|string|BigNumber} A numeric value.
     * [b] {number} The base of v. Integer, 2 to ALPHABET.length inclusive.
     */
    function BigNumber(v, b) {
      var alphabet, c, caseChanged, e, i, isNum, len, str,
        x = this;

      // Enable constructor call without `new`.
      if (!(x instanceof BigNumber)) return new BigNumber(v, b);

      if (b == null) {

        if (v && v._isBigNumber === true) {
          x.s = v.s;

          if (!v.c || v.e > MAX_EXP) {
            x.c = x.e = null;
          } else if (v.e < MIN_EXP) {
            x.c = [x.e = 0];
          } else {
            x.e = v.e;
            x.c = v.c.slice();
          }

          return;
        }

        if ((isNum = typeof v == 'number') && v * 0 == 0) {

          // Use `1 / n` to handle minus zero also.
          x.s = 1 / v < 0 ? (v = -v, -1) : 1;

          // Fast path for integers, where n < 2147483648 (2**31).
          if (v === ~~v) {
            for (e = 0, i = v; i >= 10; i /= 10, e++);

            if (e > MAX_EXP) {
              x.c = x.e = null;
            } else {
              x.e = e;
              x.c = [v];
            }

            return;
          }

          str = String(v);
        } else {

          if (!isNumeric.test(str = String(v))) return parseNumeric(x, str, isNum);

          x.s = str.charCodeAt(0) == 45 ? (str = str.slice(1), -1) : 1;
        }

        // Decimal point?
        if ((e = str.indexOf('.')) > -1) str = str.replace('.', '');

        // Exponential form?
        if ((i = str.search(/e/i)) > 0) {

          // Determine exponent.
          if (e < 0) e = i;
          e += +str.slice(i + 1);
          str = str.substring(0, i);
        } else if (e < 0) {

          // Integer.
          e = str.length;
        }

      } else {

        // '[BigNumber Error] Base {not a primitive number|not an integer|out of range}: {b}'
        intCheck(b, 2, ALPHABET.length, 'Base');

        // Allow exponential notation to be used with base 10 argument, while
        // also rounding to DECIMAL_PLACES as with other bases.
        if (b == 10) {
          x = new BigNumber(v);
          return round(x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE);
        }

        str = String(v);

        if (isNum = typeof v == 'number') {

          // Avoid potential interpretation of Infinity and NaN as base 44+ values.
          if (v * 0 != 0) return parseNumeric(x, str, isNum, b);

          x.s = 1 / v < 0 ? (str = str.slice(1), -1) : 1;

          // '[BigNumber Error] Number primitive has more than 15 significant digits: {n}'
          if (BigNumber.DEBUG && str.replace(/^0\.0*|\./, '').length > 15) {
            throw Error
             (tooManyDigits + v);
          }
        } else {
          x.s = str.charCodeAt(0) === 45 ? (str = str.slice(1), -1) : 1;
        }

        alphabet = ALPHABET.slice(0, b);
        e = i = 0;

        // Check that str is a valid base b number.
        // Don't use RegExp, so alphabet can contain special characters.
        for (len = str.length; i < len; i++) {
          if (alphabet.indexOf(c = str.charAt(i)) < 0) {
            if (c == '.') {

              // If '.' is not the first character and it has not be found before.
              if (i > e) {
                e = len;
                continue;
              }
            } else if (!caseChanged) {

              // Allow e.g. hexadecimal 'FF' as well as 'ff'.
              if (str == str.toUpperCase() && (str = str.toLowerCase()) ||
                  str == str.toLowerCase() && (str = str.toUpperCase())) {
                caseChanged = true;
                i = -1;
                e = 0;
                continue;
              }
            }

            return parseNumeric(x, String(v), isNum, b);
          }
        }

        // Prevent later check for length on converted number.
        isNum = false;
        str = convertBase(str, b, 10, x.s);

        // Decimal point?
        if ((e = str.indexOf('.')) > -1) str = str.replace('.', '');
        else e = str.length;
      }

      // Determine leading zeros.
      for (i = 0; str.charCodeAt(i) === 48; i++);

      // Determine trailing zeros.
      for (len = str.length; str.charCodeAt(--len) === 48;);

      if (str = str.slice(i, ++len)) {
        len -= i;

        // '[BigNumber Error] Number primitive has more than 15 significant digits: {n}'
        if (isNum && BigNumber.DEBUG &&
          len > 15 && (v > MAX_SAFE_INTEGER || v !== mathfloor(v))) {
            throw Error
             (tooManyDigits + (x.s * v));
        }

         // Overflow?
        if ((e = e - i - 1) > MAX_EXP) {

          // Infinity.
          x.c = x.e = null;

        // Underflow?
        } else if (e < MIN_EXP) {

          // Zero.
          x.c = [x.e = 0];
        } else {
          x.e = e;
          x.c = [];

          // Transform base

          // e is the base 10 exponent.
          // i is where to slice str to get the first element of the coefficient array.
          i = (e + 1) % LOG_BASE;
          if (e < 0) i += LOG_BASE;  // i < 1

          if (i < len) {
            if (i) x.c.push(+str.slice(0, i));

            for (len -= LOG_BASE; i < len;) {
              x.c.push(+str.slice(i, i += LOG_BASE));
            }

            i = LOG_BASE - (str = str.slice(i)).length;
          } else {
            i -= len;
          }

          for (; i--; str += '0');
          x.c.push(+str);
        }
      } else {

        // Zero.
        x.c = [x.e = 0];
      }
    }


    // CONSTRUCTOR PROPERTIES


    BigNumber.clone = clone;

    BigNumber.ROUND_UP = 0;
    BigNumber.ROUND_DOWN = 1;
    BigNumber.ROUND_CEIL = 2;
    BigNumber.ROUND_FLOOR = 3;
    BigNumber.ROUND_HALF_UP = 4;
    BigNumber.ROUND_HALF_DOWN = 5;
    BigNumber.ROUND_HALF_EVEN = 6;
    BigNumber.ROUND_HALF_CEIL = 7;
    BigNumber.ROUND_HALF_FLOOR = 8;
    BigNumber.EUCLID = 9;


    /*
     * Configure infrequently-changing library-wide settings.
     *
     * Accept an object with the following optional properties (if the value of a property is
     * a number, it must be an integer within the inclusive range stated):
     *
     *   DECIMAL_PLACES   {number}           0 to MAX
     *   ROUNDING_MODE    {number}           0 to 8
     *   EXPONENTIAL_AT   {number|number[]}  -MAX to MAX  or  [-MAX to 0, 0 to MAX]
     *   RANGE            {number|number[]}  -MAX to MAX (not zero)  or  [-MAX to -1, 1 to MAX]
     *   CRYPTO           {boolean}          true or false
     *   MODULO_MODE      {number}           0 to 9
     *   POW_PRECISION       {number}           0 to MAX
     *   ALPHABET         {string}           A string of two or more unique characters which does
     *                                       not contain '.'.
     *   FORMAT           {object}           An object with some of the following properties:
     *     prefix                 {string}
     *     groupSize              {number}
     *     secondaryGroupSize     {number}
     *     groupSeparator         {string}
     *     decimalSeparator       {string}
     *     fractionGroupSize      {number}
     *     fractionGroupSeparator {string}
     *     suffix                 {string}
     *
     * (The values assigned to the above FORMAT object properties are not checked for validity.)
     *
     * E.g.
     * BigNumber.config({ DECIMAL_PLACES : 20, ROUNDING_MODE : 4 })
     *
     * Ignore properties/parameters set to null or undefined, except for ALPHABET.
     *
     * Return an object with the properties current values.
     */
    BigNumber.config = BigNumber.set = function (obj) {
      var p, v;

      if (obj != null) {

        if (typeof obj == 'object') {

          // DECIMAL_PLACES {number} Integer, 0 to MAX inclusive.
          // '[BigNumber Error] DECIMAL_PLACES {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'DECIMAL_PLACES')) {
            v = obj[p];
            intCheck(v, 0, MAX, p);
            DECIMAL_PLACES = v;
          }

          // ROUNDING_MODE {number} Integer, 0 to 8 inclusive.
          // '[BigNumber Error] ROUNDING_MODE {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'ROUNDING_MODE')) {
            v = obj[p];
            intCheck(v, 0, 8, p);
            ROUNDING_MODE = v;
          }

          // EXPONENTIAL_AT {number|number[]}
          // Integer, -MAX to MAX inclusive or
          // [integer -MAX to 0 inclusive, 0 to MAX inclusive].
          // '[BigNumber Error] EXPONENTIAL_AT {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'EXPONENTIAL_AT')) {
            v = obj[p];
            if (v && v.pop) {
              intCheck(v[0], -MAX, 0, p);
              intCheck(v[1], 0, MAX, p);
              TO_EXP_NEG = v[0];
              TO_EXP_POS = v[1];
            } else {
              intCheck(v, -MAX, MAX, p);
              TO_EXP_NEG = -(TO_EXP_POS = v < 0 ? -v : v);
            }
          }

          // RANGE {number|number[]} Non-zero integer, -MAX to MAX inclusive or
          // [integer -MAX to -1 inclusive, integer 1 to MAX inclusive].
          // '[BigNumber Error] RANGE {not a primitive number|not an integer|out of range|cannot be zero}: {v}'
          if (obj.hasOwnProperty(p = 'RANGE')) {
            v = obj[p];
            if (v && v.pop) {
              intCheck(v[0], -MAX, -1, p);
              intCheck(v[1], 1, MAX, p);
              MIN_EXP = v[0];
              MAX_EXP = v[1];
            } else {
              intCheck(v, -MAX, MAX, p);
              if (v) {
                MIN_EXP = -(MAX_EXP = v < 0 ? -v : v);
              } else {
                throw Error
                 (bignumberError + p + ' cannot be zero: ' + v);
              }
            }
          }

          // CRYPTO {boolean} true or false.
          // '[BigNumber Error] CRYPTO not true or false: {v}'
          // '[BigNumber Error] crypto unavailable'
          if (obj.hasOwnProperty(p = 'CRYPTO')) {
            v = obj[p];
            if (v === !!v) {
              if (v) {
                if (typeof crypto != 'undefined' && crypto &&
                 (crypto.getRandomValues || crypto.randomBytes)) {
                  CRYPTO = v;
                } else {
                  CRYPTO = !v;
                  throw Error
                   (bignumberError + 'crypto unavailable');
                }
              } else {
                CRYPTO = v;
              }
            } else {
              throw Error
               (bignumberError + p + ' not true or false: ' + v);
            }
          }

          // MODULO_MODE {number} Integer, 0 to 9 inclusive.
          // '[BigNumber Error] MODULO_MODE {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'MODULO_MODE')) {
            v = obj[p];
            intCheck(v, 0, 9, p);
            MODULO_MODE = v;
          }

          // POW_PRECISION {number} Integer, 0 to MAX inclusive.
          // '[BigNumber Error] POW_PRECISION {not a primitive number|not an integer|out of range}: {v}'
          if (obj.hasOwnProperty(p = 'POW_PRECISION')) {
            v = obj[p];
            intCheck(v, 0, MAX, p);
            POW_PRECISION = v;
          }

          // FORMAT {object}
          // '[BigNumber Error] FORMAT not an object: {v}'
          if (obj.hasOwnProperty(p = 'FORMAT')) {
            v = obj[p];
            if (typeof v == 'object') FORMAT = v;
            else throw Error
             (bignumberError + p + ' not an object: ' + v);
          }

          // ALPHABET {string}
          // '[BigNumber Error] ALPHABET invalid: {v}'
          if (obj.hasOwnProperty(p = 'ALPHABET')) {
            v = obj[p];

            // Disallow if less than two characters,
            // or if it contains '+', '-', '.', whitespace, or a repeated character.
            if (typeof v == 'string' && !/^.?$|[+\-.\s]|(.).*\1/.test(v)) {
              ALPHABET = v;
            } else {
              throw Error
               (bignumberError + p + ' invalid: ' + v);
            }
          }

        } else {

          // '[BigNumber Error] Object expected: {v}'
          throw Error
           (bignumberError + 'Object expected: ' + obj);
        }
      }

      return {
        DECIMAL_PLACES: DECIMAL_PLACES,
        ROUNDING_MODE: ROUNDING_MODE,
        EXPONENTIAL_AT: [TO_EXP_NEG, TO_EXP_POS],
        RANGE: [MIN_EXP, MAX_EXP],
        CRYPTO: CRYPTO,
        MODULO_MODE: MODULO_MODE,
        POW_PRECISION: POW_PRECISION,
        FORMAT: FORMAT,
        ALPHABET: ALPHABET
      };
    };


    /*
     * Return true if v is a BigNumber instance, otherwise return false.
     *
     * If BigNumber.DEBUG is true, throw if a BigNumber instance is not well-formed.
     *
     * v {any}
     *
     * '[BigNumber Error] Invalid BigNumber: {v}'
     */
    BigNumber.isBigNumber = function (v) {
      if (!v || v._isBigNumber !== true) return false;
      if (!BigNumber.DEBUG) return true;

      var i, n,
        c = v.c,
        e = v.e,
        s = v.s;

      out: if ({}.toString.call(c) == '[object Array]') {

        if ((s === 1 || s === -1) && e >= -MAX && e <= MAX && e === mathfloor(e)) {

          // If the first element is zero, the BigNumber value must be zero.
          if (c[0] === 0) {
            if (e === 0 && c.length === 1) return true;
            break out;
          }

          // Calculate number of digits that c[0] should have, based on the exponent.
          i = (e + 1) % LOG_BASE;
          if (i < 1) i += LOG_BASE;

          // Calculate number of digits of c[0].
          //if (Math.ceil(Math.log(c[0] + 1) / Math.LN10) == i) {
          if (String(c[0]).length == i) {

            for (i = 0; i < c.length; i++) {
              n = c[i];
              if (n < 0 || n >= BASE || n !== mathfloor(n)) break out;
            }

            // Last element cannot be zero, unless it is the only element.
            if (n !== 0) return true;
          }
        }

      // Infinity/NaN
      } else if (c === null && e === null && (s === null || s === 1 || s === -1)) {
        return true;
      }

      throw Error
        (bignumberError + 'Invalid BigNumber: ' + v);
    };


    /*
     * Return a new BigNumber whose value is the maximum of the arguments.
     *
     * arguments {number|string|BigNumber}
     */
    BigNumber.maximum = BigNumber.max = function () {
      return maxOrMin(arguments, P.lt);
    };


    /*
     * Return a new BigNumber whose value is the minimum of the arguments.
     *
     * arguments {number|string|BigNumber}
     */
    BigNumber.minimum = BigNumber.min = function () {
      return maxOrMin(arguments, P.gt);
    };


    /*
     * Return a new BigNumber with a random value equal to or greater than 0 and less than 1,
     * and with dp, or DECIMAL_PLACES if dp is omitted, decimal places (or less if trailing
     * zeros are produced).
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp}'
     * '[BigNumber Error] crypto unavailable'
     */
    BigNumber.random = (function () {
      var pow2_53 = 0x20000000000000;

      // Return a 53 bit integer n, where 0 <= n < 9007199254740992.
      // Check if Math.random() produces more than 32 bits of randomness.
      // If it does, assume at least 53 bits are produced, otherwise assume at least 30 bits.
      // 0x40000000 is 2^30, 0x800000 is 2^23, 0x1fffff is 2^21 - 1.
      var random53bitInt = (Math.random() * pow2_53) & 0x1fffff
       ? function () { return mathfloor(Math.random() * pow2_53); }
       : function () { return ((Math.random() * 0x40000000 | 0) * 0x800000) +
         (Math.random() * 0x800000 | 0); };

      return function (dp) {
        var a, b, e, k, v,
          i = 0,
          c = [],
          rand = new BigNumber(ONE);

        if (dp == null) dp = DECIMAL_PLACES;
        else intCheck(dp, 0, MAX);

        k = mathceil(dp / LOG_BASE);

        if (CRYPTO) {

          // Browsers supporting crypto.getRandomValues.
          if (crypto.getRandomValues) {

            a = crypto.getRandomValues(new Uint32Array(k *= 2));

            for (; i < k;) {

              // 53 bits:
              // ((Math.pow(2, 32) - 1) * Math.pow(2, 21)).toString(2)
              // 11111 11111111 11111111 11111111 11100000 00000000 00000000
              // ((Math.pow(2, 32) - 1) >>> 11).toString(2)
              //                                     11111 11111111 11111111
              // 0x20000 is 2^21.
              v = a[i] * 0x20000 + (a[i + 1] >>> 11);

              // Rejection sampling:
              // 0 <= v < 9007199254740992
              // Probability that v >= 9e15, is
              // 7199254740992 / 9007199254740992 ~= 0.0008, i.e. 1 in 1251
              if (v >= 9e15) {
                b = crypto.getRandomValues(new Uint32Array(2));
                a[i] = b[0];
                a[i + 1] = b[1];
              } else {

                // 0 <= v <= 8999999999999999
                // 0 <= (v % 1e14) <= 99999999999999
                c.push(v % 1e14);
                i += 2;
              }
            }
            i = k / 2;

          // Node.js supporting crypto.randomBytes.
          } else if (crypto.randomBytes) {

            // buffer
            a = crypto.randomBytes(k *= 7);

            for (; i < k;) {

              // 0x1000000000000 is 2^48, 0x10000000000 is 2^40
              // 0x100000000 is 2^32, 0x1000000 is 2^24
              // 11111 11111111 11111111 11111111 11111111 11111111 11111111
              // 0 <= v < 9007199254740992
              v = ((a[i] & 31) * 0x1000000000000) + (a[i + 1] * 0x10000000000) +
                 (a[i + 2] * 0x100000000) + (a[i + 3] * 0x1000000) +
                 (a[i + 4] << 16) + (a[i + 5] << 8) + a[i + 6];

              if (v >= 9e15) {
                crypto.randomBytes(7).copy(a, i);
              } else {

                // 0 <= (v % 1e14) <= 99999999999999
                c.push(v % 1e14);
                i += 7;
              }
            }
            i = k / 7;
          } else {
            CRYPTO = false;
            throw Error
             (bignumberError + 'crypto unavailable');
          }
        }

        // Use Math.random.
        if (!CRYPTO) {

          for (; i < k;) {
            v = random53bitInt();
            if (v < 9e15) c[i++] = v % 1e14;
          }
        }

        k = c[--i];
        dp %= LOG_BASE;

        // Convert trailing digits to zeros according to dp.
        if (k && dp) {
          v = POWS_TEN[LOG_BASE - dp];
          c[i] = mathfloor(k / v) * v;
        }

        // Remove trailing elements which are zero.
        for (; c[i] === 0; c.pop(), i--);

        // Zero?
        if (i < 0) {
          c = [e = 0];
        } else {

          // Remove leading elements which are zero and adjust exponent accordingly.
          for (e = -1 ; c[0] === 0; c.splice(0, 1), e -= LOG_BASE);

          // Count the digits of the first element of c to determine leading zeros, and...
          for (i = 1, v = c[0]; v >= 10; v /= 10, i++);

          // adjust the exponent accordingly.
          if (i < LOG_BASE) e -= LOG_BASE - i;
        }

        rand.e = e;
        rand.c = c;
        return rand;
      };
    })();


    /*
     * Return a BigNumber whose value is the sum of the arguments.
     *
     * arguments {number|string|BigNumber}
     */
    BigNumber.sum = function () {
      var i = 1,
        args = arguments,
        sum = new BigNumber(args[0]);
      for (; i < args.length;) sum = sum.plus(args[i++]);
      return sum;
    };


    // PRIVATE FUNCTIONS


    // Called by BigNumber and BigNumber.prototype.toString.
    convertBase = (function () {
      var decimal = '0123456789';

      /*
       * Convert string of baseIn to an array of numbers of baseOut.
       * Eg. toBaseOut('255', 10, 16) returns [15, 15].
       * Eg. toBaseOut('ff', 16, 10) returns [2, 5, 5].
       */
      function toBaseOut(str, baseIn, baseOut, alphabet) {
        var j,
          arr = [0],
          arrL,
          i = 0,
          len = str.length;

        for (; i < len;) {
          for (arrL = arr.length; arrL--; arr[arrL] *= baseIn);

          arr[0] += alphabet.indexOf(str.charAt(i++));

          for (j = 0; j < arr.length; j++) {

            if (arr[j] > baseOut - 1) {
              if (arr[j + 1] == null) arr[j + 1] = 0;
              arr[j + 1] += arr[j] / baseOut | 0;
              arr[j] %= baseOut;
            }
          }
        }

        return arr.reverse();
      }

      // Convert a numeric string of baseIn to a numeric string of baseOut.
      // If the caller is toString, we are converting from base 10 to baseOut.
      // If the caller is BigNumber, we are converting from baseIn to base 10.
      return function (str, baseIn, baseOut, sign, callerIsToString) {
        var alphabet, d, e, k, r, x, xc, y,
          i = str.indexOf('.'),
          dp = DECIMAL_PLACES,
          rm = ROUNDING_MODE;

        // Non-integer.
        if (i >= 0) {
          k = POW_PRECISION;

          // Unlimited precision.
          POW_PRECISION = 0;
          str = str.replace('.', '');
          y = new BigNumber(baseIn);
          x = y.pow(str.length - i);
          POW_PRECISION = k;

          // Convert str as if an integer, then restore the fraction part by dividing the
          // result by its base raised to a power.

          y.c = toBaseOut(toFixedPoint(coeffToString(x.c), x.e, '0'),
           10, baseOut, decimal);
          y.e = y.c.length;
        }

        // Convert the number as integer.

        xc = toBaseOut(str, baseIn, baseOut, callerIsToString
         ? (alphabet = ALPHABET, decimal)
         : (alphabet = decimal, ALPHABET));

        // xc now represents str as an integer and converted to baseOut. e is the exponent.
        e = k = xc.length;

        // Remove trailing zeros.
        for (; xc[--k] == 0; xc.pop());

        // Zero?
        if (!xc[0]) return alphabet.charAt(0);

        // Does str represent an integer? If so, no need for the division.
        if (i < 0) {
          --e;
        } else {
          x.c = xc;
          x.e = e;

          // The sign is needed for correct rounding.
          x.s = sign;
          x = div(x, y, dp, rm, baseOut);
          xc = x.c;
          r = x.r;
          e = x.e;
        }

        // xc now represents str converted to baseOut.

        // THe index of the rounding digit.
        d = e + dp + 1;

        // The rounding digit: the digit to the right of the digit that may be rounded up.
        i = xc[d];

        // Look at the rounding digits and mode to determine whether to round up.

        k = baseOut / 2;
        r = r || d < 0 || xc[d + 1] != null;

        r = rm < 4 ? (i != null || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2))
              : i > k || i == k &&(rm == 4 || r || rm == 6 && xc[d - 1] & 1 ||
               rm == (x.s < 0 ? 8 : 7));

        // If the index of the rounding digit is not greater than zero, or xc represents
        // zero, then the result of the base conversion is zero or, if rounding up, a value
        // such as 0.00001.
        if (d < 1 || !xc[0]) {

          // 1^-dp or 0
          str = r ? toFixedPoint(alphabet.charAt(1), -dp, alphabet.charAt(0)) : alphabet.charAt(0);
        } else {

          // Truncate xc to the required number of decimal places.
          xc.length = d;

          // Round up?
          if (r) {

            // Rounding up may mean the previous digit has to be rounded up and so on.
            for (--baseOut; ++xc[--d] > baseOut;) {
              xc[d] = 0;

              if (!d) {
                ++e;
                xc = [1].concat(xc);
              }
            }
          }

          // Determine trailing zeros.
          for (k = xc.length; !xc[--k];);

          // E.g. [4, 11, 15] becomes 4bf.
          for (i = 0, str = ''; i <= k; str += alphabet.charAt(xc[i++]));

          // Add leading zeros, decimal point and trailing zeros as required.
          str = toFixedPoint(str, e, alphabet.charAt(0));
        }

        // The caller will add the sign.
        return str;
      };
    })();


    // Perform division in the specified base. Called by div and convertBase.
    div = (function () {

      // Assume non-zero x and k.
      function multiply(x, k, base) {
        var m, temp, xlo, xhi,
          carry = 0,
          i = x.length,
          klo = k % SQRT_BASE,
          khi = k / SQRT_BASE | 0;

        for (x = x.slice(); i--;) {
          xlo = x[i] % SQRT_BASE;
          xhi = x[i] / SQRT_BASE | 0;
          m = khi * xlo + xhi * klo;
          temp = klo * xlo + ((m % SQRT_BASE) * SQRT_BASE) + carry;
          carry = (temp / base | 0) + (m / SQRT_BASE | 0) + khi * xhi;
          x[i] = temp % base;
        }

        if (carry) x = [carry].concat(x);

        return x;
      }

      function compare(a, b, aL, bL) {
        var i, cmp;

        if (aL != bL) {
          cmp = aL > bL ? 1 : -1;
        } else {

          for (i = cmp = 0; i < aL; i++) {

            if (a[i] != b[i]) {
              cmp = a[i] > b[i] ? 1 : -1;
              break;
            }
          }
        }

        return cmp;
      }

      function subtract(a, b, aL, base) {
        var i = 0;

        // Subtract b from a.
        for (; aL--;) {
          a[aL] -= i;
          i = a[aL] < b[aL] ? 1 : 0;
          a[aL] = i * base + a[aL] - b[aL];
        }

        // Remove leading zeros.
        for (; !a[0] && a.length > 1; a.splice(0, 1));
      }

      // x: dividend, y: divisor.
      return function (x, y, dp, rm, base) {
        var cmp, e, i, more, n, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0,
          yL, yz,
          s = x.s == y.s ? 1 : -1,
          xc = x.c,
          yc = y.c;

        // Either NaN, Infinity or 0?
        if (!xc || !xc[0] || !yc || !yc[0]) {

          return new BigNumber(

           // Return NaN if either NaN, or both Infinity or 0.
           !x.s || !y.s || (xc ? yc && xc[0] == yc[0] : !yc) ? NaN :

            // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
            xc && xc[0] == 0 || !yc ? s * 0 : s / 0
         );
        }

        q = new BigNumber(s);
        qc = q.c = [];
        e = x.e - y.e;
        s = dp + e + 1;

        if (!base) {
          base = BASE;
          e = bitFloor(x.e / LOG_BASE) - bitFloor(y.e / LOG_BASE);
          s = s / LOG_BASE | 0;
        }

        // Result exponent may be one less then the current value of e.
        // The coefficients of the BigNumbers from convertBase may have trailing zeros.
        for (i = 0; yc[i] == (xc[i] || 0); i++);

        if (yc[i] > (xc[i] || 0)) e--;

        if (s < 0) {
          qc.push(1);
          more = true;
        } else {
          xL = xc.length;
          yL = yc.length;
          i = 0;
          s += 2;

          // Normalise xc and yc so highest order digit of yc is >= base / 2.

          n = mathfloor(base / (yc[0] + 1));

          // Not necessary, but to handle odd bases where yc[0] == (base / 2) - 1.
          // if (n > 1 || n++ == 1 && yc[0] < base / 2) {
          if (n > 1) {
            yc = multiply(yc, n, base);
            xc = multiply(xc, n, base);
            yL = yc.length;
            xL = xc.length;
          }

          xi = yL;
          rem = xc.slice(0, yL);
          remL = rem.length;

          // Add zeros to make remainder as long as divisor.
          for (; remL < yL; rem[remL++] = 0);
          yz = yc.slice();
          yz = [0].concat(yz);
          yc0 = yc[0];
          if (yc[1] >= base / 2) yc0++;
          // Not necessary, but to prevent trial digit n > base, when using base 3.
          // else if (base == 3 && yc0 == 1) yc0 = 1 + 1e-15;

          do {
            n = 0;

            // Compare divisor and remainder.
            cmp = compare(yc, rem, yL, remL);

            // If divisor < remainder.
            if (cmp < 0) {

              // Calculate trial digit, n.

              rem0 = rem[0];
              if (yL != remL) rem0 = rem0 * base + (rem[1] || 0);

              // n is how many times the divisor goes into the current remainder.
              n = mathfloor(rem0 / yc0);

              //  Algorithm:
              //  product = divisor multiplied by trial digit (n).
              //  Compare product and remainder.
              //  If product is greater than remainder:
              //    Subtract divisor from product, decrement trial digit.
              //  Subtract product from remainder.
              //  If product was less than remainder at the last compare:
              //    Compare new remainder and divisor.
              //    If remainder is greater than divisor:
              //      Subtract divisor from remainder, increment trial digit.

              if (n > 1) {

                // n may be > base only when base is 3.
                if (n >= base) n = base - 1;

                // product = divisor * trial digit.
                prod = multiply(yc, n, base);
                prodL = prod.length;
                remL = rem.length;

                // Compare product and remainder.
                // If product > remainder then trial digit n too high.
                // n is 1 too high about 5% of the time, and is not known to have
                // ever been more than 1 too high.
                while (compare(prod, rem, prodL, remL) == 1) {
                  n--;

                  // Subtract divisor from product.
                  subtract(prod, yL < prodL ? yz : yc, prodL, base);
                  prodL = prod.length;
                  cmp = 1;
                }
              } else {

                // n is 0 or 1, cmp is -1.
                // If n is 0, there is no need to compare yc and rem again below,
                // so change cmp to 1 to avoid it.
                // If n is 1, leave cmp as -1, so yc and rem are compared again.
                if (n == 0) {

                  // divisor < remainder, so n must be at least 1.
                  cmp = n = 1;
                }

                // product = divisor
                prod = yc.slice();
                prodL = prod.length;
              }

              if (prodL < remL) prod = [0].concat(prod);

              // Subtract product from remainder.
              subtract(rem, prod, remL, base);
              remL = rem.length;

               // If product was < remainder.
              if (cmp == -1) {

                // Compare divisor and new remainder.
                // If divisor < new remainder, subtract divisor from remainder.
                // Trial digit n too low.
                // n is 1 too low about 5% of the time, and very rarely 2 too low.
                while (compare(yc, rem, yL, remL) < 1) {
                  n++;

                  // Subtract divisor from remainder.
                  subtract(rem, yL < remL ? yz : yc, remL, base);
                  remL = rem.length;
                }
              }
            } else if (cmp === 0) {
              n++;
              rem = [0];
            } // else cmp === 1 and n will be 0

            // Add the next digit, n, to the result array.
            qc[i++] = n;

            // Update the remainder.
            if (rem[0]) {
              rem[remL++] = xc[xi] || 0;
            } else {
              rem = [xc[xi]];
              remL = 1;
            }
          } while ((xi++ < xL || rem[0] != null) && s--);

          more = rem[0] != null;

          // Leading zero?
          if (!qc[0]) qc.splice(0, 1);
        }

        if (base == BASE) {

          // To calculate q.e, first get the number of digits of qc[0].
          for (i = 1, s = qc[0]; s >= 10; s /= 10, i++);

          round(q, dp + (q.e = i + e * LOG_BASE - 1) + 1, rm, more);

        // Caller is convertBase.
        } else {
          q.e = e;
          q.r = +more;
        }

        return q;
      };
    })();


    /*
     * Return a string representing the value of BigNumber n in fixed-point or exponential
     * notation rounded to the specified decimal places or significant digits.
     *
     * n: a BigNumber.
     * i: the index of the last digit required (i.e. the digit that may be rounded up).
     * rm: the rounding mode.
     * id: 1 (toExponential) or 2 (toPrecision).
     */
    function format(n, i, rm, id) {
      var c0, e, ne, len, str;

      if (rm == null) rm = ROUNDING_MODE;
      else intCheck(rm, 0, 8);

      if (!n.c) return n.toString();

      c0 = n.c[0];
      ne = n.e;

      if (i == null) {
        str = coeffToString(n.c);
        str = id == 1 || id == 2 && (ne <= TO_EXP_NEG || ne >= TO_EXP_POS)
         ? toExponential(str, ne)
         : toFixedPoint(str, ne, '0');
      } else {
        n = round(new BigNumber(n), i, rm);

        // n.e may have changed if the value was rounded up.
        e = n.e;

        str = coeffToString(n.c);
        len = str.length;

        // toPrecision returns exponential notation if the number of significant digits
        // specified is less than the number of digits necessary to represent the integer
        // part of the value in fixed-point notation.

        // Exponential notation.
        if (id == 1 || id == 2 && (i <= e || e <= TO_EXP_NEG)) {

          // Append zeros?
          for (; len < i; str += '0', len++);
          str = toExponential(str, e);

        // Fixed-point notation.
        } else {
          i -= ne;
          str = toFixedPoint(str, e, '0');

          // Append zeros?
          if (e + 1 > len) {
            if (--i > 0) for (str += '.'; i--; str += '0');
          } else {
            i += e - len;
            if (i > 0) {
              if (e + 1 == len) str += '.';
              for (; i--; str += '0');
            }
          }
        }
      }

      return n.s < 0 && c0 ? '-' + str : str;
    }


    // Handle BigNumber.max and BigNumber.min.
    function maxOrMin(args, method) {
      var n,
        i = 1,
        m = new BigNumber(args[0]);

      for (; i < args.length; i++) {
        n = new BigNumber(args[i]);

        // If any number is NaN, return NaN.
        if (!n.s) {
          m = n;
          break;
        } else if (method.call(m, n)) {
          m = n;
        }
      }

      return m;
    }


    /*
     * Strip trailing zeros, calculate base 10 exponent and check against MIN_EXP and MAX_EXP.
     * Called by minus, plus and times.
     */
    function normalise(n, c, e) {
      var i = 1,
        j = c.length;

       // Remove trailing zeros.
      for (; !c[--j]; c.pop());

      // Calculate the base 10 exponent. First get the number of digits of c[0].
      for (j = c[0]; j >= 10; j /= 10, i++);

      // Overflow?
      if ((e = i + e * LOG_BASE - 1) > MAX_EXP) {

        // Infinity.
        n.c = n.e = null;

      // Underflow?
      } else if (e < MIN_EXP) {

        // Zero.
        n.c = [n.e = 0];
      } else {
        n.e = e;
        n.c = c;
      }

      return n;
    }


    // Handle values that fail the validity test in BigNumber.
    parseNumeric = (function () {
      var basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i,
        dotAfter = /^([^.]+)\.$/,
        dotBefore = /^\.([^.]+)$/,
        isInfinityOrNaN = /^-?(Infinity|NaN)$/,
        whitespaceOrPlus = /^\s*\+(?=[\w.])|^\s+|\s+$/g;

      return function (x, str, isNum, b) {
        var base,
          s = isNum ? str : str.replace(whitespaceOrPlus, '');

        // No exception on ±Infinity or NaN.
        if (isInfinityOrNaN.test(s)) {
          x.s = isNaN(s) ? null : s < 0 ? -1 : 1;
        } else {
          if (!isNum) {

            // basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i
            s = s.replace(basePrefix, function (m, p1, p2) {
              base = (p2 = p2.toLowerCase()) == 'x' ? 16 : p2 == 'b' ? 2 : 8;
              return !b || b == base ? p1 : m;
            });

            if (b) {
              base = b;

              // E.g. '1.' to '1', '.1' to '0.1'
              s = s.replace(dotAfter, '$1').replace(dotBefore, '0.$1');
            }

            if (str != s) return new BigNumber(s, base);
          }

          // '[BigNumber Error] Not a number: {n}'
          // '[BigNumber Error] Not a base {b} number: {n}'
          if (BigNumber.DEBUG) {
            throw Error
              (bignumberError + 'Not a' + (b ? ' base ' + b : '') + ' number: ' + str);
          }

          // NaN
          x.s = null;
        }

        x.c = x.e = null;
      }
    })();


    /*
     * Round x to sd significant digits using rounding mode rm. Check for over/under-flow.
     * If r is truthy, it is known that there are more digits after the rounding digit.
     */
    function round(x, sd, rm, r) {
      var d, i, j, k, n, ni, rd,
        xc = x.c,
        pows10 = POWS_TEN;

      // if x is not Infinity or NaN...
      if (xc) {

        // rd is the rounding digit, i.e. the digit after the digit that may be rounded up.
        // n is a base 1e14 number, the value of the element of array x.c containing rd.
        // ni is the index of n within x.c.
        // d is the number of digits of n.
        // i is the index of rd within n including leading zeros.
        // j is the actual index of rd within n (if < 0, rd is a leading zero).
        out: {

          // Get the number of digits of the first element of xc.
          for (d = 1, k = xc[0]; k >= 10; k /= 10, d++);
          i = sd - d;

          // If the rounding digit is in the first element of xc...
          if (i < 0) {
            i += LOG_BASE;
            j = sd;
            n = xc[ni = 0];

            // Get the rounding digit at index j of n.
            rd = n / pows10[d - j - 1] % 10 | 0;
          } else {
            ni = mathceil((i + 1) / LOG_BASE);

            if (ni >= xc.length) {

              if (r) {

                // Needed by sqrt.
                for (; xc.length <= ni; xc.push(0));
                n = rd = 0;
                d = 1;
                i %= LOG_BASE;
                j = i - LOG_BASE + 1;
              } else {
                break out;
              }
            } else {
              n = k = xc[ni];

              // Get the number of digits of n.
              for (d = 1; k >= 10; k /= 10, d++);

              // Get the index of rd within n.
              i %= LOG_BASE;

              // Get the index of rd within n, adjusted for leading zeros.
              // The number of leading zeros of n is given by LOG_BASE - d.
              j = i - LOG_BASE + d;

              // Get the rounding digit at index j of n.
              rd = j < 0 ? 0 : n / pows10[d - j - 1] % 10 | 0;
            }
          }

          r = r || sd < 0 ||

          // Are there any non-zero digits after the rounding digit?
          // The expression  n % pows10[d - j - 1]  returns all digits of n to the right
          // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
           xc[ni + 1] != null || (j < 0 ? n : n % pows10[d - j - 1]);

          r = rm < 4
           ? (rd || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2))
           : rd > 5 || rd == 5 && (rm == 4 || r || rm == 6 &&

            // Check whether the digit to the left of the rounding digit is odd.
            ((i > 0 ? j > 0 ? n / pows10[d - j] : 0 : xc[ni - 1]) % 10) & 1 ||
             rm == (x.s < 0 ? 8 : 7));

          if (sd < 1 || !xc[0]) {
            xc.length = 0;

            if (r) {

              // Convert sd to decimal places.
              sd -= x.e + 1;

              // 1, 0.1, 0.01, 0.001, 0.0001 etc.
              xc[0] = pows10[(LOG_BASE - sd % LOG_BASE) % LOG_BASE];
              x.e = -sd || 0;
            } else {

              // Zero.
              xc[0] = x.e = 0;
            }

            return x;
          }

          // Remove excess digits.
          if (i == 0) {
            xc.length = ni;
            k = 1;
            ni--;
          } else {
            xc.length = ni + 1;
            k = pows10[LOG_BASE - i];

            // E.g. 56700 becomes 56000 if 7 is the rounding digit.
            // j > 0 means i > number of leading zeros of n.
            xc[ni] = j > 0 ? mathfloor(n / pows10[d - j] % pows10[j]) * k : 0;
          }

          // Round up?
          if (r) {

            for (; ;) {

              // If the digit to be rounded up is in the first element of xc...
              if (ni == 0) {

                // i will be the length of xc[0] before k is added.
                for (i = 1, j = xc[0]; j >= 10; j /= 10, i++);
                j = xc[0] += k;
                for (k = 1; j >= 10; j /= 10, k++);

                // if i != k the length has increased.
                if (i != k) {
                  x.e++;
                  if (xc[0] == BASE) xc[0] = 1;
                }

                break;
              } else {
                xc[ni] += k;
                if (xc[ni] != BASE) break;
                xc[ni--] = 0;
                k = 1;
              }
            }
          }

          // Remove trailing zeros.
          for (i = xc.length; xc[--i] === 0; xc.pop());
        }

        // Overflow? Infinity.
        if (x.e > MAX_EXP) {
          x.c = x.e = null;

        // Underflow? Zero.
        } else if (x.e < MIN_EXP) {
          x.c = [x.e = 0];
        }
      }

      return x;
    }


    function valueOf(n) {
      var str,
        e = n.e;

      if (e === null) return n.toString();

      str = coeffToString(n.c);

      str = e <= TO_EXP_NEG || e >= TO_EXP_POS
        ? toExponential(str, e)
        : toFixedPoint(str, e, '0');

      return n.s < 0 ? '-' + str : str;
    }


    // PROTOTYPE/INSTANCE METHODS


    /*
     * Return a new BigNumber whose value is the absolute value of this BigNumber.
     */
    P.absoluteValue = P.abs = function () {
      var x = new BigNumber(this);
      if (x.s < 0) x.s = 1;
      return x;
    };


    /*
     * Return
     *   1 if the value of this BigNumber is greater than the value of BigNumber(y, b),
     *   -1 if the value of this BigNumber is less than the value of BigNumber(y, b),
     *   0 if they have the same value,
     *   or null if the value of either is NaN.
     */
    P.comparedTo = function (y, b) {
      return compare(this, new BigNumber(y, b));
    };


    /*
     * If dp is undefined or null or true or false, return the number of decimal places of the
     * value of this BigNumber, or null if the value of this BigNumber is ±Infinity or NaN.
     *
     * Otherwise, if dp is a number, return a new BigNumber whose value is the value of this
     * BigNumber rounded to a maximum of dp decimal places using rounding mode rm, or
     * ROUNDING_MODE if rm is omitted.
     *
     * [dp] {number} Decimal places: integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     */
    P.decimalPlaces = P.dp = function (dp, rm) {
      var c, n, v,
        x = this;

      if (dp != null) {
        intCheck(dp, 0, MAX);
        if (rm == null) rm = ROUNDING_MODE;
        else intCheck(rm, 0, 8);

        return round(new BigNumber(x), dp + x.e + 1, rm);
      }

      if (!(c = x.c)) return null;
      n = ((v = c.length - 1) - bitFloor(this.e / LOG_BASE)) * LOG_BASE;

      // Subtract the number of trailing zeros of the last number.
      if (v = c[v]) for (; v % 10 == 0; v /= 10, n--);
      if (n < 0) n = 0;

      return n;
    };


    /*
     *  n / 0 = I
     *  n / N = N
     *  n / I = 0
     *  0 / n = 0
     *  0 / 0 = N
     *  0 / N = N
     *  0 / I = 0
     *  N / n = N
     *  N / 0 = N
     *  N / N = N
     *  N / I = N
     *  I / n = I
     *  I / 0 = I
     *  I / N = N
     *  I / I = N
     *
     * Return a new BigNumber whose value is the value of this BigNumber divided by the value of
     * BigNumber(y, b), rounded according to DECIMAL_PLACES and ROUNDING_MODE.
     */
    P.dividedBy = P.div = function (y, b) {
      return div(this, new BigNumber(y, b), DECIMAL_PLACES, ROUNDING_MODE);
    };


    /*
     * Return a new BigNumber whose value is the integer part of dividing the value of this
     * BigNumber by the value of BigNumber(y, b).
     */
    P.dividedToIntegerBy = P.idiv = function (y, b) {
      return div(this, new BigNumber(y, b), 0, 1);
    };


    /*
     * Return a BigNumber whose value is the value of this BigNumber exponentiated by n.
     *
     * If m is present, return the result modulo m.
     * If n is negative round according to DECIMAL_PLACES and ROUNDING_MODE.
     * If POW_PRECISION is non-zero and m is not present, round to POW_PRECISION using ROUNDING_MODE.
     *
     * The modular power operation works efficiently when x, n, and m are integers, otherwise it
     * is equivalent to calculating x.exponentiatedBy(n).modulo(m) with a POW_PRECISION of 0.
     *
     * n {number|string|BigNumber} The exponent. An integer.
     * [m] {number|string|BigNumber} The modulus.
     *
     * '[BigNumber Error] Exponent not an integer: {n}'
     */
    P.exponentiatedBy = P.pow = function (n, m) {
      var half, isModExp, i, k, more, nIsBig, nIsNeg, nIsOdd, y,
        x = this;

      n = new BigNumber(n);

      // Allow NaN and ±Infinity, but not other non-integers.
      if (n.c && !n.isInteger()) {
        throw Error
          (bignumberError + 'Exponent not an integer: ' + valueOf(n));
      }

      if (m != null) m = new BigNumber(m);

      // Exponent of MAX_SAFE_INTEGER is 15.
      nIsBig = n.e > 14;

      // If x is NaN, ±Infinity, ±0 or ±1, or n is ±Infinity, NaN or ±0.
      if (!x.c || !x.c[0] || x.c[0] == 1 && !x.e && x.c.length == 1 || !n.c || !n.c[0]) {

        // The sign of the result of pow when x is negative depends on the evenness of n.
        // If +n overflows to ±Infinity, the evenness of n would be not be known.
        y = new BigNumber(Math.pow(+valueOf(x), nIsBig ? 2 - isOdd(n) : +valueOf(n)));
        return m ? y.mod(m) : y;
      }

      nIsNeg = n.s < 0;

      if (m) {

        // x % m returns NaN if abs(m) is zero, or m is NaN.
        if (m.c ? !m.c[0] : !m.s) return new BigNumber(NaN);

        isModExp = !nIsNeg && x.isInteger() && m.isInteger();

        if (isModExp) x = x.mod(m);

      // Overflow to ±Infinity: >=2**1e10 or >=1.0000024**1e15.
      // Underflow to ±0: <=0.79**1e10 or <=0.9999975**1e15.
      } else if (n.e > 9 && (x.e > 0 || x.e < -1 || (x.e == 0
        // [1, 240000000]
        ? x.c[0] > 1 || nIsBig && x.c[1] >= 24e7
        // [80000000000000]  [99999750000000]
        : x.c[0] < 8e13 || nIsBig && x.c[0] <= 9999975e7))) {

        // If x is negative and n is odd, k = -0, else k = 0.
        k = x.s < 0 && isOdd(n) ? -0 : 0;

        // If x >= 1, k = ±Infinity.
        if (x.e > -1) k = 1 / k;

        // If n is negative return ±0, else return ±Infinity.
        return new BigNumber(nIsNeg ? 1 / k : k);

      } else if (POW_PRECISION) {

        // Truncating each coefficient array to a length of k after each multiplication
        // equates to truncating significant digits to POW_PRECISION + [28, 41],
        // i.e. there will be a minimum of 28 guard digits retained.
        k = mathceil(POW_PRECISION / LOG_BASE + 2);
      }

      if (nIsBig) {
        half = new BigNumber(0.5);
        if (nIsNeg) n.s = 1;
        nIsOdd = isOdd(n);
      } else {
        i = Math.abs(+valueOf(n));
        nIsOdd = i % 2;
      }

      y = new BigNumber(ONE);

      // Performs 54 loop iterations for n of 9007199254740991.
      for (; ;) {

        if (nIsOdd) {
          y = y.times(x);
          if (!y.c) break;

          if (k) {
            if (y.c.length > k) y.c.length = k;
          } else if (isModExp) {
            y = y.mod(m);    //y = y.minus(div(y, m, 0, MODULO_MODE).times(m));
          }
        }

        if (i) {
          i = mathfloor(i / 2);
          if (i === 0) break;
          nIsOdd = i % 2;
        } else {
          n = n.times(half);
          round(n, n.e + 1, 1);

          if (n.e > 14) {
            nIsOdd = isOdd(n);
          } else {
            i = +valueOf(n);
            if (i === 0) break;
            nIsOdd = i % 2;
          }
        }

        x = x.times(x);

        if (k) {
          if (x.c && x.c.length > k) x.c.length = k;
        } else if (isModExp) {
          x = x.mod(m);    //x = x.minus(div(x, m, 0, MODULO_MODE).times(m));
        }
      }

      if (isModExp) return y;
      if (nIsNeg) y = ONE.div(y);

      return m ? y.mod(m) : k ? round(y, POW_PRECISION, ROUNDING_MODE, more) : y;
    };


    /*
     * Return a new BigNumber whose value is the value of this BigNumber rounded to an integer
     * using rounding mode rm, or ROUNDING_MODE if rm is omitted.
     *
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {rm}'
     */
    P.integerValue = function (rm) {
      var n = new BigNumber(this);
      if (rm == null) rm = ROUNDING_MODE;
      else intCheck(rm, 0, 8);
      return round(n, n.e + 1, rm);
    };


    /*
     * Return true if the value of this BigNumber is equal to the value of BigNumber(y, b),
     * otherwise return false.
     */
    P.isEqualTo = P.eq = function (y, b) {
      return compare(this, new BigNumber(y, b)) === 0;
    };


    /*
     * Return true if the value of this BigNumber is a finite number, otherwise return false.
     */
    P.isFinite = function () {
      return !!this.c;
    };


    /*
     * Return true if the value of this BigNumber is greater than the value of BigNumber(y, b),
     * otherwise return false.
     */
    P.isGreaterThan = P.gt = function (y, b) {
      return compare(this, new BigNumber(y, b)) > 0;
    };


    /*
     * Return true if the value of this BigNumber is greater than or equal to the value of
     * BigNumber(y, b), otherwise return false.
     */
    P.isGreaterThanOrEqualTo = P.gte = function (y, b) {
      return (b = compare(this, new BigNumber(y, b))) === 1 || b === 0;

    };


    /*
     * Return true if the value of this BigNumber is an integer, otherwise return false.
     */
    P.isInteger = function () {
      return !!this.c && bitFloor(this.e / LOG_BASE) > this.c.length - 2;
    };


    /*
     * Return true if the value of this BigNumber is less than the value of BigNumber(y, b),
     * otherwise return false.
     */
    P.isLessThan = P.lt = function (y, b) {
      return compare(this, new BigNumber(y, b)) < 0;
    };


    /*
     * Return true if the value of this BigNumber is less than or equal to the value of
     * BigNumber(y, b), otherwise return false.
     */
    P.isLessThanOrEqualTo = P.lte = function (y, b) {
      return (b = compare(this, new BigNumber(y, b))) === -1 || b === 0;
    };


    /*
     * Return true if the value of this BigNumber is NaN, otherwise return false.
     */
    P.isNaN = function () {
      return !this.s;
    };


    /*
     * Return true if the value of this BigNumber is negative, otherwise return false.
     */
    P.isNegative = function () {
      return this.s < 0;
    };


    /*
     * Return true if the value of this BigNumber is positive, otherwise return false.
     */
    P.isPositive = function () {
      return this.s > 0;
    };


    /*
     * Return true if the value of this BigNumber is 0 or -0, otherwise return false.
     */
    P.isZero = function () {
      return !!this.c && this.c[0] == 0;
    };


    /*
     *  n - 0 = n
     *  n - N = N
     *  n - I = -I
     *  0 - n = -n
     *  0 - 0 = 0
     *  0 - N = N
     *  0 - I = -I
     *  N - n = N
     *  N - 0 = N
     *  N - N = N
     *  N - I = N
     *  I - n = I
     *  I - 0 = I
     *  I - N = N
     *  I - I = N
     *
     * Return a new BigNumber whose value is the value of this BigNumber minus the value of
     * BigNumber(y, b).
     */
    P.minus = function (y, b) {
      var i, j, t, xLTy,
        x = this,
        a = x.s;

      y = new BigNumber(y, b);
      b = y.s;

      // Either NaN?
      if (!a || !b) return new BigNumber(NaN);

      // Signs differ?
      if (a != b) {
        y.s = -b;
        return x.plus(y);
      }

      var xe = x.e / LOG_BASE,
        ye = y.e / LOG_BASE,
        xc = x.c,
        yc = y.c;

      if (!xe || !ye) {

        // Either Infinity?
        if (!xc || !yc) return xc ? (y.s = -b, y) : new BigNumber(yc ? x : NaN);

        // Either zero?
        if (!xc[0] || !yc[0]) {

          // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
          return yc[0] ? (y.s = -b, y) : new BigNumber(xc[0] ? x :

           // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
           ROUNDING_MODE == 3 ? -0 : 0);
        }
      }

      xe = bitFloor(xe);
      ye = bitFloor(ye);
      xc = xc.slice();

      // Determine which is the bigger number.
      if (a = xe - ye) {

        if (xLTy = a < 0) {
          a = -a;
          t = xc;
        } else {
          ye = xe;
          t = yc;
        }

        t.reverse();

        // Prepend zeros to equalise exponents.
        for (b = a; b--; t.push(0));
        t.reverse();
      } else {

        // Exponents equal. Check digit by digit.
        j = (xLTy = (a = xc.length) < (b = yc.length)) ? a : b;

        for (a = b = 0; b < j; b++) {

          if (xc[b] != yc[b]) {
            xLTy = xc[b] < yc[b];
            break;
          }
        }
      }

      // x < y? Point xc to the array of the bigger number.
      if (xLTy) t = xc, xc = yc, yc = t, y.s = -y.s;

      b = (j = yc.length) - (i = xc.length);

      // Append zeros to xc if shorter.
      // No need to add zeros to yc if shorter as subtract only needs to start at yc.length.
      if (b > 0) for (; b--; xc[i++] = 0);
      b = BASE - 1;

      // Subtract yc from xc.
      for (; j > a;) {

        if (xc[--j] < yc[j]) {
          for (i = j; i && !xc[--i]; xc[i] = b);
          --xc[i];
          xc[j] += BASE;
        }

        xc[j] -= yc[j];
      }

      // Remove leading zeros and adjust exponent accordingly.
      for (; xc[0] == 0; xc.splice(0, 1), --ye);

      // Zero?
      if (!xc[0]) {

        // Following IEEE 754 (2008) 6.3,
        // n - n = +0  but  n - n = -0  when rounding towards -Infinity.
        y.s = ROUNDING_MODE == 3 ? -1 : 1;
        y.c = [y.e = 0];
        return y;
      }

      // No need to check for Infinity as +x - +y != Infinity && -x - -y != Infinity
      // for finite x and y.
      return normalise(y, xc, ye);
    };


    /*
     *   n % 0 =  N
     *   n % N =  N
     *   n % I =  n
     *   0 % n =  0
     *  -0 % n = -0
     *   0 % 0 =  N
     *   0 % N =  N
     *   0 % I =  0
     *   N % n =  N
     *   N % 0 =  N
     *   N % N =  N
     *   N % I =  N
     *   I % n =  N
     *   I % 0 =  N
     *   I % N =  N
     *   I % I =  N
     *
     * Return a new BigNumber whose value is the value of this BigNumber modulo the value of
     * BigNumber(y, b). The result depends on the value of MODULO_MODE.
     */
    P.modulo = P.mod = function (y, b) {
      var q, s,
        x = this;

      y = new BigNumber(y, b);

      // Return NaN if x is Infinity or NaN, or y is NaN or zero.
      if (!x.c || !y.s || y.c && !y.c[0]) {
        return new BigNumber(NaN);

      // Return x if y is Infinity or x is zero.
      } else if (!y.c || x.c && !x.c[0]) {
        return new BigNumber(x);
      }

      if (MODULO_MODE == 9) {

        // Euclidian division: q = sign(y) * floor(x / abs(y))
        // r = x - qy    where  0 <= r < abs(y)
        s = y.s;
        y.s = 1;
        q = div(x, y, 0, 3);
        y.s = s;
        q.s *= s;
      } else {
        q = div(x, y, 0, MODULO_MODE);
      }

      y = x.minus(q.times(y));

      // To match JavaScript %, ensure sign of zero is sign of dividend.
      if (!y.c[0] && MODULO_MODE == 1) y.s = x.s;

      return y;
    };


    /*
     *  n * 0 = 0
     *  n * N = N
     *  n * I = I
     *  0 * n = 0
     *  0 * 0 = 0
     *  0 * N = N
     *  0 * I = N
     *  N * n = N
     *  N * 0 = N
     *  N * N = N
     *  N * I = N
     *  I * n = I
     *  I * 0 = N
     *  I * N = N
     *  I * I = I
     *
     * Return a new BigNumber whose value is the value of this BigNumber multiplied by the value
     * of BigNumber(y, b).
     */
    P.multipliedBy = P.times = function (y, b) {
      var c, e, i, j, k, m, xcL, xlo, xhi, ycL, ylo, yhi, zc,
        base, sqrtBase,
        x = this,
        xc = x.c,
        yc = (y = new BigNumber(y, b)).c;

      // Either NaN, ±Infinity or ±0?
      if (!xc || !yc || !xc[0] || !yc[0]) {

        // Return NaN if either is NaN, or one is 0 and the other is Infinity.
        if (!x.s || !y.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc) {
          y.c = y.e = y.s = null;
        } else {
          y.s *= x.s;

          // Return ±Infinity if either is ±Infinity.
          if (!xc || !yc) {
            y.c = y.e = null;

          // Return ±0 if either is ±0.
          } else {
            y.c = [0];
            y.e = 0;
          }
        }

        return y;
      }

      e = bitFloor(x.e / LOG_BASE) + bitFloor(y.e / LOG_BASE);
      y.s *= x.s;
      xcL = xc.length;
      ycL = yc.length;

      // Ensure xc points to longer array and xcL to its length.
      if (xcL < ycL) zc = xc, xc = yc, yc = zc, i = xcL, xcL = ycL, ycL = i;

      // Initialise the result array with zeros.
      for (i = xcL + ycL, zc = []; i--; zc.push(0));

      base = BASE;
      sqrtBase = SQRT_BASE;

      for (i = ycL; --i >= 0;) {
        c = 0;
        ylo = yc[i] % sqrtBase;
        yhi = yc[i] / sqrtBase | 0;

        for (k = xcL, j = i + k; j > i;) {
          xlo = xc[--k] % sqrtBase;
          xhi = xc[k] / sqrtBase | 0;
          m = yhi * xlo + xhi * ylo;
          xlo = ylo * xlo + ((m % sqrtBase) * sqrtBase) + zc[j] + c;
          c = (xlo / base | 0) + (m / sqrtBase | 0) + yhi * xhi;
          zc[j--] = xlo % base;
        }

        zc[j] = c;
      }

      if (c) {
        ++e;
      } else {
        zc.splice(0, 1);
      }

      return normalise(y, zc, e);
    };


    /*
     * Return a new BigNumber whose value is the value of this BigNumber negated,
     * i.e. multiplied by -1.
     */
    P.negated = function () {
      var x = new BigNumber(this);
      x.s = -x.s || null;
      return x;
    };


    /*
     *  n + 0 = n
     *  n + N = N
     *  n + I = I
     *  0 + n = n
     *  0 + 0 = 0
     *  0 + N = N
     *  0 + I = I
     *  N + n = N
     *  N + 0 = N
     *  N + N = N
     *  N + I = N
     *  I + n = I
     *  I + 0 = I
     *  I + N = N
     *  I + I = I
     *
     * Return a new BigNumber whose value is the value of this BigNumber plus the value of
     * BigNumber(y, b).
     */
    P.plus = function (y, b) {
      var t,
        x = this,
        a = x.s;

      y = new BigNumber(y, b);
      b = y.s;

      // Either NaN?
      if (!a || !b) return new BigNumber(NaN);

      // Signs differ?
       if (a != b) {
        y.s = -b;
        return x.minus(y);
      }

      var xe = x.e / LOG_BASE,
        ye = y.e / LOG_BASE,
        xc = x.c,
        yc = y.c;

      if (!xe || !ye) {

        // Return ±Infinity if either ±Infinity.
        if (!xc || !yc) return new BigNumber(a / 0);

        // Either zero?
        // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
        if (!xc[0] || !yc[0]) return yc[0] ? y : new BigNumber(xc[0] ? x : a * 0);
      }

      xe = bitFloor(xe);
      ye = bitFloor(ye);
      xc = xc.slice();

      // Prepend zeros to equalise exponents. Faster to use reverse then do unshifts.
      if (a = xe - ye) {
        if (a > 0) {
          ye = xe;
          t = yc;
        } else {
          a = -a;
          t = xc;
        }

        t.reverse();
        for (; a--; t.push(0));
        t.reverse();
      }

      a = xc.length;
      b = yc.length;

      // Point xc to the longer array, and b to the shorter length.
      if (a - b < 0) t = yc, yc = xc, xc = t, b = a;

      // Only start adding at yc.length - 1 as the further digits of xc can be ignored.
      for (a = 0; b;) {
        a = (xc[--b] = xc[b] + yc[b] + a) / BASE | 0;
        xc[b] = BASE === xc[b] ? 0 : xc[b] % BASE;
      }

      if (a) {
        xc = [a].concat(xc);
        ++ye;
      }

      // No need to check for zero, as +x + +y != 0 && -x + -y != 0
      // ye = MAX_EXP + 1 possible
      return normalise(y, xc, ye);
    };


    /*
     * If sd is undefined or null or true or false, return the number of significant digits of
     * the value of this BigNumber, or null if the value of this BigNumber is ±Infinity or NaN.
     * If sd is true include integer-part trailing zeros in the count.
     *
     * Otherwise, if sd is a number, return a new BigNumber whose value is the value of this
     * BigNumber rounded to a maximum of sd significant digits using rounding mode rm, or
     * ROUNDING_MODE if rm is omitted.
     *
     * sd {number|boolean} number: significant digits: integer, 1 to MAX inclusive.
     *                     boolean: whether to count integer-part trailing zeros: true or false.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {sd|rm}'
     */
    P.precision = P.sd = function (sd, rm) {
      var c, n, v,
        x = this;

      if (sd != null && sd !== !!sd) {
        intCheck(sd, 1, MAX);
        if (rm == null) rm = ROUNDING_MODE;
        else intCheck(rm, 0, 8);

        return round(new BigNumber(x), sd, rm);
      }

      if (!(c = x.c)) return null;
      v = c.length - 1;
      n = v * LOG_BASE + 1;

      if (v = c[v]) {

        // Subtract the number of trailing zeros of the last element.
        for (; v % 10 == 0; v /= 10, n--);

        // Add the number of digits of the first element.
        for (v = c[0]; v >= 10; v /= 10, n++);
      }

      if (sd && x.e + 1 > n) n = x.e + 1;

      return n;
    };


    /*
     * Return a new BigNumber whose value is the value of this BigNumber shifted by k places
     * (powers of 10). Shift to the right if n > 0, and to the left if n < 0.
     *
     * k {number} Integer, -MAX_SAFE_INTEGER to MAX_SAFE_INTEGER inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {k}'
     */
    P.shiftedBy = function (k) {
      intCheck(k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER);
      return this.times('1e' + k);
    };


    /*
     *  sqrt(-n) =  N
     *  sqrt(N) =  N
     *  sqrt(-I) =  N
     *  sqrt(I) =  I
     *  sqrt(0) =  0
     *  sqrt(-0) = -0
     *
     * Return a new BigNumber whose value is the square root of the value of this BigNumber,
     * rounded according to DECIMAL_PLACES and ROUNDING_MODE.
     */
    P.squareRoot = P.sqrt = function () {
      var m, n, r, rep, t,
        x = this,
        c = x.c,
        s = x.s,
        e = x.e,
        dp = DECIMAL_PLACES + 4,
        half = new BigNumber('0.5');

      // Negative/NaN/Infinity/zero?
      if (s !== 1 || !c || !c[0]) {
        return new BigNumber(!s || s < 0 && (!c || c[0]) ? NaN : c ? x : 1 / 0);
      }

      // Initial estimate.
      s = Math.sqrt(+valueOf(x));

      // Math.sqrt underflow/overflow?
      // Pass x to Math.sqrt as integer, then adjust the exponent of the result.
      if (s == 0 || s == 1 / 0) {
        n = coeffToString(c);
        if ((n.length + e) % 2 == 0) n += '0';
        s = Math.sqrt(+n);
        e = bitFloor((e + 1) / 2) - (e < 0 || e % 2);

        if (s == 1 / 0) {
          n = '5e' + e;
        } else {
          n = s.toExponential();
          n = n.slice(0, n.indexOf('e') + 1) + e;
        }

        r = new BigNumber(n);
      } else {
        r = new BigNumber(s + '');
      }

      // Check for zero.
      // r could be zero if MIN_EXP is changed after the this value was created.
      // This would cause a division by zero (x/t) and hence Infinity below, which would cause
      // coeffToString to throw.
      if (r.c[0]) {
        e = r.e;
        s = e + dp;
        if (s < 3) s = 0;

        // Newton-Raphson iteration.
        for (; ;) {
          t = r;
          r = half.times(t.plus(div(x, t, dp, 1)));

          if (coeffToString(t.c).slice(0, s) === (n = coeffToString(r.c)).slice(0, s)) {

            // The exponent of r may here be one less than the final result exponent,
            // e.g 0.0009999 (e-4) --> 0.001 (e-3), so adjust s so the rounding digits
            // are indexed correctly.
            if (r.e < e) --s;
            n = n.slice(s - 3, s + 1);

            // The 4th rounding digit may be in error by -1 so if the 4 rounding digits
            // are 9999 or 4999 (i.e. approaching a rounding boundary) continue the
            // iteration.
            if (n == '9999' || !rep && n == '4999') {

              // On the first iteration only, check to see if rounding up gives the
              // exact result as the nines may infinitely repeat.
              if (!rep) {
                round(t, t.e + DECIMAL_PLACES + 2, 0);

                if (t.times(t).eq(x)) {
                  r = t;
                  break;
                }
              }

              dp += 4;
              s += 4;
              rep = 1;
            } else {

              // If rounding digits are null, 0{0,4} or 50{0,3}, check for exact
              // result. If not, then there are further digits and m will be truthy.
              if (!+n || !+n.slice(1) && n.charAt(0) == '5') {

                // Truncate to the first rounding digit.
                round(r, r.e + DECIMAL_PLACES + 2, 1);
                m = !r.times(r).eq(x);
              }

              break;
            }
          }
        }
      }

      return round(r, r.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m);
    };


    /*
     * Return a string representing the value of this BigNumber in exponential notation and
     * rounded using ROUNDING_MODE to dp fixed decimal places.
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     */
    P.toExponential = function (dp, rm) {
      if (dp != null) {
        intCheck(dp, 0, MAX);
        dp++;
      }
      return format(this, dp, rm, 1);
    };


    /*
     * Return a string representing the value of this BigNumber in fixed-point notation rounding
     * to dp fixed decimal places using rounding mode rm, or ROUNDING_MODE if rm is omitted.
     *
     * Note: as with JavaScript's number type, (-0).toFixed(0) is '0',
     * but e.g. (-0.00001).toFixed(0) is '-0'.
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     */
    P.toFixed = function (dp, rm) {
      if (dp != null) {
        intCheck(dp, 0, MAX);
        dp = dp + this.e + 1;
      }
      return format(this, dp, rm);
    };


    /*
     * Return a string representing the value of this BigNumber in fixed-point notation rounded
     * using rm or ROUNDING_MODE to dp decimal places, and formatted according to the properties
     * of the format or FORMAT object (see BigNumber.set).
     *
     * The formatting object may contain some or all of the properties shown below.
     *
     * FORMAT = {
     *   prefix: '',
     *   groupSize: 3,
     *   secondaryGroupSize: 0,
     *   groupSeparator: ',',
     *   decimalSeparator: '.',
     *   fractionGroupSize: 0,
     *   fractionGroupSeparator: '\xA0',      // non-breaking space
     *   suffix: ''
     * };
     *
     * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     * [format] {object} Formatting options. See FORMAT pbject above.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {dp|rm}'
     * '[BigNumber Error] Argument not an object: {format}'
     */
    P.toFormat = function (dp, rm, format) {
      var str,
        x = this;

      if (format == null) {
        if (dp != null && rm && typeof rm == 'object') {
          format = rm;
          rm = null;
        } else if (dp && typeof dp == 'object') {
          format = dp;
          dp = rm = null;
        } else {
          format = FORMAT;
        }
      } else if (typeof format != 'object') {
        throw Error
          (bignumberError + 'Argument not an object: ' + format);
      }

      str = x.toFixed(dp, rm);

      if (x.c) {
        var i,
          arr = str.split('.'),
          g1 = +format.groupSize,
          g2 = +format.secondaryGroupSize,
          groupSeparator = format.groupSeparator || '',
          intPart = arr[0],
          fractionPart = arr[1],
          isNeg = x.s < 0,
          intDigits = isNeg ? intPart.slice(1) : intPart,
          len = intDigits.length;

        if (g2) i = g1, g1 = g2, g2 = i, len -= i;

        if (g1 > 0 && len > 0) {
          i = len % g1 || g1;
          intPart = intDigits.substr(0, i);
          for (; i < len; i += g1) intPart += groupSeparator + intDigits.substr(i, g1);
          if (g2 > 0) intPart += groupSeparator + intDigits.slice(i);
          if (isNeg) intPart = '-' + intPart;
        }

        str = fractionPart
         ? intPart + (format.decimalSeparator || '') + ((g2 = +format.fractionGroupSize)
          ? fractionPart.replace(new RegExp('\\d{' + g2 + '}\\B', 'g'),
           '$&' + (format.fractionGroupSeparator || ''))
          : fractionPart)
         : intPart;
      }

      return (format.prefix || '') + str + (format.suffix || '');
    };


    /*
     * Return an array of two BigNumbers representing the value of this BigNumber as a simple
     * fraction with an integer numerator and an integer denominator.
     * The denominator will be a positive non-zero value less than or equal to the specified
     * maximum denominator. If a maximum denominator is not specified, the denominator will be
     * the lowest value necessary to represent the number exactly.
     *
     * [md] {number|string|BigNumber} Integer >= 1, or Infinity. The maximum denominator.
     *
     * '[BigNumber Error] Argument {not an integer|out of range} : {md}'
     */
    P.toFraction = function (md) {
      var d, d0, d1, d2, e, exp, n, n0, n1, q, r, s,
        x = this,
        xc = x.c;

      if (md != null) {
        n = new BigNumber(md);

        // Throw if md is less than one or is not an integer, unless it is Infinity.
        if (!n.isInteger() && (n.c || n.s !== 1) || n.lt(ONE)) {
          throw Error
            (bignumberError + 'Argument ' +
              (n.isInteger() ? 'out of range: ' : 'not an integer: ') + valueOf(n));
        }
      }

      if (!xc) return new BigNumber(x);

      d = new BigNumber(ONE);
      n1 = d0 = new BigNumber(ONE);
      d1 = n0 = new BigNumber(ONE);
      s = coeffToString(xc);

      // Determine initial denominator.
      // d is a power of 10 and the minimum max denominator that specifies the value exactly.
      e = d.e = s.length - x.e - 1;
      d.c[0] = POWS_TEN[(exp = e % LOG_BASE) < 0 ? LOG_BASE + exp : exp];
      md = !md || n.comparedTo(d) > 0 ? (e > 0 ? d : n1) : n;

      exp = MAX_EXP;
      MAX_EXP = 1 / 0;
      n = new BigNumber(s);

      // n0 = d1 = 0
      n0.c[0] = 0;

      for (; ;)  {
        q = div(n, d, 0, 1);
        d2 = d0.plus(q.times(d1));
        if (d2.comparedTo(md) == 1) break;
        d0 = d1;
        d1 = d2;
        n1 = n0.plus(q.times(d2 = n1));
        n0 = d2;
        d = n.minus(q.times(d2 = d));
        n = d2;
      }

      d2 = div(md.minus(d0), d1, 0, 1);
      n0 = n0.plus(d2.times(n1));
      d0 = d0.plus(d2.times(d1));
      n0.s = n1.s = x.s;
      e = e * 2;

      // Determine which fraction is closer to x, n0/d0 or n1/d1
      r = div(n1, d1, e, ROUNDING_MODE).minus(x).abs().comparedTo(
          div(n0, d0, e, ROUNDING_MODE).minus(x).abs()) < 1 ? [n1, d1] : [n0, d0];

      MAX_EXP = exp;

      return r;
    };


    /*
     * Return the value of this BigNumber converted to a number primitive.
     */
    P.toNumber = function () {
      return +valueOf(this);
    };


    /*
     * Return a string representing the value of this BigNumber rounded to sd significant digits
     * using rounding mode rm or ROUNDING_MODE. If sd is less than the number of digits
     * necessary to represent the integer part of the value in fixed-point notation, then use
     * exponential notation.
     *
     * [sd] {number} Significant digits. Integer, 1 to MAX inclusive.
     * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
     *
     * '[BigNumber Error] Argument {not a primitive number|not an integer|out of range}: {sd|rm}'
     */
    P.toPrecision = function (sd, rm) {
      if (sd != null) intCheck(sd, 1, MAX);
      return format(this, sd, rm, 2);
    };


    /*
     * Return a string representing the value of this BigNumber in base b, or base 10 if b is
     * omitted. If a base is specified, including base 10, round according to DECIMAL_PLACES and
     * ROUNDING_MODE. If a base is not specified, and this BigNumber has a positive exponent
     * that is equal to or greater than TO_EXP_POS, or a negative exponent equal to or less than
     * TO_EXP_NEG, return exponential notation.
     *
     * [b] {number} Integer, 2 to ALPHABET.length inclusive.
     *
     * '[BigNumber Error] Base {not a primitive number|not an integer|out of range}: {b}'
     */
    P.toString = function (b) {
      var str,
        n = this,
        s = n.s,
        e = n.e;

      // Infinity or NaN?
      if (e === null) {
        if (s) {
          str = 'Infinity';
          if (s < 0) str = '-' + str;
        } else {
          str = 'NaN';
        }
      } else {
        if (b == null) {
          str = e <= TO_EXP_NEG || e >= TO_EXP_POS
           ? toExponential(coeffToString(n.c), e)
           : toFixedPoint(coeffToString(n.c), e, '0');
        } else if (b === 10) {
          n = round(new BigNumber(n), DECIMAL_PLACES + e + 1, ROUNDING_MODE);
          str = toFixedPoint(coeffToString(n.c), n.e, '0');
        } else {
          intCheck(b, 2, ALPHABET.length, 'Base');
          str = convertBase(toFixedPoint(coeffToString(n.c), e, '0'), 10, b, s, true);
        }

        if (s < 0 && n.c[0]) str = '-' + str;
      }

      return str;
    };


    /*
     * Return as toString, but do not accept a base argument, and include the minus sign for
     * negative zero.
     */
    P.valueOf = P.toJSON = function () {
      return valueOf(this);
    };


    P._isBigNumber = true;

    if (configObject != null) BigNumber.set(configObject);

    return BigNumber;
  }


  // PRIVATE HELPER FUNCTIONS

  // These functions don't need access to variables,
  // e.g. DECIMAL_PLACES, in the scope of the `clone` function above.


  function bitFloor(n) {
    var i = n | 0;
    return n > 0 || n === i ? i : i - 1;
  }


  // Return a coefficient array as a string of base 10 digits.
  function coeffToString(a) {
    var s, z,
      i = 1,
      j = a.length,
      r = a[0] + '';

    for (; i < j;) {
      s = a[i++] + '';
      z = LOG_BASE - s.length;
      for (; z--; s = '0' + s);
      r += s;
    }

    // Determine trailing zeros.
    for (j = r.length; r.charCodeAt(--j) === 48;);

    return r.slice(0, j + 1 || 1);
  }


  // Compare the value of BigNumbers x and y.
  function compare(x, y) {
    var a, b,
      xc = x.c,
      yc = y.c,
      i = x.s,
      j = y.s,
      k = x.e,
      l = y.e;

    // Either NaN?
    if (!i || !j) return null;

    a = xc && !xc[0];
    b = yc && !yc[0];

    // Either zero?
    if (a || b) return a ? b ? 0 : -j : i;

    // Signs differ?
    if (i != j) return i;

    a = i < 0;
    b = k == l;

    // Either Infinity?
    if (!xc || !yc) return b ? 0 : !xc ^ a ? 1 : -1;

    // Compare exponents.
    if (!b) return k > l ^ a ? 1 : -1;

    j = (k = xc.length) < (l = yc.length) ? k : l;

    // Compare digit by digit.
    for (i = 0; i < j; i++) if (xc[i] != yc[i]) return xc[i] > yc[i] ^ a ? 1 : -1;

    // Compare lengths.
    return k == l ? 0 : k > l ^ a ? 1 : -1;
  }


  /*
   * Check that n is a primitive number, an integer, and in range, otherwise throw.
   */
  function intCheck(n, min, max, name) {
    if (n < min || n > max || n !== mathfloor(n)) {
      throw Error
       (bignumberError + (name || 'Argument') + (typeof n == 'number'
         ? n < min || n > max ? ' out of range: ' : ' not an integer: '
         : ' not a primitive number: ') + String(n));
    }
  }


  // Assumes finite n.
  function isOdd(n) {
    var k = n.c.length - 1;
    return bitFloor(n.e / LOG_BASE) == k && n.c[k] % 2 != 0;
  }


  function toExponential(str, e) {
    return (str.length > 1 ? str.charAt(0) + '.' + str.slice(1) : str) +
     (e < 0 ? 'e' : 'e+') + e;
  }


  function toFixedPoint(str, e, z) {
    var len, zs;

    // Negative exponent?
    if (e < 0) {

      // Prepend zeros.
      for (zs = z + '.'; ++e; zs += z);
      str = zs + str;

    // Positive exponent
    } else {
      len = str.length;

      // Append zeros.
      if (++e > len) {
        for (zs = z, e -= len; --e; zs += z);
        str += zs;
      } else if (e < len) {
        str = str.slice(0, e) + '.' + str.slice(e);
      }
    }

    return str;
  }


  // EXPORT


  BigNumber = clone();
  BigNumber['default'] = BigNumber.BigNumber = BigNumber;

  // AMD.
  if (typeof define == 'function' && define.amd) {
    define(function () { return BigNumber; });

  // Node.js and other environments that support module.exports.
  } else if (typeof module != 'undefined' && module.exports) {
    module.exports = BigNumber;

  // Browser.
  } else {
    if (!globalObject) {
      globalObject = typeof self != 'undefined' && self ? self : window;
    }

    globalObject.BigNumber = BigNumber;
  }
})(this);

},{}],18:[function(require,module,exports){
(function (module, exports) {
  'use strict';

  // Utils
  function assert (val, msg) {
    if (!val) throw new Error(msg || 'Assertion failed');
  }

  // Could use `inherits` module, but don't want to move from single file
  // architecture yet.
  function inherits (ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  }

  // BN

  function BN (number, base, endian) {
    if (BN.isBN(number)) {
      return number;
    }

    this.negative = 0;
    this.words = null;
    this.length = 0;

    // Reduction context
    this.red = null;

    if (number !== null) {
      if (base === 'le' || base === 'be') {
        endian = base;
        base = 10;
      }

      this._init(number || 0, base || 10, endian || 'be');
    }
  }
  if (typeof module === 'object') {
    module.exports = BN;
  } else {
    exports.BN = BN;
  }

  BN.BN = BN;
  BN.wordSize = 26;

  var Buffer;
  try {
    Buffer = require('buffer').Buffer;
  } catch (e) {
  }

  BN.isBN = function isBN (num) {
    if (num instanceof BN) {
      return true;
    }

    return num !== null && typeof num === 'object' &&
      num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
  };

  BN.max = function max (left, right) {
    if (left.cmp(right) > 0) return left;
    return right;
  };

  BN.min = function min (left, right) {
    if (left.cmp(right) < 0) return left;
    return right;
  };

  BN.prototype._init = function init (number, base, endian) {
    if (typeof number === 'number') {
      return this._initNumber(number, base, endian);
    }

    if (typeof number === 'object') {
      return this._initArray(number, base, endian);
    }

    if (base === 'hex') {
      base = 16;
    }
    assert(base === (base | 0) && base >= 2 && base <= 36);

    number = number.toString().replace(/\s+/g, '');
    var start = 0;
    if (number[0] === '-') {
      start++;
    }

    if (base === 16) {
      this._parseHex(number, start);
    } else {
      this._parseBase(number, base, start);
    }

    if (number[0] === '-') {
      this.negative = 1;
    }

    this.strip();

    if (endian !== 'le') return;

    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initNumber = function _initNumber (number, base, endian) {
    if (number < 0) {
      this.negative = 1;
      number = -number;
    }
    if (number < 0x4000000) {
      this.words = [ number & 0x3ffffff ];
      this.length = 1;
    } else if (number < 0x10000000000000) {
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff
      ];
      this.length = 2;
    } else {
      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff,
        1
      ];
      this.length = 3;
    }

    if (endian !== 'le') return;

    // Reverse the bytes
    this._initArray(this.toArray(), base, endian);
  };

  BN.prototype._initArray = function _initArray (number, base, endian) {
    // Perhaps a Uint8Array
    assert(typeof number.length === 'number');
    if (number.length <= 0) {
      this.words = [ 0 ];
      this.length = 1;
      return this;
    }

    this.length = Math.ceil(number.length / 3);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    var off = 0;
    if (endian === 'be') {
      for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    } else if (endian === 'le') {
      for (i = 0, j = 0; i < number.length; i += 3) {
        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    }
    return this.strip();
  };

  function parseHex (str, start, end) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r <<= 4;

      // 'a' - 'f'
      if (c >= 49 && c <= 54) {
        r |= c - 49 + 0xa;

      // 'A' - 'F'
      } else if (c >= 17 && c <= 22) {
        r |= c - 17 + 0xa;

      // '0' - '9'
      } else {
        r |= c & 0xf;
      }
    }
    return r;
  }

  BN.prototype._parseHex = function _parseHex (number, start) {
    // Create possibly bigger array to ensure that it fits the number
    this.length = Math.ceil((number.length - start) / 6);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    var j, w;
    // Scan 24-bit chunks and add them to the number
    var off = 0;
    for (i = number.length - 6, j = 0; i >= start; i -= 6) {
      w = parseHex(number, i, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      // NOTE: `0x3fffff` is intentional here, 26bits max shift + 24bit hex limb
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
      off += 24;
      if (off >= 26) {
        off -= 26;
        j++;
      }
    }
    if (i + 6 !== start) {
      w = parseHex(number, start, i + 6);
      this.words[j] |= (w << off) & 0x3ffffff;
      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
    }
    this.strip();
  };

  function parseBase (str, start, end, mul) {
    var r = 0;
    var len = Math.min(str.length, end);
    for (var i = start; i < len; i++) {
      var c = str.charCodeAt(i) - 48;

      r *= mul;

      // 'a'
      if (c >= 49) {
        r += c - 49 + 0xa;

      // 'A'
      } else if (c >= 17) {
        r += c - 17 + 0xa;

      // '0' - '9'
      } else {
        r += c;
      }
    }
    return r;
  }

  BN.prototype._parseBase = function _parseBase (number, base, start) {
    // Initialize as zero
    this.words = [ 0 ];
    this.length = 1;

    // Find length of limb in base
    for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base) {
      limbLen++;
    }
    limbLen--;
    limbPow = (limbPow / base) | 0;

    var total = number.length - start;
    var mod = total % limbLen;
    var end = Math.min(total, total - mod) + start;

    var word = 0;
    for (var i = start; i < end; i += limbLen) {
      word = parseBase(number, i, i + limbLen, base);

      this.imuln(limbPow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }

    if (mod !== 0) {
      var pow = 1;
      word = parseBase(number, i, number.length, base);

      for (i = 0; i < mod; i++) {
        pow *= base;
      }

      this.imuln(pow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }
  };

  BN.prototype.copy = function copy (dest) {
    dest.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      dest.words[i] = this.words[i];
    }
    dest.length = this.length;
    dest.negative = this.negative;
    dest.red = this.red;
  };

  BN.prototype.clone = function clone () {
    var r = new BN(null);
    this.copy(r);
    return r;
  };

  BN.prototype._expand = function _expand (size) {
    while (this.length < size) {
      this.words[this.length++] = 0;
    }
    return this;
  };

  // Remove leading `0` from `this`
  BN.prototype.strip = function strip () {
    while (this.length > 1 && this.words[this.length - 1] === 0) {
      this.length--;
    }
    return this._normSign();
  };

  BN.prototype._normSign = function _normSign () {
    // -0 = 0
    if (this.length === 1 && this.words[0] === 0) {
      this.negative = 0;
    }
    return this;
  };

  BN.prototype.inspect = function inspect () {
    return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
  };

  /*

  var zeros = [];
  var groupSizes = [];
  var groupBases = [];

  var s = '';
  var i = -1;
  while (++i < BN.wordSize) {
    zeros[i] = s;
    s += '0';
  }
  groupSizes[0] = 0;
  groupSizes[1] = 0;
  groupBases[0] = 0;
  groupBases[1] = 0;
  var base = 2 - 1;
  while (++base < 36 + 1) {
    var groupSize = 0;
    var groupBase = 1;
    while (groupBase < (1 << BN.wordSize) / base) {
      groupBase *= base;
      groupSize += 1;
    }
    groupSizes[base] = groupSize;
    groupBases[base] = groupBase;
  }

  */

  var zeros = [
    '',
    '0',
    '00',
    '000',
    '0000',
    '00000',
    '000000',
    '0000000',
    '00000000',
    '000000000',
    '0000000000',
    '00000000000',
    '000000000000',
    '0000000000000',
    '00000000000000',
    '000000000000000',
    '0000000000000000',
    '00000000000000000',
    '000000000000000000',
    '0000000000000000000',
    '00000000000000000000',
    '000000000000000000000',
    '0000000000000000000000',
    '00000000000000000000000',
    '000000000000000000000000',
    '0000000000000000000000000'
  ];

  var groupSizes = [
    0, 0,
    25, 16, 12, 11, 10, 9, 8,
    8, 7, 7, 7, 7, 6, 6,
    6, 6, 6, 6, 6, 5, 5,
    5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5
  ];

  var groupBases = [
    0, 0,
    33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
    43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
    16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
    6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
    24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
  ];

  BN.prototype.toString = function toString (base, padding) {
    base = base || 10;
    padding = padding | 0 || 1;

    var out;
    if (base === 16 || base === 'hex') {
      out = '';
      var off = 0;
      var carry = 0;
      for (var i = 0; i < this.length; i++) {
        var w = this.words[i];
        var word = (((w << off) | carry) & 0xffffff).toString(16);
        carry = (w >>> (24 - off)) & 0xffffff;
        if (carry !== 0 || i !== this.length - 1) {
          out = zeros[6 - word.length] + word + out;
        } else {
          out = word + out;
        }
        off += 2;
        if (off >= 26) {
          off -= 26;
          i--;
        }
      }
      if (carry !== 0) {
        out = carry.toString(16) + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    if (base === (base | 0) && base >= 2 && base <= 36) {
      // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
      var groupSize = groupSizes[base];
      // var groupBase = Math.pow(base, groupSize);
      var groupBase = groupBases[base];
      out = '';
      var c = this.clone();
      c.negative = 0;
      while (!c.isZero()) {
        var r = c.modn(groupBase).toString(base);
        c = c.idivn(groupBase);

        if (!c.isZero()) {
          out = zeros[groupSize - r.length] + r + out;
        } else {
          out = r + out;
        }
      }
      if (this.isZero()) {
        out = '0' + out;
      }
      while (out.length % padding !== 0) {
        out = '0' + out;
      }
      if (this.negative !== 0) {
        out = '-' + out;
      }
      return out;
    }

    assert(false, 'Base should be between 2 and 36');
  };

  BN.prototype.toNumber = function toNumber () {
    var ret = this.words[0];
    if (this.length === 2) {
      ret += this.words[1] * 0x4000000;
    } else if (this.length === 3 && this.words[2] === 0x01) {
      // NOTE: at this stage it is known that the top bit is set
      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
    } else if (this.length > 2) {
      assert(false, 'Number can only safely store up to 53 bits');
    }
    return (this.negative !== 0) ? -ret : ret;
  };

  BN.prototype.toJSON = function toJSON () {
    return this.toString(16);
  };

  BN.prototype.toBuffer = function toBuffer (endian, length) {
    assert(typeof Buffer !== 'undefined');
    return this.toArrayLike(Buffer, endian, length);
  };

  BN.prototype.toArray = function toArray (endian, length) {
    return this.toArrayLike(Array, endian, length);
  };

  BN.prototype.toArrayLike = function toArrayLike (ArrayType, endian, length) {
    var byteLength = this.byteLength();
    var reqLength = length || Math.max(1, byteLength);
    assert(byteLength <= reqLength, 'byte array longer than desired length');
    assert(reqLength > 0, 'Requested array length <= 0');

    this.strip();
    var littleEndian = endian === 'le';
    var res = new ArrayType(reqLength);

    var b, i;
    var q = this.clone();
    if (!littleEndian) {
      // Assume big-endian
      for (i = 0; i < reqLength - byteLength; i++) {
        res[i] = 0;
      }

      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[reqLength - i - 1] = b;
      }
    } else {
      for (i = 0; !q.isZero(); i++) {
        b = q.andln(0xff);
        q.iushrn(8);

        res[i] = b;
      }

      for (; i < reqLength; i++) {
        res[i] = 0;
      }
    }

    return res;
  };

  if (Math.clz32) {
    BN.prototype._countBits = function _countBits (w) {
      return 32 - Math.clz32(w);
    };
  } else {
    BN.prototype._countBits = function _countBits (w) {
      var t = w;
      var r = 0;
      if (t >= 0x1000) {
        r += 13;
        t >>>= 13;
      }
      if (t >= 0x40) {
        r += 7;
        t >>>= 7;
      }
      if (t >= 0x8) {
        r += 4;
        t >>>= 4;
      }
      if (t >= 0x02) {
        r += 2;
        t >>>= 2;
      }
      return r + t;
    };
  }

  BN.prototype._zeroBits = function _zeroBits (w) {
    // Short-cut
    if (w === 0) return 26;

    var t = w;
    var r = 0;
    if ((t & 0x1fff) === 0) {
      r += 13;
      t >>>= 13;
    }
    if ((t & 0x7f) === 0) {
      r += 7;
      t >>>= 7;
    }
    if ((t & 0xf) === 0) {
      r += 4;
      t >>>= 4;
    }
    if ((t & 0x3) === 0) {
      r += 2;
      t >>>= 2;
    }
    if ((t & 0x1) === 0) {
      r++;
    }
    return r;
  };

  // Return number of used bits in a BN
  BN.prototype.bitLength = function bitLength () {
    var w = this.words[this.length - 1];
    var hi = this._countBits(w);
    return (this.length - 1) * 26 + hi;
  };

  function toBitArray (num) {
    var w = new Array(num.bitLength());

    for (var bit = 0; bit < w.length; bit++) {
      var off = (bit / 26) | 0;
      var wbit = bit % 26;

      w[bit] = (num.words[off] & (1 << wbit)) >>> wbit;
    }

    return w;
  }

  // Number of trailing zero bits
  BN.prototype.zeroBits = function zeroBits () {
    if (this.isZero()) return 0;

    var r = 0;
    for (var i = 0; i < this.length; i++) {
      var b = this._zeroBits(this.words[i]);
      r += b;
      if (b !== 26) break;
    }
    return r;
  };

  BN.prototype.byteLength = function byteLength () {
    return Math.ceil(this.bitLength() / 8);
  };

  BN.prototype.toTwos = function toTwos (width) {
    if (this.negative !== 0) {
      return this.abs().inotn(width).iaddn(1);
    }
    return this.clone();
  };

  BN.prototype.fromTwos = function fromTwos (width) {
    if (this.testn(width - 1)) {
      return this.notn(width).iaddn(1).ineg();
    }
    return this.clone();
  };

  BN.prototype.isNeg = function isNeg () {
    return this.negative !== 0;
  };

  // Return negative clone of `this`
  BN.prototype.neg = function neg () {
    return this.clone().ineg();
  };

  BN.prototype.ineg = function ineg () {
    if (!this.isZero()) {
      this.negative ^= 1;
    }

    return this;
  };

  // Or `num` with `this` in-place
  BN.prototype.iuor = function iuor (num) {
    while (this.length < num.length) {
      this.words[this.length++] = 0;
    }

    for (var i = 0; i < num.length; i++) {
      this.words[i] = this.words[i] | num.words[i];
    }

    return this.strip();
  };

  BN.prototype.ior = function ior (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuor(num);
  };

  // Or `num` with `this`
  BN.prototype.or = function or (num) {
    if (this.length > num.length) return this.clone().ior(num);
    return num.clone().ior(this);
  };

  BN.prototype.uor = function uor (num) {
    if (this.length > num.length) return this.clone().iuor(num);
    return num.clone().iuor(this);
  };

  // And `num` with `this` in-place
  BN.prototype.iuand = function iuand (num) {
    // b = min-length(num, this)
    var b;
    if (this.length > num.length) {
      b = num;
    } else {
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = this.words[i] & num.words[i];
    }

    this.length = b.length;

    return this.strip();
  };

  BN.prototype.iand = function iand (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuand(num);
  };

  // And `num` with `this`
  BN.prototype.and = function and (num) {
    if (this.length > num.length) return this.clone().iand(num);
    return num.clone().iand(this);
  };

  BN.prototype.uand = function uand (num) {
    if (this.length > num.length) return this.clone().iuand(num);
    return num.clone().iuand(this);
  };

  // Xor `num` with `this` in-place
  BN.prototype.iuxor = function iuxor (num) {
    // a.length > b.length
    var a;
    var b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    for (var i = 0; i < b.length; i++) {
      this.words[i] = a.words[i] ^ b.words[i];
    }

    if (this !== a) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = a.length;

    return this.strip();
  };

  BN.prototype.ixor = function ixor (num) {
    assert((this.negative | num.negative) === 0);
    return this.iuxor(num);
  };

  // Xor `num` with `this`
  BN.prototype.xor = function xor (num) {
    if (this.length > num.length) return this.clone().ixor(num);
    return num.clone().ixor(this);
  };

  BN.prototype.uxor = function uxor (num) {
    if (this.length > num.length) return this.clone().iuxor(num);
    return num.clone().iuxor(this);
  };

  // Not ``this`` with ``width`` bitwidth
  BN.prototype.inotn = function inotn (width) {
    assert(typeof width === 'number' && width >= 0);

    var bytesNeeded = Math.ceil(width / 26) | 0;
    var bitsLeft = width % 26;

    // Extend the buffer with leading zeroes
    this._expand(bytesNeeded);

    if (bitsLeft > 0) {
      bytesNeeded--;
    }

    // Handle complete words
    for (var i = 0; i < bytesNeeded; i++) {
      this.words[i] = ~this.words[i] & 0x3ffffff;
    }

    // Handle the residue
    if (bitsLeft > 0) {
      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
    }

    // And remove leading zeroes
    return this.strip();
  };

  BN.prototype.notn = function notn (width) {
    return this.clone().inotn(width);
  };

  // Set `bit` of `this`
  BN.prototype.setn = function setn (bit, val) {
    assert(typeof bit === 'number' && bit >= 0);

    var off = (bit / 26) | 0;
    var wbit = bit % 26;

    this._expand(off + 1);

    if (val) {
      this.words[off] = this.words[off] | (1 << wbit);
    } else {
      this.words[off] = this.words[off] & ~(1 << wbit);
    }

    return this.strip();
  };

  // Add `num` to `this` in-place
  BN.prototype.iadd = function iadd (num) {
    var r;

    // negative + positive
    if (this.negative !== 0 && num.negative === 0) {
      this.negative = 0;
      r = this.isub(num);
      this.negative ^= 1;
      return this._normSign();

    // positive + negative
    } else if (this.negative === 0 && num.negative !== 0) {
      num.negative = 0;
      r = this.isub(num);
      num.negative = 1;
      return r._normSign();
    }

    // a.length > b.length
    var a, b;
    if (this.length > num.length) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }

    this.length = a.length;
    if (carry !== 0) {
      this.words[this.length] = carry;
      this.length++;
    // Copy the rest of the words
    } else if (a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    return this;
  };

  // Add `num` to `this`
  BN.prototype.add = function add (num) {
    var res;
    if (num.negative !== 0 && this.negative === 0) {
      num.negative = 0;
      res = this.sub(num);
      num.negative ^= 1;
      return res;
    } else if (num.negative === 0 && this.negative !== 0) {
      this.negative = 0;
      res = num.sub(this);
      this.negative = 1;
      return res;
    }

    if (this.length > num.length) return this.clone().iadd(num);

    return num.clone().iadd(this);
  };

  // Subtract `num` from `this` in-place
  BN.prototype.isub = function isub (num) {
    // this - (-num) = this + num
    if (num.negative !== 0) {
      num.negative = 0;
      var r = this.iadd(num);
      num.negative = 1;
      return r._normSign();

    // -this - num = -(this + num)
    } else if (this.negative !== 0) {
      this.negative = 0;
      this.iadd(num);
      this.negative = 1;
      return this._normSign();
    }

    // At this point both numbers are positive
    var cmp = this.cmp(num);

    // Optimization - zeroify
    if (cmp === 0) {
      this.negative = 0;
      this.length = 1;
      this.words[0] = 0;
      return this;
    }

    // a > b
    var a, b;
    if (cmp > 0) {
      a = this;
      b = num;
    } else {
      a = num;
      b = this;
    }

    var carry = 0;
    for (var i = 0; i < b.length; i++) {
      r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }
    for (; carry !== 0 && i < a.length; i++) {
      r = (a.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }

    // Copy rest of the words
    if (carry === 0 && i < a.length && a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = Math.max(this.length, i);

    if (a !== this) {
      this.negative = 1;
    }

    return this.strip();
  };

  // Subtract `num` from `this`
  BN.prototype.sub = function sub (num) {
    return this.clone().isub(num);
  };

  function smallMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    var len = (self.length + num.length) | 0;
    out.length = len;
    len = (len - 1) | 0;

    // Peel one iteration (compiler can't do it, because of code complexity)
    var a = self.words[0] | 0;
    var b = num.words[0] | 0;
    var r = a * b;

    var lo = r & 0x3ffffff;
    var carry = (r / 0x4000000) | 0;
    out.words[0] = lo;

    for (var k = 1; k < len; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = carry >>> 26;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = (k - j) | 0;
        a = self.words[i] | 0;
        b = num.words[j] | 0;
        r = a * b + rword;
        ncarry += (r / 0x4000000) | 0;
        rword = r & 0x3ffffff;
      }
      out.words[k] = rword | 0;
      carry = ncarry | 0;
    }
    if (carry !== 0) {
      out.words[k] = carry | 0;
    } else {
      out.length--;
    }

    return out.strip();
  }

  // TODO(indutny): it may be reasonable to omit it for users who don't need
  // to work with 256-bit numbers, otherwise it gives 20% improvement for 256-bit
  // multiplication (like elliptic secp256k1).
  var comb10MulTo = function comb10MulTo (self, num, out) {
    var a = self.words;
    var b = num.words;
    var o = out.words;
    var c = 0;
    var lo;
    var mid;
    var hi;
    var a0 = a[0] | 0;
    var al0 = a0 & 0x1fff;
    var ah0 = a0 >>> 13;
    var a1 = a[1] | 0;
    var al1 = a1 & 0x1fff;
    var ah1 = a1 >>> 13;
    var a2 = a[2] | 0;
    var al2 = a2 & 0x1fff;
    var ah2 = a2 >>> 13;
    var a3 = a[3] | 0;
    var al3 = a3 & 0x1fff;
    var ah3 = a3 >>> 13;
    var a4 = a[4] | 0;
    var al4 = a4 & 0x1fff;
    var ah4 = a4 >>> 13;
    var a5 = a[5] | 0;
    var al5 = a5 & 0x1fff;
    var ah5 = a5 >>> 13;
    var a6 = a[6] | 0;
    var al6 = a6 & 0x1fff;
    var ah6 = a6 >>> 13;
    var a7 = a[7] | 0;
    var al7 = a7 & 0x1fff;
    var ah7 = a7 >>> 13;
    var a8 = a[8] | 0;
    var al8 = a8 & 0x1fff;
    var ah8 = a8 >>> 13;
    var a9 = a[9] | 0;
    var al9 = a9 & 0x1fff;
    var ah9 = a9 >>> 13;
    var b0 = b[0] | 0;
    var bl0 = b0 & 0x1fff;
    var bh0 = b0 >>> 13;
    var b1 = b[1] | 0;
    var bl1 = b1 & 0x1fff;
    var bh1 = b1 >>> 13;
    var b2 = b[2] | 0;
    var bl2 = b2 & 0x1fff;
    var bh2 = b2 >>> 13;
    var b3 = b[3] | 0;
    var bl3 = b3 & 0x1fff;
    var bh3 = b3 >>> 13;
    var b4 = b[4] | 0;
    var bl4 = b4 & 0x1fff;
    var bh4 = b4 >>> 13;
    var b5 = b[5] | 0;
    var bl5 = b5 & 0x1fff;
    var bh5 = b5 >>> 13;
    var b6 = b[6] | 0;
    var bl6 = b6 & 0x1fff;
    var bh6 = b6 >>> 13;
    var b7 = b[7] | 0;
    var bl7 = b7 & 0x1fff;
    var bh7 = b7 >>> 13;
    var b8 = b[8] | 0;
    var bl8 = b8 & 0x1fff;
    var bh8 = b8 >>> 13;
    var b9 = b[9] | 0;
    var bl9 = b9 & 0x1fff;
    var bh9 = b9 >>> 13;

    out.negative = self.negative ^ num.negative;
    out.length = 19;
    /* k = 0 */
    lo = Math.imul(al0, bl0);
    mid = Math.imul(al0, bh0);
    mid = (mid + Math.imul(ah0, bl0)) | 0;
    hi = Math.imul(ah0, bh0);
    var w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
    w0 &= 0x3ffffff;
    /* k = 1 */
    lo = Math.imul(al1, bl0);
    mid = Math.imul(al1, bh0);
    mid = (mid + Math.imul(ah1, bl0)) | 0;
    hi = Math.imul(ah1, bh0);
    lo = (lo + Math.imul(al0, bl1)) | 0;
    mid = (mid + Math.imul(al0, bh1)) | 0;
    mid = (mid + Math.imul(ah0, bl1)) | 0;
    hi = (hi + Math.imul(ah0, bh1)) | 0;
    var w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
    w1 &= 0x3ffffff;
    /* k = 2 */
    lo = Math.imul(al2, bl0);
    mid = Math.imul(al2, bh0);
    mid = (mid + Math.imul(ah2, bl0)) | 0;
    hi = Math.imul(ah2, bh0);
    lo = (lo + Math.imul(al1, bl1)) | 0;
    mid = (mid + Math.imul(al1, bh1)) | 0;
    mid = (mid + Math.imul(ah1, bl1)) | 0;
    hi = (hi + Math.imul(ah1, bh1)) | 0;
    lo = (lo + Math.imul(al0, bl2)) | 0;
    mid = (mid + Math.imul(al0, bh2)) | 0;
    mid = (mid + Math.imul(ah0, bl2)) | 0;
    hi = (hi + Math.imul(ah0, bh2)) | 0;
    var w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
    w2 &= 0x3ffffff;
    /* k = 3 */
    lo = Math.imul(al3, bl0);
    mid = Math.imul(al3, bh0);
    mid = (mid + Math.imul(ah3, bl0)) | 0;
    hi = Math.imul(ah3, bh0);
    lo = (lo + Math.imul(al2, bl1)) | 0;
    mid = (mid + Math.imul(al2, bh1)) | 0;
    mid = (mid + Math.imul(ah2, bl1)) | 0;
    hi = (hi + Math.imul(ah2, bh1)) | 0;
    lo = (lo + Math.imul(al1, bl2)) | 0;
    mid = (mid + Math.imul(al1, bh2)) | 0;
    mid = (mid + Math.imul(ah1, bl2)) | 0;
    hi = (hi + Math.imul(ah1, bh2)) | 0;
    lo = (lo + Math.imul(al0, bl3)) | 0;
    mid = (mid + Math.imul(al0, bh3)) | 0;
    mid = (mid + Math.imul(ah0, bl3)) | 0;
    hi = (hi + Math.imul(ah0, bh3)) | 0;
    var w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
    w3 &= 0x3ffffff;
    /* k = 4 */
    lo = Math.imul(al4, bl0);
    mid = Math.imul(al4, bh0);
    mid = (mid + Math.imul(ah4, bl0)) | 0;
    hi = Math.imul(ah4, bh0);
    lo = (lo + Math.imul(al3, bl1)) | 0;
    mid = (mid + Math.imul(al3, bh1)) | 0;
    mid = (mid + Math.imul(ah3, bl1)) | 0;
    hi = (hi + Math.imul(ah3, bh1)) | 0;
    lo = (lo + Math.imul(al2, bl2)) | 0;
    mid = (mid + Math.imul(al2, bh2)) | 0;
    mid = (mid + Math.imul(ah2, bl2)) | 0;
    hi = (hi + Math.imul(ah2, bh2)) | 0;
    lo = (lo + Math.imul(al1, bl3)) | 0;
    mid = (mid + Math.imul(al1, bh3)) | 0;
    mid = (mid + Math.imul(ah1, bl3)) | 0;
    hi = (hi + Math.imul(ah1, bh3)) | 0;
    lo = (lo + Math.imul(al0, bl4)) | 0;
    mid = (mid + Math.imul(al0, bh4)) | 0;
    mid = (mid + Math.imul(ah0, bl4)) | 0;
    hi = (hi + Math.imul(ah0, bh4)) | 0;
    var w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
    w4 &= 0x3ffffff;
    /* k = 5 */
    lo = Math.imul(al5, bl0);
    mid = Math.imul(al5, bh0);
    mid = (mid + Math.imul(ah5, bl0)) | 0;
    hi = Math.imul(ah5, bh0);
    lo = (lo + Math.imul(al4, bl1)) | 0;
    mid = (mid + Math.imul(al4, bh1)) | 0;
    mid = (mid + Math.imul(ah4, bl1)) | 0;
    hi = (hi + Math.imul(ah4, bh1)) | 0;
    lo = (lo + Math.imul(al3, bl2)) | 0;
    mid = (mid + Math.imul(al3, bh2)) | 0;
    mid = (mid + Math.imul(ah3, bl2)) | 0;
    hi = (hi + Math.imul(ah3, bh2)) | 0;
    lo = (lo + Math.imul(al2, bl3)) | 0;
    mid = (mid + Math.imul(al2, bh3)) | 0;
    mid = (mid + Math.imul(ah2, bl3)) | 0;
    hi = (hi + Math.imul(ah2, bh3)) | 0;
    lo = (lo + Math.imul(al1, bl4)) | 0;
    mid = (mid + Math.imul(al1, bh4)) | 0;
    mid = (mid + Math.imul(ah1, bl4)) | 0;
    hi = (hi + Math.imul(ah1, bh4)) | 0;
    lo = (lo + Math.imul(al0, bl5)) | 0;
    mid = (mid + Math.imul(al0, bh5)) | 0;
    mid = (mid + Math.imul(ah0, bl5)) | 0;
    hi = (hi + Math.imul(ah0, bh5)) | 0;
    var w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
    w5 &= 0x3ffffff;
    /* k = 6 */
    lo = Math.imul(al6, bl0);
    mid = Math.imul(al6, bh0);
    mid = (mid + Math.imul(ah6, bl0)) | 0;
    hi = Math.imul(ah6, bh0);
    lo = (lo + Math.imul(al5, bl1)) | 0;
    mid = (mid + Math.imul(al5, bh1)) | 0;
    mid = (mid + Math.imul(ah5, bl1)) | 0;
    hi = (hi + Math.imul(ah5, bh1)) | 0;
    lo = (lo + Math.imul(al4, bl2)) | 0;
    mid = (mid + Math.imul(al4, bh2)) | 0;
    mid = (mid + Math.imul(ah4, bl2)) | 0;
    hi = (hi + Math.imul(ah4, bh2)) | 0;
    lo = (lo + Math.imul(al3, bl3)) | 0;
    mid = (mid + Math.imul(al3, bh3)) | 0;
    mid = (mid + Math.imul(ah3, bl3)) | 0;
    hi = (hi + Math.imul(ah3, bh3)) | 0;
    lo = (lo + Math.imul(al2, bl4)) | 0;
    mid = (mid + Math.imul(al2, bh4)) | 0;
    mid = (mid + Math.imul(ah2, bl4)) | 0;
    hi = (hi + Math.imul(ah2, bh4)) | 0;
    lo = (lo + Math.imul(al1, bl5)) | 0;
    mid = (mid + Math.imul(al1, bh5)) | 0;
    mid = (mid + Math.imul(ah1, bl5)) | 0;
    hi = (hi + Math.imul(ah1, bh5)) | 0;
    lo = (lo + Math.imul(al0, bl6)) | 0;
    mid = (mid + Math.imul(al0, bh6)) | 0;
    mid = (mid + Math.imul(ah0, bl6)) | 0;
    hi = (hi + Math.imul(ah0, bh6)) | 0;
    var w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
    w6 &= 0x3ffffff;
    /* k = 7 */
    lo = Math.imul(al7, bl0);
    mid = Math.imul(al7, bh0);
    mid = (mid + Math.imul(ah7, bl0)) | 0;
    hi = Math.imul(ah7, bh0);
    lo = (lo + Math.imul(al6, bl1)) | 0;
    mid = (mid + Math.imul(al6, bh1)) | 0;
    mid = (mid + Math.imul(ah6, bl1)) | 0;
    hi = (hi + Math.imul(ah6, bh1)) | 0;
    lo = (lo + Math.imul(al5, bl2)) | 0;
    mid = (mid + Math.imul(al5, bh2)) | 0;
    mid = (mid + Math.imul(ah5, bl2)) | 0;
    hi = (hi + Math.imul(ah5, bh2)) | 0;
    lo = (lo + Math.imul(al4, bl3)) | 0;
    mid = (mid + Math.imul(al4, bh3)) | 0;
    mid = (mid + Math.imul(ah4, bl3)) | 0;
    hi = (hi + Math.imul(ah4, bh3)) | 0;
    lo = (lo + Math.imul(al3, bl4)) | 0;
    mid = (mid + Math.imul(al3, bh4)) | 0;
    mid = (mid + Math.imul(ah3, bl4)) | 0;
    hi = (hi + Math.imul(ah3, bh4)) | 0;
    lo = (lo + Math.imul(al2, bl5)) | 0;
    mid = (mid + Math.imul(al2, bh5)) | 0;
    mid = (mid + Math.imul(ah2, bl5)) | 0;
    hi = (hi + Math.imul(ah2, bh5)) | 0;
    lo = (lo + Math.imul(al1, bl6)) | 0;
    mid = (mid + Math.imul(al1, bh6)) | 0;
    mid = (mid + Math.imul(ah1, bl6)) | 0;
    hi = (hi + Math.imul(ah1, bh6)) | 0;
    lo = (lo + Math.imul(al0, bl7)) | 0;
    mid = (mid + Math.imul(al0, bh7)) | 0;
    mid = (mid + Math.imul(ah0, bl7)) | 0;
    hi = (hi + Math.imul(ah0, bh7)) | 0;
    var w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
    w7 &= 0x3ffffff;
    /* k = 8 */
    lo = Math.imul(al8, bl0);
    mid = Math.imul(al8, bh0);
    mid = (mid + Math.imul(ah8, bl0)) | 0;
    hi = Math.imul(ah8, bh0);
    lo = (lo + Math.imul(al7, bl1)) | 0;
    mid = (mid + Math.imul(al7, bh1)) | 0;
    mid = (mid + Math.imul(ah7, bl1)) | 0;
    hi = (hi + Math.imul(ah7, bh1)) | 0;
    lo = (lo + Math.imul(al6, bl2)) | 0;
    mid = (mid + Math.imul(al6, bh2)) | 0;
    mid = (mid + Math.imul(ah6, bl2)) | 0;
    hi = (hi + Math.imul(ah6, bh2)) | 0;
    lo = (lo + Math.imul(al5, bl3)) | 0;
    mid = (mid + Math.imul(al5, bh3)) | 0;
    mid = (mid + Math.imul(ah5, bl3)) | 0;
    hi = (hi + Math.imul(ah5, bh3)) | 0;
    lo = (lo + Math.imul(al4, bl4)) | 0;
    mid = (mid + Math.imul(al4, bh4)) | 0;
    mid = (mid + Math.imul(ah4, bl4)) | 0;
    hi = (hi + Math.imul(ah4, bh4)) | 0;
    lo = (lo + Math.imul(al3, bl5)) | 0;
    mid = (mid + Math.imul(al3, bh5)) | 0;
    mid = (mid + Math.imul(ah3, bl5)) | 0;
    hi = (hi + Math.imul(ah3, bh5)) | 0;
    lo = (lo + Math.imul(al2, bl6)) | 0;
    mid = (mid + Math.imul(al2, bh6)) | 0;
    mid = (mid + Math.imul(ah2, bl6)) | 0;
    hi = (hi + Math.imul(ah2, bh6)) | 0;
    lo = (lo + Math.imul(al1, bl7)) | 0;
    mid = (mid + Math.imul(al1, bh7)) | 0;
    mid = (mid + Math.imul(ah1, bl7)) | 0;
    hi = (hi + Math.imul(ah1, bh7)) | 0;
    lo = (lo + Math.imul(al0, bl8)) | 0;
    mid = (mid + Math.imul(al0, bh8)) | 0;
    mid = (mid + Math.imul(ah0, bl8)) | 0;
    hi = (hi + Math.imul(ah0, bh8)) | 0;
    var w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
    w8 &= 0x3ffffff;
    /* k = 9 */
    lo = Math.imul(al9, bl0);
    mid = Math.imul(al9, bh0);
    mid = (mid + Math.imul(ah9, bl0)) | 0;
    hi = Math.imul(ah9, bh0);
    lo = (lo + Math.imul(al8, bl1)) | 0;
    mid = (mid + Math.imul(al8, bh1)) | 0;
    mid = (mid + Math.imul(ah8, bl1)) | 0;
    hi = (hi + Math.imul(ah8, bh1)) | 0;
    lo = (lo + Math.imul(al7, bl2)) | 0;
    mid = (mid + Math.imul(al7, bh2)) | 0;
    mid = (mid + Math.imul(ah7, bl2)) | 0;
    hi = (hi + Math.imul(ah7, bh2)) | 0;
    lo = (lo + Math.imul(al6, bl3)) | 0;
    mid = (mid + Math.imul(al6, bh3)) | 0;
    mid = (mid + Math.imul(ah6, bl3)) | 0;
    hi = (hi + Math.imul(ah6, bh3)) | 0;
    lo = (lo + Math.imul(al5, bl4)) | 0;
    mid = (mid + Math.imul(al5, bh4)) | 0;
    mid = (mid + Math.imul(ah5, bl4)) | 0;
    hi = (hi + Math.imul(ah5, bh4)) | 0;
    lo = (lo + Math.imul(al4, bl5)) | 0;
    mid = (mid + Math.imul(al4, bh5)) | 0;
    mid = (mid + Math.imul(ah4, bl5)) | 0;
    hi = (hi + Math.imul(ah4, bh5)) | 0;
    lo = (lo + Math.imul(al3, bl6)) | 0;
    mid = (mid + Math.imul(al3, bh6)) | 0;
    mid = (mid + Math.imul(ah3, bl6)) | 0;
    hi = (hi + Math.imul(ah3, bh6)) | 0;
    lo = (lo + Math.imul(al2, bl7)) | 0;
    mid = (mid + Math.imul(al2, bh7)) | 0;
    mid = (mid + Math.imul(ah2, bl7)) | 0;
    hi = (hi + Math.imul(ah2, bh7)) | 0;
    lo = (lo + Math.imul(al1, bl8)) | 0;
    mid = (mid + Math.imul(al1, bh8)) | 0;
    mid = (mid + Math.imul(ah1, bl8)) | 0;
    hi = (hi + Math.imul(ah1, bh8)) | 0;
    lo = (lo + Math.imul(al0, bl9)) | 0;
    mid = (mid + Math.imul(al0, bh9)) | 0;
    mid = (mid + Math.imul(ah0, bl9)) | 0;
    hi = (hi + Math.imul(ah0, bh9)) | 0;
    var w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
    w9 &= 0x3ffffff;
    /* k = 10 */
    lo = Math.imul(al9, bl1);
    mid = Math.imul(al9, bh1);
    mid = (mid + Math.imul(ah9, bl1)) | 0;
    hi = Math.imul(ah9, bh1);
    lo = (lo + Math.imul(al8, bl2)) | 0;
    mid = (mid + Math.imul(al8, bh2)) | 0;
    mid = (mid + Math.imul(ah8, bl2)) | 0;
    hi = (hi + Math.imul(ah8, bh2)) | 0;
    lo = (lo + Math.imul(al7, bl3)) | 0;
    mid = (mid + Math.imul(al7, bh3)) | 0;
    mid = (mid + Math.imul(ah7, bl3)) | 0;
    hi = (hi + Math.imul(ah7, bh3)) | 0;
    lo = (lo + Math.imul(al6, bl4)) | 0;
    mid = (mid + Math.imul(al6, bh4)) | 0;
    mid = (mid + Math.imul(ah6, bl4)) | 0;
    hi = (hi + Math.imul(ah6, bh4)) | 0;
    lo = (lo + Math.imul(al5, bl5)) | 0;
    mid = (mid + Math.imul(al5, bh5)) | 0;
    mid = (mid + Math.imul(ah5, bl5)) | 0;
    hi = (hi + Math.imul(ah5, bh5)) | 0;
    lo = (lo + Math.imul(al4, bl6)) | 0;
    mid = (mid + Math.imul(al4, bh6)) | 0;
    mid = (mid + Math.imul(ah4, bl6)) | 0;
    hi = (hi + Math.imul(ah4, bh6)) | 0;
    lo = (lo + Math.imul(al3, bl7)) | 0;
    mid = (mid + Math.imul(al3, bh7)) | 0;
    mid = (mid + Math.imul(ah3, bl7)) | 0;
    hi = (hi + Math.imul(ah3, bh7)) | 0;
    lo = (lo + Math.imul(al2, bl8)) | 0;
    mid = (mid + Math.imul(al2, bh8)) | 0;
    mid = (mid + Math.imul(ah2, bl8)) | 0;
    hi = (hi + Math.imul(ah2, bh8)) | 0;
    lo = (lo + Math.imul(al1, bl9)) | 0;
    mid = (mid + Math.imul(al1, bh9)) | 0;
    mid = (mid + Math.imul(ah1, bl9)) | 0;
    hi = (hi + Math.imul(ah1, bh9)) | 0;
    var w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
    w10 &= 0x3ffffff;
    /* k = 11 */
    lo = Math.imul(al9, bl2);
    mid = Math.imul(al9, bh2);
    mid = (mid + Math.imul(ah9, bl2)) | 0;
    hi = Math.imul(ah9, bh2);
    lo = (lo + Math.imul(al8, bl3)) | 0;
    mid = (mid + Math.imul(al8, bh3)) | 0;
    mid = (mid + Math.imul(ah8, bl3)) | 0;
    hi = (hi + Math.imul(ah8, bh3)) | 0;
    lo = (lo + Math.imul(al7, bl4)) | 0;
    mid = (mid + Math.imul(al7, bh4)) | 0;
    mid = (mid + Math.imul(ah7, bl4)) | 0;
    hi = (hi + Math.imul(ah7, bh4)) | 0;
    lo = (lo + Math.imul(al6, bl5)) | 0;
    mid = (mid + Math.imul(al6, bh5)) | 0;
    mid = (mid + Math.imul(ah6, bl5)) | 0;
    hi = (hi + Math.imul(ah6, bh5)) | 0;
    lo = (lo + Math.imul(al5, bl6)) | 0;
    mid = (mid + Math.imul(al5, bh6)) | 0;
    mid = (mid + Math.imul(ah5, bl6)) | 0;
    hi = (hi + Math.imul(ah5, bh6)) | 0;
    lo = (lo + Math.imul(al4, bl7)) | 0;
    mid = (mid + Math.imul(al4, bh7)) | 0;
    mid = (mid + Math.imul(ah4, bl7)) | 0;
    hi = (hi + Math.imul(ah4, bh7)) | 0;
    lo = (lo + Math.imul(al3, bl8)) | 0;
    mid = (mid + Math.imul(al3, bh8)) | 0;
    mid = (mid + Math.imul(ah3, bl8)) | 0;
    hi = (hi + Math.imul(ah3, bh8)) | 0;
    lo = (lo + Math.imul(al2, bl9)) | 0;
    mid = (mid + Math.imul(al2, bh9)) | 0;
    mid = (mid + Math.imul(ah2, bl9)) | 0;
    hi = (hi + Math.imul(ah2, bh9)) | 0;
    var w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
    w11 &= 0x3ffffff;
    /* k = 12 */
    lo = Math.imul(al9, bl3);
    mid = Math.imul(al9, bh3);
    mid = (mid + Math.imul(ah9, bl3)) | 0;
    hi = Math.imul(ah9, bh3);
    lo = (lo + Math.imul(al8, bl4)) | 0;
    mid = (mid + Math.imul(al8, bh4)) | 0;
    mid = (mid + Math.imul(ah8, bl4)) | 0;
    hi = (hi + Math.imul(ah8, bh4)) | 0;
    lo = (lo + Math.imul(al7, bl5)) | 0;
    mid = (mid + Math.imul(al7, bh5)) | 0;
    mid = (mid + Math.imul(ah7, bl5)) | 0;
    hi = (hi + Math.imul(ah7, bh5)) | 0;
    lo = (lo + Math.imul(al6, bl6)) | 0;
    mid = (mid + Math.imul(al6, bh6)) | 0;
    mid = (mid + Math.imul(ah6, bl6)) | 0;
    hi = (hi + Math.imul(ah6, bh6)) | 0;
    lo = (lo + Math.imul(al5, bl7)) | 0;
    mid = (mid + Math.imul(al5, bh7)) | 0;
    mid = (mid + Math.imul(ah5, bl7)) | 0;
    hi = (hi + Math.imul(ah5, bh7)) | 0;
    lo = (lo + Math.imul(al4, bl8)) | 0;
    mid = (mid + Math.imul(al4, bh8)) | 0;
    mid = (mid + Math.imul(ah4, bl8)) | 0;
    hi = (hi + Math.imul(ah4, bh8)) | 0;
    lo = (lo + Math.imul(al3, bl9)) | 0;
    mid = (mid + Math.imul(al3, bh9)) | 0;
    mid = (mid + Math.imul(ah3, bl9)) | 0;
    hi = (hi + Math.imul(ah3, bh9)) | 0;
    var w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
    w12 &= 0x3ffffff;
    /* k = 13 */
    lo = Math.imul(al9, bl4);
    mid = Math.imul(al9, bh4);
    mid = (mid + Math.imul(ah9, bl4)) | 0;
    hi = Math.imul(ah9, bh4);
    lo = (lo + Math.imul(al8, bl5)) | 0;
    mid = (mid + Math.imul(al8, bh5)) | 0;
    mid = (mid + Math.imul(ah8, bl5)) | 0;
    hi = (hi + Math.imul(ah8, bh5)) | 0;
    lo = (lo + Math.imul(al7, bl6)) | 0;
    mid = (mid + Math.imul(al7, bh6)) | 0;
    mid = (mid + Math.imul(ah7, bl6)) | 0;
    hi = (hi + Math.imul(ah7, bh6)) | 0;
    lo = (lo + Math.imul(al6, bl7)) | 0;
    mid = (mid + Math.imul(al6, bh7)) | 0;
    mid = (mid + Math.imul(ah6, bl7)) | 0;
    hi = (hi + Math.imul(ah6, bh7)) | 0;
    lo = (lo + Math.imul(al5, bl8)) | 0;
    mid = (mid + Math.imul(al5, bh8)) | 0;
    mid = (mid + Math.imul(ah5, bl8)) | 0;
    hi = (hi + Math.imul(ah5, bh8)) | 0;
    lo = (lo + Math.imul(al4, bl9)) | 0;
    mid = (mid + Math.imul(al4, bh9)) | 0;
    mid = (mid + Math.imul(ah4, bl9)) | 0;
    hi = (hi + Math.imul(ah4, bh9)) | 0;
    var w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
    w13 &= 0x3ffffff;
    /* k = 14 */
    lo = Math.imul(al9, bl5);
    mid = Math.imul(al9, bh5);
    mid = (mid + Math.imul(ah9, bl5)) | 0;
    hi = Math.imul(ah9, bh5);
    lo = (lo + Math.imul(al8, bl6)) | 0;
    mid = (mid + Math.imul(al8, bh6)) | 0;
    mid = (mid + Math.imul(ah8, bl6)) | 0;
    hi = (hi + Math.imul(ah8, bh6)) | 0;
    lo = (lo + Math.imul(al7, bl7)) | 0;
    mid = (mid + Math.imul(al7, bh7)) | 0;
    mid = (mid + Math.imul(ah7, bl7)) | 0;
    hi = (hi + Math.imul(ah7, bh7)) | 0;
    lo = (lo + Math.imul(al6, bl8)) | 0;
    mid = (mid + Math.imul(al6, bh8)) | 0;
    mid = (mid + Math.imul(ah6, bl8)) | 0;
    hi = (hi + Math.imul(ah6, bh8)) | 0;
    lo = (lo + Math.imul(al5, bl9)) | 0;
    mid = (mid + Math.imul(al5, bh9)) | 0;
    mid = (mid + Math.imul(ah5, bl9)) | 0;
    hi = (hi + Math.imul(ah5, bh9)) | 0;
    var w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
    w14 &= 0x3ffffff;
    /* k = 15 */
    lo = Math.imul(al9, bl6);
    mid = Math.imul(al9, bh6);
    mid = (mid + Math.imul(ah9, bl6)) | 0;
    hi = Math.imul(ah9, bh6);
    lo = (lo + Math.imul(al8, bl7)) | 0;
    mid = (mid + Math.imul(al8, bh7)) | 0;
    mid = (mid + Math.imul(ah8, bl7)) | 0;
    hi = (hi + Math.imul(ah8, bh7)) | 0;
    lo = (lo + Math.imul(al7, bl8)) | 0;
    mid = (mid + Math.imul(al7, bh8)) | 0;
    mid = (mid + Math.imul(ah7, bl8)) | 0;
    hi = (hi + Math.imul(ah7, bh8)) | 0;
    lo = (lo + Math.imul(al6, bl9)) | 0;
    mid = (mid + Math.imul(al6, bh9)) | 0;
    mid = (mid + Math.imul(ah6, bl9)) | 0;
    hi = (hi + Math.imul(ah6, bh9)) | 0;
    var w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
    w15 &= 0x3ffffff;
    /* k = 16 */
    lo = Math.imul(al9, bl7);
    mid = Math.imul(al9, bh7);
    mid = (mid + Math.imul(ah9, bl7)) | 0;
    hi = Math.imul(ah9, bh7);
    lo = (lo + Math.imul(al8, bl8)) | 0;
    mid = (mid + Math.imul(al8, bh8)) | 0;
    mid = (mid + Math.imul(ah8, bl8)) | 0;
    hi = (hi + Math.imul(ah8, bh8)) | 0;
    lo = (lo + Math.imul(al7, bl9)) | 0;
    mid = (mid + Math.imul(al7, bh9)) | 0;
    mid = (mid + Math.imul(ah7, bl9)) | 0;
    hi = (hi + Math.imul(ah7, bh9)) | 0;
    var w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
    w16 &= 0x3ffffff;
    /* k = 17 */
    lo = Math.imul(al9, bl8);
    mid = Math.imul(al9, bh8);
    mid = (mid + Math.imul(ah9, bl8)) | 0;
    hi = Math.imul(ah9, bh8);
    lo = (lo + Math.imul(al8, bl9)) | 0;
    mid = (mid + Math.imul(al8, bh9)) | 0;
    mid = (mid + Math.imul(ah8, bl9)) | 0;
    hi = (hi + Math.imul(ah8, bh9)) | 0;
    var w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
    w17 &= 0x3ffffff;
    /* k = 18 */
    lo = Math.imul(al9, bl9);
    mid = Math.imul(al9, bh9);
    mid = (mid + Math.imul(ah9, bl9)) | 0;
    hi = Math.imul(ah9, bh9);
    var w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
    c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
    w18 &= 0x3ffffff;
    o[0] = w0;
    o[1] = w1;
    o[2] = w2;
    o[3] = w3;
    o[4] = w4;
    o[5] = w5;
    o[6] = w6;
    o[7] = w7;
    o[8] = w8;
    o[9] = w9;
    o[10] = w10;
    o[11] = w11;
    o[12] = w12;
    o[13] = w13;
    o[14] = w14;
    o[15] = w15;
    o[16] = w16;
    o[17] = w17;
    o[18] = w18;
    if (c !== 0) {
      o[19] = c;
      out.length++;
    }
    return out;
  };

  // Polyfill comb
  if (!Math.imul) {
    comb10MulTo = smallMulTo;
  }

  function bigMulTo (self, num, out) {
    out.negative = num.negative ^ self.negative;
    out.length = self.length + num.length;

    var carry = 0;
    var hncarry = 0;
    for (var k = 0; k < out.length - 1; k++) {
      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
      // note that ncarry could be >= 0x3ffffff
      var ncarry = hncarry;
      hncarry = 0;
      var rword = carry & 0x3ffffff;
      var maxJ = Math.min(k, num.length - 1);
      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
        var i = k - j;
        var a = self.words[i] | 0;
        var b = num.words[j] | 0;
        var r = a * b;

        var lo = r & 0x3ffffff;
        ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
        lo = (lo + rword) | 0;
        rword = lo & 0x3ffffff;
        ncarry = (ncarry + (lo >>> 26)) | 0;

        hncarry += ncarry >>> 26;
        ncarry &= 0x3ffffff;
      }
      out.words[k] = rword;
      carry = ncarry;
      ncarry = hncarry;
    }
    if (carry !== 0) {
      out.words[k] = carry;
    } else {
      out.length--;
    }

    return out.strip();
  }

  function jumboMulTo (self, num, out) {
    var fftm = new FFTM();
    return fftm.mulp(self, num, out);
  }

  BN.prototype.mulTo = function mulTo (num, out) {
    var res;
    var len = this.length + num.length;
    if (this.length === 10 && num.length === 10) {
      res = comb10MulTo(this, num, out);
    } else if (len < 63) {
      res = smallMulTo(this, num, out);
    } else if (len < 1024) {
      res = bigMulTo(this, num, out);
    } else {
      res = jumboMulTo(this, num, out);
    }

    return res;
  };

  // Cooley-Tukey algorithm for FFT
  // slightly revisited to rely on looping instead of recursion

  function FFTM (x, y) {
    this.x = x;
    this.y = y;
  }

  FFTM.prototype.makeRBT = function makeRBT (N) {
    var t = new Array(N);
    var l = BN.prototype._countBits(N) - 1;
    for (var i = 0; i < N; i++) {
      t[i] = this.revBin(i, l, N);
    }

    return t;
  };

  // Returns binary-reversed representation of `x`
  FFTM.prototype.revBin = function revBin (x, l, N) {
    if (x === 0 || x === N - 1) return x;

    var rb = 0;
    for (var i = 0; i < l; i++) {
      rb |= (x & 1) << (l - i - 1);
      x >>= 1;
    }

    return rb;
  };

  // Performs "tweedling" phase, therefore 'emulating'
  // behaviour of the recursive algorithm
  FFTM.prototype.permute = function permute (rbt, rws, iws, rtws, itws, N) {
    for (var i = 0; i < N; i++) {
      rtws[i] = rws[rbt[i]];
      itws[i] = iws[rbt[i]];
    }
  };

  FFTM.prototype.transform = function transform (rws, iws, rtws, itws, N, rbt) {
    this.permute(rbt, rws, iws, rtws, itws, N);

    for (var s = 1; s < N; s <<= 1) {
      var l = s << 1;

      var rtwdf = Math.cos(2 * Math.PI / l);
      var itwdf = Math.sin(2 * Math.PI / l);

      for (var p = 0; p < N; p += l) {
        var rtwdf_ = rtwdf;
        var itwdf_ = itwdf;

        for (var j = 0; j < s; j++) {
          var re = rtws[p + j];
          var ie = itws[p + j];

          var ro = rtws[p + j + s];
          var io = itws[p + j + s];

          var rx = rtwdf_ * ro - itwdf_ * io;

          io = rtwdf_ * io + itwdf_ * ro;
          ro = rx;

          rtws[p + j] = re + ro;
          itws[p + j] = ie + io;

          rtws[p + j + s] = re - ro;
          itws[p + j + s] = ie - io;

          /* jshint maxdepth : false */
          if (j !== l) {
            rx = rtwdf * rtwdf_ - itwdf * itwdf_;

            itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
            rtwdf_ = rx;
          }
        }
      }
    }
  };

  FFTM.prototype.guessLen13b = function guessLen13b (n, m) {
    var N = Math.max(m, n) | 1;
    var odd = N & 1;
    var i = 0;
    for (N = N / 2 | 0; N; N = N >>> 1) {
      i++;
    }

    return 1 << i + 1 + odd;
  };

  FFTM.prototype.conjugate = function conjugate (rws, iws, N) {
    if (N <= 1) return;

    for (var i = 0; i < N / 2; i++) {
      var t = rws[i];

      rws[i] = rws[N - i - 1];
      rws[N - i - 1] = t;

      t = iws[i];

      iws[i] = -iws[N - i - 1];
      iws[N - i - 1] = -t;
    }
  };

  FFTM.prototype.normalize13b = function normalize13b (ws, N) {
    var carry = 0;
    for (var i = 0; i < N / 2; i++) {
      var w = Math.round(ws[2 * i + 1] / N) * 0x2000 +
        Math.round(ws[2 * i] / N) +
        carry;

      ws[i] = w & 0x3ffffff;

      if (w < 0x4000000) {
        carry = 0;
      } else {
        carry = w / 0x4000000 | 0;
      }
    }

    return ws;
  };

  FFTM.prototype.convert13b = function convert13b (ws, len, rws, N) {
    var carry = 0;
    for (var i = 0; i < len; i++) {
      carry = carry + (ws[i] | 0);

      rws[2 * i] = carry & 0x1fff; carry = carry >>> 13;
      rws[2 * i + 1] = carry & 0x1fff; carry = carry >>> 13;
    }

    // Pad with zeroes
    for (i = 2 * len; i < N; ++i) {
      rws[i] = 0;
    }

    assert(carry === 0);
    assert((carry & ~0x1fff) === 0);
  };

  FFTM.prototype.stub = function stub (N) {
    var ph = new Array(N);
    for (var i = 0; i < N; i++) {
      ph[i] = 0;
    }

    return ph;
  };

  FFTM.prototype.mulp = function mulp (x, y, out) {
    var N = 2 * this.guessLen13b(x.length, y.length);

    var rbt = this.makeRBT(N);

    var _ = this.stub(N);

    var rws = new Array(N);
    var rwst = new Array(N);
    var iwst = new Array(N);

    var nrws = new Array(N);
    var nrwst = new Array(N);
    var niwst = new Array(N);

    var rmws = out.words;
    rmws.length = N;

    this.convert13b(x.words, x.length, rws, N);
    this.convert13b(y.words, y.length, nrws, N);

    this.transform(rws, _, rwst, iwst, N, rbt);
    this.transform(nrws, _, nrwst, niwst, N, rbt);

    for (var i = 0; i < N; i++) {
      var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
      iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
      rwst[i] = rx;
    }

    this.conjugate(rwst, iwst, N);
    this.transform(rwst, iwst, rmws, _, N, rbt);
    this.conjugate(rmws, _, N);
    this.normalize13b(rmws, N);

    out.negative = x.negative ^ y.negative;
    out.length = x.length + y.length;
    return out.strip();
  };

  // Multiply `this` by `num`
  BN.prototype.mul = function mul (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return this.mulTo(num, out);
  };

  // Multiply employing FFT
  BN.prototype.mulf = function mulf (num) {
    var out = new BN(null);
    out.words = new Array(this.length + num.length);
    return jumboMulTo(this, num, out);
  };

  // In-place Multiplication
  BN.prototype.imul = function imul (num) {
    return this.clone().mulTo(num, this);
  };

  BN.prototype.imuln = function imuln (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);

    // Carry
    var carry = 0;
    for (var i = 0; i < this.length; i++) {
      var w = (this.words[i] | 0) * num;
      var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
      carry >>= 26;
      carry += (w / 0x4000000) | 0;
      // NOTE: lo is 27bit maximum
      carry += lo >>> 26;
      this.words[i] = lo & 0x3ffffff;
    }

    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }

    return this;
  };

  BN.prototype.muln = function muln (num) {
    return this.clone().imuln(num);
  };

  // `this` * `this`
  BN.prototype.sqr = function sqr () {
    return this.mul(this);
  };

  // `this` * `this` in-place
  BN.prototype.isqr = function isqr () {
    return this.imul(this.clone());
  };

  // Math.pow(`this`, `num`)
  BN.prototype.pow = function pow (num) {
    var w = toBitArray(num);
    if (w.length === 0) return new BN(1);

    // Skip leading zeroes
    var res = this;
    for (var i = 0; i < w.length; i++, res = res.sqr()) {
      if (w[i] !== 0) break;
    }

    if (++i < w.length) {
      for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
        if (w[i] === 0) continue;

        res = res.mul(q);
      }
    }

    return res;
  };

  // Shift-left in-place
  BN.prototype.iushln = function iushln (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;
    var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
    var i;

    if (r !== 0) {
      var carry = 0;

      for (i = 0; i < this.length; i++) {
        var newCarry = this.words[i] & carryMask;
        var c = ((this.words[i] | 0) - newCarry) << r;
        this.words[i] = c | carry;
        carry = newCarry >>> (26 - r);
      }

      if (carry) {
        this.words[i] = carry;
        this.length++;
      }
    }

    if (s !== 0) {
      for (i = this.length - 1; i >= 0; i--) {
        this.words[i + s] = this.words[i];
      }

      for (i = 0; i < s; i++) {
        this.words[i] = 0;
      }

      this.length += s;
    }

    return this.strip();
  };

  BN.prototype.ishln = function ishln (bits) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushln(bits);
  };

  // Shift-right in-place
  // NOTE: `hint` is a lowest bit before trailing zeroes
  // NOTE: if `extended` is present - it will be filled with destroyed bits
  BN.prototype.iushrn = function iushrn (bits, hint, extended) {
    assert(typeof bits === 'number' && bits >= 0);
    var h;
    if (hint) {
      h = (hint - (hint % 26)) / 26;
    } else {
      h = 0;
    }

    var r = bits % 26;
    var s = Math.min((bits - r) / 26, this.length);
    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
    var maskedWords = extended;

    h -= s;
    h = Math.max(0, h);

    // Extended mode, copy masked part
    if (maskedWords) {
      for (var i = 0; i < s; i++) {
        maskedWords.words[i] = this.words[i];
      }
      maskedWords.length = s;
    }

    if (s === 0) {
      // No-op, we should not move anything at all
    } else if (this.length > s) {
      this.length -= s;
      for (i = 0; i < this.length; i++) {
        this.words[i] = this.words[i + s];
      }
    } else {
      this.words[0] = 0;
      this.length = 1;
    }

    var carry = 0;
    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
      var word = this.words[i] | 0;
      this.words[i] = (carry << (26 - r)) | (word >>> r);
      carry = word & mask;
    }

    // Push carried bits as a mask
    if (maskedWords && carry !== 0) {
      maskedWords.words[maskedWords.length++] = carry;
    }

    if (this.length === 0) {
      this.words[0] = 0;
      this.length = 1;
    }

    return this.strip();
  };

  BN.prototype.ishrn = function ishrn (bits, hint, extended) {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushrn(bits, hint, extended);
  };

  // Shift-left
  BN.prototype.shln = function shln (bits) {
    return this.clone().ishln(bits);
  };

  BN.prototype.ushln = function ushln (bits) {
    return this.clone().iushln(bits);
  };

  // Shift-right
  BN.prototype.shrn = function shrn (bits) {
    return this.clone().ishrn(bits);
  };

  BN.prototype.ushrn = function ushrn (bits) {
    return this.clone().iushrn(bits);
  };

  // Test if n bit is set
  BN.prototype.testn = function testn (bit) {
    assert(typeof bit === 'number' && bit >= 0);
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) return false;

    // Check bit and return
    var w = this.words[s];

    return !!(w & q);
  };

  // Return only lowers bits of number (in-place)
  BN.prototype.imaskn = function imaskn (bits) {
    assert(typeof bits === 'number' && bits >= 0);
    var r = bits % 26;
    var s = (bits - r) / 26;

    assert(this.negative === 0, 'imaskn works only with positive numbers');

    if (this.length <= s) {
      return this;
    }

    if (r !== 0) {
      s++;
    }
    this.length = Math.min(s, this.length);

    if (r !== 0) {
      var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
      this.words[this.length - 1] &= mask;
    }

    return this.strip();
  };

  // Return only lowers bits of number
  BN.prototype.maskn = function maskn (bits) {
    return this.clone().imaskn(bits);
  };

  // Add plain number `num` to `this`
  BN.prototype.iaddn = function iaddn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.isubn(-num);

    // Possible sign change
    if (this.negative !== 0) {
      if (this.length === 1 && (this.words[0] | 0) < num) {
        this.words[0] = num - (this.words[0] | 0);
        this.negative = 0;
        return this;
      }

      this.negative = 0;
      this.isubn(num);
      this.negative = 1;
      return this;
    }

    // Add without checks
    return this._iaddn(num);
  };

  BN.prototype._iaddn = function _iaddn (num) {
    this.words[0] += num;

    // Carry
    for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
      this.words[i] -= 0x4000000;
      if (i === this.length - 1) {
        this.words[i + 1] = 1;
      } else {
        this.words[i + 1]++;
      }
    }
    this.length = Math.max(this.length, i + 1);

    return this;
  };

  // Subtract plain number `num` from `this`
  BN.prototype.isubn = function isubn (num) {
    assert(typeof num === 'number');
    assert(num < 0x4000000);
    if (num < 0) return this.iaddn(-num);

    if (this.negative !== 0) {
      this.negative = 0;
      this.iaddn(num);
      this.negative = 1;
      return this;
    }

    this.words[0] -= num;

    if (this.length === 1 && this.words[0] < 0) {
      this.words[0] = -this.words[0];
      this.negative = 1;
    } else {
      // Carry
      for (var i = 0; i < this.length && this.words[i] < 0; i++) {
        this.words[i] += 0x4000000;
        this.words[i + 1] -= 1;
      }
    }

    return this.strip();
  };

  BN.prototype.addn = function addn (num) {
    return this.clone().iaddn(num);
  };

  BN.prototype.subn = function subn (num) {
    return this.clone().isubn(num);
  };

  BN.prototype.iabs = function iabs () {
    this.negative = 0;

    return this;
  };

  BN.prototype.abs = function abs () {
    return this.clone().iabs();
  };

  BN.prototype._ishlnsubmul = function _ishlnsubmul (num, mul, shift) {
    var len = num.length + shift;
    var i;

    this._expand(len);

    var w;
    var carry = 0;
    for (i = 0; i < num.length; i++) {
      w = (this.words[i + shift] | 0) + carry;
      var right = (num.words[i] | 0) * mul;
      w -= right & 0x3ffffff;
      carry = (w >> 26) - ((right / 0x4000000) | 0);
      this.words[i + shift] = w & 0x3ffffff;
    }
    for (; i < this.length - shift; i++) {
      w = (this.words[i + shift] | 0) + carry;
      carry = w >> 26;
      this.words[i + shift] = w & 0x3ffffff;
    }

    if (carry === 0) return this.strip();

    // Subtraction overflow
    assert(carry === -1);
    carry = 0;
    for (i = 0; i < this.length; i++) {
      w = -(this.words[i] | 0) + carry;
      carry = w >> 26;
      this.words[i] = w & 0x3ffffff;
    }
    this.negative = 1;

    return this.strip();
  };

  BN.prototype._wordDiv = function _wordDiv (num, mode) {
    var shift = this.length - num.length;

    var a = this.clone();
    var b = num;

    // Normalize
    var bhi = b.words[b.length - 1] | 0;
    var bhiBits = this._countBits(bhi);
    shift = 26 - bhiBits;
    if (shift !== 0) {
      b = b.ushln(shift);
      a.iushln(shift);
      bhi = b.words[b.length - 1] | 0;
    }

    // Initialize quotient
    var m = a.length - b.length;
    var q;

    if (mode !== 'mod') {
      q = new BN(null);
      q.length = m + 1;
      q.words = new Array(q.length);
      for (var i = 0; i < q.length; i++) {
        q.words[i] = 0;
      }
    }

    var diff = a.clone()._ishlnsubmul(b, 1, m);
    if (diff.negative === 0) {
      a = diff;
      if (q) {
        q.words[m] = 1;
      }
    }

    for (var j = m - 1; j >= 0; j--) {
      var qj = (a.words[b.length + j] | 0) * 0x4000000 +
        (a.words[b.length + j - 1] | 0);

      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
      // (0x7ffffff)
      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

      a._ishlnsubmul(b, qj, j);
      while (a.negative !== 0) {
        qj--;
        a.negative = 0;
        a._ishlnsubmul(b, 1, j);
        if (!a.isZero()) {
          a.negative ^= 1;
        }
      }
      if (q) {
        q.words[j] = qj;
      }
    }
    if (q) {
      q.strip();
    }
    a.strip();

    // Denormalize
    if (mode !== 'div' && shift !== 0) {
      a.iushrn(shift);
    }

    return {
      div: q || null,
      mod: a
    };
  };

  // NOTE: 1) `mode` can be set to `mod` to request mod only,
  //       to `div` to request div only, or be absent to
  //       request both div & mod
  //       2) `positive` is true if unsigned mod is requested
  BN.prototype.divmod = function divmod (num, mode, positive) {
    assert(!num.isZero());

    if (this.isZero()) {
      return {
        div: new BN(0),
        mod: new BN(0)
      };
    }

    var div, mod, res;
    if (this.negative !== 0 && num.negative === 0) {
      res = this.neg().divmod(num, mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.iadd(num);
        }
      }

      return {
        div: div,
        mod: mod
      };
    }

    if (this.negative === 0 && num.negative !== 0) {
      res = this.divmod(num.neg(), mode);

      if (mode !== 'mod') {
        div = res.div.neg();
      }

      return {
        div: div,
        mod: res.mod
      };
    }

    if ((this.negative & num.negative) !== 0) {
      res = this.neg().divmod(num.neg(), mode);

      if (mode !== 'div') {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.isub(num);
        }
      }

      return {
        div: res.div,
        mod: mod
      };
    }

    // Both numbers are positive at this point

    // Strip both numbers to approximate shift value
    if (num.length > this.length || this.cmp(num) < 0) {
      return {
        div: new BN(0),
        mod: this
      };
    }

    // Very short reduction
    if (num.length === 1) {
      if (mode === 'div') {
        return {
          div: this.divn(num.words[0]),
          mod: null
        };
      }

      if (mode === 'mod') {
        return {
          div: null,
          mod: new BN(this.modn(num.words[0]))
        };
      }

      return {
        div: this.divn(num.words[0]),
        mod: new BN(this.modn(num.words[0]))
      };
    }

    return this._wordDiv(num, mode);
  };

  // Find `this` / `num`
  BN.prototype.div = function div (num) {
    return this.divmod(num, 'div', false).div;
  };

  // Find `this` % `num`
  BN.prototype.mod = function mod (num) {
    return this.divmod(num, 'mod', false).mod;
  };

  BN.prototype.umod = function umod (num) {
    return this.divmod(num, 'mod', true).mod;
  };

  // Find Round(`this` / `num`)
  BN.prototype.divRound = function divRound (num) {
    var dm = this.divmod(num);

    // Fast case - exact division
    if (dm.mod.isZero()) return dm.div;

    var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;

    var half = num.ushrn(1);
    var r2 = num.andln(1);
    var cmp = mod.cmp(half);

    // Round down
    if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;

    // Round up
    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  };

  BN.prototype.modn = function modn (num) {
    assert(num <= 0x3ffffff);
    var p = (1 << 26) % num;

    var acc = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      acc = (p * acc + (this.words[i] | 0)) % num;
    }

    return acc;
  };

  // In-place division by number
  BN.prototype.idivn = function idivn (num) {
    assert(num <= 0x3ffffff);

    var carry = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var w = (this.words[i] | 0) + carry * 0x4000000;
      this.words[i] = (w / num) | 0;
      carry = w % num;
    }

    return this.strip();
  };

  BN.prototype.divn = function divn (num) {
    return this.clone().idivn(num);
  };

  BN.prototype.egcd = function egcd (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var x = this;
    var y = p.clone();

    if (x.negative !== 0) {
      x = x.umod(p);
    } else {
      x = x.clone();
    }

    // A * x + B * y = x
    var A = new BN(1);
    var B = new BN(0);

    // C * x + D * y = y
    var C = new BN(0);
    var D = new BN(1);

    var g = 0;

    while (x.isEven() && y.isEven()) {
      x.iushrn(1);
      y.iushrn(1);
      ++g;
    }

    var yp = y.clone();
    var xp = x.clone();

    while (!x.isZero()) {
      for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        x.iushrn(i);
        while (i-- > 0) {
          if (A.isOdd() || B.isOdd()) {
            A.iadd(yp);
            B.isub(xp);
          }

          A.iushrn(1);
          B.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        y.iushrn(j);
        while (j-- > 0) {
          if (C.isOdd() || D.isOdd()) {
            C.iadd(yp);
            D.isub(xp);
          }

          C.iushrn(1);
          D.iushrn(1);
        }
      }

      if (x.cmp(y) >= 0) {
        x.isub(y);
        A.isub(C);
        B.isub(D);
      } else {
        y.isub(x);
        C.isub(A);
        D.isub(B);
      }
    }

    return {
      a: C,
      b: D,
      gcd: y.iushln(g)
    };
  };

  // This is reduced incarnation of the binary EEA
  // above, designated to invert members of the
  // _prime_ fields F(p) at a maximal speed
  BN.prototype._invmp = function _invmp (p) {
    assert(p.negative === 0);
    assert(!p.isZero());

    var a = this;
    var b = p.clone();

    if (a.negative !== 0) {
      a = a.umod(p);
    } else {
      a = a.clone();
    }

    var x1 = new BN(1);
    var x2 = new BN(0);

    var delta = b.clone();

    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
      for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        a.iushrn(i);
        while (i-- > 0) {
          if (x1.isOdd()) {
            x1.iadd(delta);
          }

          x1.iushrn(1);
        }
      }

      for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        b.iushrn(j);
        while (j-- > 0) {
          if (x2.isOdd()) {
            x2.iadd(delta);
          }

          x2.iushrn(1);
        }
      }

      if (a.cmp(b) >= 0) {
        a.isub(b);
        x1.isub(x2);
      } else {
        b.isub(a);
        x2.isub(x1);
      }
    }

    var res;
    if (a.cmpn(1) === 0) {
      res = x1;
    } else {
      res = x2;
    }

    if (res.cmpn(0) < 0) {
      res.iadd(p);
    }

    return res;
  };

  BN.prototype.gcd = function gcd (num) {
    if (this.isZero()) return num.abs();
    if (num.isZero()) return this.abs();

    var a = this.clone();
    var b = num.clone();
    a.negative = 0;
    b.negative = 0;

    // Remove common factor of two
    for (var shift = 0; a.isEven() && b.isEven(); shift++) {
      a.iushrn(1);
      b.iushrn(1);
    }

    do {
      while (a.isEven()) {
        a.iushrn(1);
      }
      while (b.isEven()) {
        b.iushrn(1);
      }

      var r = a.cmp(b);
      if (r < 0) {
        // Swap `a` and `b` to make `a` always bigger than `b`
        var t = a;
        a = b;
        b = t;
      } else if (r === 0 || b.cmpn(1) === 0) {
        break;
      }

      a.isub(b);
    } while (true);

    return b.iushln(shift);
  };

  // Invert number in the field F(num)
  BN.prototype.invm = function invm (num) {
    return this.egcd(num).a.umod(num);
  };

  BN.prototype.isEven = function isEven () {
    return (this.words[0] & 1) === 0;
  };

  BN.prototype.isOdd = function isOdd () {
    return (this.words[0] & 1) === 1;
  };

  // And first word and num
  BN.prototype.andln = function andln (num) {
    return this.words[0] & num;
  };

  // Increment at the bit position in-line
  BN.prototype.bincn = function bincn (bit) {
    assert(typeof bit === 'number');
    var r = bit % 26;
    var s = (bit - r) / 26;
    var q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) {
      this._expand(s + 1);
      this.words[s] |= q;
      return this;
    }

    // Add bit and propagate, if needed
    var carry = q;
    for (var i = s; carry !== 0 && i < this.length; i++) {
      var w = this.words[i] | 0;
      w += carry;
      carry = w >>> 26;
      w &= 0x3ffffff;
      this.words[i] = w;
    }
    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }
    return this;
  };

  BN.prototype.isZero = function isZero () {
    return this.length === 1 && this.words[0] === 0;
  };

  BN.prototype.cmpn = function cmpn (num) {
    var negative = num < 0;

    if (this.negative !== 0 && !negative) return -1;
    if (this.negative === 0 && negative) return 1;

    this.strip();

    var res;
    if (this.length > 1) {
      res = 1;
    } else {
      if (negative) {
        num = -num;
      }

      assert(num <= 0x3ffffff, 'Number is too big');

      var w = this.words[0] | 0;
      res = w === num ? 0 : w < num ? -1 : 1;
    }
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Compare two numbers and return:
  // 1 - if `this` > `num`
  // 0 - if `this` == `num`
  // -1 - if `this` < `num`
  BN.prototype.cmp = function cmp (num) {
    if (this.negative !== 0 && num.negative === 0) return -1;
    if (this.negative === 0 && num.negative !== 0) return 1;

    var res = this.ucmp(num);
    if (this.negative !== 0) return -res | 0;
    return res;
  };

  // Unsigned comparison
  BN.prototype.ucmp = function ucmp (num) {
    // At this point both numbers have the same sign
    if (this.length > num.length) return 1;
    if (this.length < num.length) return -1;

    var res = 0;
    for (var i = this.length - 1; i >= 0; i--) {
      var a = this.words[i] | 0;
      var b = num.words[i] | 0;

      if (a === b) continue;
      if (a < b) {
        res = -1;
      } else if (a > b) {
        res = 1;
      }
      break;
    }
    return res;
  };

  BN.prototype.gtn = function gtn (num) {
    return this.cmpn(num) === 1;
  };

  BN.prototype.gt = function gt (num) {
    return this.cmp(num) === 1;
  };

  BN.prototype.gten = function gten (num) {
    return this.cmpn(num) >= 0;
  };

  BN.prototype.gte = function gte (num) {
    return this.cmp(num) >= 0;
  };

  BN.prototype.ltn = function ltn (num) {
    return this.cmpn(num) === -1;
  };

  BN.prototype.lt = function lt (num) {
    return this.cmp(num) === -1;
  };

  BN.prototype.lten = function lten (num) {
    return this.cmpn(num) <= 0;
  };

  BN.prototype.lte = function lte (num) {
    return this.cmp(num) <= 0;
  };

  BN.prototype.eqn = function eqn (num) {
    return this.cmpn(num) === 0;
  };

  BN.prototype.eq = function eq (num) {
    return this.cmp(num) === 0;
  };

  //
  // A reduce context, could be using montgomery or something better, depending
  // on the `m` itself.
  //
  BN.red = function red (num) {
    return new Red(num);
  };

  BN.prototype.toRed = function toRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    assert(this.negative === 0, 'red works only with positives');
    return ctx.convertTo(this)._forceRed(ctx);
  };

  BN.prototype.fromRed = function fromRed () {
    assert(this.red, 'fromRed works only with numbers in reduction context');
    return this.red.convertFrom(this);
  };

  BN.prototype._forceRed = function _forceRed (ctx) {
    this.red = ctx;
    return this;
  };

  BN.prototype.forceRed = function forceRed (ctx) {
    assert(!this.red, 'Already a number in reduction context');
    return this._forceRed(ctx);
  };

  BN.prototype.redAdd = function redAdd (num) {
    assert(this.red, 'redAdd works only with red numbers');
    return this.red.add(this, num);
  };

  BN.prototype.redIAdd = function redIAdd (num) {
    assert(this.red, 'redIAdd works only with red numbers');
    return this.red.iadd(this, num);
  };

  BN.prototype.redSub = function redSub (num) {
    assert(this.red, 'redSub works only with red numbers');
    return this.red.sub(this, num);
  };

  BN.prototype.redISub = function redISub (num) {
    assert(this.red, 'redISub works only with red numbers');
    return this.red.isub(this, num);
  };

  BN.prototype.redShl = function redShl (num) {
    assert(this.red, 'redShl works only with red numbers');
    return this.red.shl(this, num);
  };

  BN.prototype.redMul = function redMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.mul(this, num);
  };

  BN.prototype.redIMul = function redIMul (num) {
    assert(this.red, 'redMul works only with red numbers');
    this.red._verify2(this, num);
    return this.red.imul(this, num);
  };

  BN.prototype.redSqr = function redSqr () {
    assert(this.red, 'redSqr works only with red numbers');
    this.red._verify1(this);
    return this.red.sqr(this);
  };

  BN.prototype.redISqr = function redISqr () {
    assert(this.red, 'redISqr works only with red numbers');
    this.red._verify1(this);
    return this.red.isqr(this);
  };

  // Square root over p
  BN.prototype.redSqrt = function redSqrt () {
    assert(this.red, 'redSqrt works only with red numbers');
    this.red._verify1(this);
    return this.red.sqrt(this);
  };

  BN.prototype.redInvm = function redInvm () {
    assert(this.red, 'redInvm works only with red numbers');
    this.red._verify1(this);
    return this.red.invm(this);
  };

  // Return negative clone of `this` % `red modulo`
  BN.prototype.redNeg = function redNeg () {
    assert(this.red, 'redNeg works only with red numbers');
    this.red._verify1(this);
    return this.red.neg(this);
  };

  BN.prototype.redPow = function redPow (num) {
    assert(this.red && !num.red, 'redPow(normalNum)');
    this.red._verify1(this);
    return this.red.pow(this, num);
  };

  // Prime numbers with efficient reduction
  var primes = {
    k256: null,
    p224: null,
    p192: null,
    p25519: null
  };

  // Pseudo-Mersenne prime
  function MPrime (name, p) {
    // P = 2 ^ N - K
    this.name = name;
    this.p = new BN(p, 16);
    this.n = this.p.bitLength();
    this.k = new BN(1).iushln(this.n).isub(this.p);

    this.tmp = this._tmp();
  }

  MPrime.prototype._tmp = function _tmp () {
    var tmp = new BN(null);
    tmp.words = new Array(Math.ceil(this.n / 13));
    return tmp;
  };

  MPrime.prototype.ireduce = function ireduce (num) {
    // Assumes that `num` is less than `P^2`
    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
    var r = num;
    var rlen;

    do {
      this.split(r, this.tmp);
      r = this.imulK(r);
      r = r.iadd(this.tmp);
      rlen = r.bitLength();
    } while (rlen > this.n);

    var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
    if (cmp === 0) {
      r.words[0] = 0;
      r.length = 1;
    } else if (cmp > 0) {
      r.isub(this.p);
    } else {
      r.strip();
    }

    return r;
  };

  MPrime.prototype.split = function split (input, out) {
    input.iushrn(this.n, 0, out);
  };

  MPrime.prototype.imulK = function imulK (num) {
    return num.imul(this.k);
  };

  function K256 () {
    MPrime.call(
      this,
      'k256',
      'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
  }
  inherits(K256, MPrime);

  K256.prototype.split = function split (input, output) {
    // 256 = 9 * 26 + 22
    var mask = 0x3fffff;

    var outLen = Math.min(input.length, 9);
    for (var i = 0; i < outLen; i++) {
      output.words[i] = input.words[i];
    }
    output.length = outLen;

    if (input.length <= 9) {
      input.words[0] = 0;
      input.length = 1;
      return;
    }

    // Shift by 9 limbs
    var prev = input.words[9];
    output.words[output.length++] = prev & mask;

    for (i = 10; i < input.length; i++) {
      var next = input.words[i] | 0;
      input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
      prev = next;
    }
    prev >>>= 22;
    input.words[i - 10] = prev;
    if (prev === 0 && input.length > 10) {
      input.length -= 10;
    } else {
      input.length -= 9;
    }
  };

  K256.prototype.imulK = function imulK (num) {
    // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
    num.words[num.length] = 0;
    num.words[num.length + 1] = 0;
    num.length += 2;

    // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
    var lo = 0;
    for (var i = 0; i < num.length; i++) {
      var w = num.words[i] | 0;
      lo += w * 0x3d1;
      num.words[i] = lo & 0x3ffffff;
      lo = w * 0x40 + ((lo / 0x4000000) | 0);
    }

    // Fast length reduction
    if (num.words[num.length - 1] === 0) {
      num.length--;
      if (num.words[num.length - 1] === 0) {
        num.length--;
      }
    }
    return num;
  };

  function P224 () {
    MPrime.call(
      this,
      'p224',
      'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
  }
  inherits(P224, MPrime);

  function P192 () {
    MPrime.call(
      this,
      'p192',
      'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
  }
  inherits(P192, MPrime);

  function P25519 () {
    // 2 ^ 255 - 19
    MPrime.call(
      this,
      '25519',
      '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
  }
  inherits(P25519, MPrime);

  P25519.prototype.imulK = function imulK (num) {
    // K = 0x13
    var carry = 0;
    for (var i = 0; i < num.length; i++) {
      var hi = (num.words[i] | 0) * 0x13 + carry;
      var lo = hi & 0x3ffffff;
      hi >>>= 26;

      num.words[i] = lo;
      carry = hi;
    }
    if (carry !== 0) {
      num.words[num.length++] = carry;
    }
    return num;
  };

  // Exported mostly for testing purposes, use plain name instead
  BN._prime = function prime (name) {
    // Cached version of prime
    if (primes[name]) return primes[name];

    var prime;
    if (name === 'k256') {
      prime = new K256();
    } else if (name === 'p224') {
      prime = new P224();
    } else if (name === 'p192') {
      prime = new P192();
    } else if (name === 'p25519') {
      prime = new P25519();
    } else {
      throw new Error('Unknown prime ' + name);
    }
    primes[name] = prime;

    return prime;
  };

  //
  // Base reduction engine
  //
  function Red (m) {
    if (typeof m === 'string') {
      var prime = BN._prime(m);
      this.m = prime.p;
      this.prime = prime;
    } else {
      assert(m.gtn(1), 'modulus must be greater than 1');
      this.m = m;
      this.prime = null;
    }
  }

  Red.prototype._verify1 = function _verify1 (a) {
    assert(a.negative === 0, 'red works only with positives');
    assert(a.red, 'red works only with red numbers');
  };

  Red.prototype._verify2 = function _verify2 (a, b) {
    assert((a.negative | b.negative) === 0, 'red works only with positives');
    assert(a.red && a.red === b.red,
      'red works only with red numbers');
  };

  Red.prototype.imod = function imod (a) {
    if (this.prime) return this.prime.ireduce(a)._forceRed(this);
    return a.umod(this.m)._forceRed(this);
  };

  Red.prototype.neg = function neg (a) {
    if (a.isZero()) {
      return a.clone();
    }

    return this.m.sub(a)._forceRed(this);
  };

  Red.prototype.add = function add (a, b) {
    this._verify2(a, b);

    var res = a.add(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.iadd = function iadd (a, b) {
    this._verify2(a, b);

    var res = a.iadd(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res;
  };

  Red.prototype.sub = function sub (a, b) {
    this._verify2(a, b);

    var res = a.sub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res._forceRed(this);
  };

  Red.prototype.isub = function isub (a, b) {
    this._verify2(a, b);

    var res = a.isub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res;
  };

  Red.prototype.shl = function shl (a, num) {
    this._verify1(a);
    return this.imod(a.ushln(num));
  };

  Red.prototype.imul = function imul (a, b) {
    this._verify2(a, b);
    return this.imod(a.imul(b));
  };

  Red.prototype.mul = function mul (a, b) {
    this._verify2(a, b);
    return this.imod(a.mul(b));
  };

  Red.prototype.isqr = function isqr (a) {
    return this.imul(a, a.clone());
  };

  Red.prototype.sqr = function sqr (a) {
    return this.mul(a, a);
  };

  Red.prototype.sqrt = function sqrt (a) {
    if (a.isZero()) return a.clone();

    var mod3 = this.m.andln(3);
    assert(mod3 % 2 === 1);

    // Fast case
    if (mod3 === 3) {
      var pow = this.m.add(new BN(1)).iushrn(2);
      return this.pow(a, pow);
    }

    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
    //
    // Find Q and S, that Q * 2 ^ S = (P - 1)
    var q = this.m.subn(1);
    var s = 0;
    while (!q.isZero() && q.andln(1) === 0) {
      s++;
      q.iushrn(1);
    }
    assert(!q.isZero());

    var one = new BN(1).toRed(this);
    var nOne = one.redNeg();

    // Find quadratic non-residue
    // NOTE: Max is such because of generalized Riemann hypothesis.
    var lpow = this.m.subn(1).iushrn(1);
    var z = this.m.bitLength();
    z = new BN(2 * z * z).toRed(this);

    while (this.pow(z, lpow).cmp(nOne) !== 0) {
      z.redIAdd(nOne);
    }

    var c = this.pow(z, q);
    var r = this.pow(a, q.addn(1).iushrn(1));
    var t = this.pow(a, q);
    var m = s;
    while (t.cmp(one) !== 0) {
      var tmp = t;
      for (var i = 0; tmp.cmp(one) !== 0; i++) {
        tmp = tmp.redSqr();
      }
      assert(i < m);
      var b = this.pow(c, new BN(1).iushln(m - i - 1));

      r = r.redMul(b);
      c = b.redSqr();
      t = t.redMul(c);
      m = i;
    }

    return r;
  };

  Red.prototype.invm = function invm (a) {
    var inv = a._invmp(this.m);
    if (inv.negative !== 0) {
      inv.negative = 0;
      return this.imod(inv).redNeg();
    } else {
      return this.imod(inv);
    }
  };

  Red.prototype.pow = function pow (a, num) {
    if (num.isZero()) return new BN(1).toRed(this);
    if (num.cmpn(1) === 0) return a.clone();

    var windowSize = 4;
    var wnd = new Array(1 << windowSize);
    wnd[0] = new BN(1).toRed(this);
    wnd[1] = a;
    for (var i = 2; i < wnd.length; i++) {
      wnd[i] = this.mul(wnd[i - 1], a);
    }

    var res = wnd[0];
    var current = 0;
    var currentLen = 0;
    var start = num.bitLength() % 26;
    if (start === 0) {
      start = 26;
    }

    for (i = num.length - 1; i >= 0; i--) {
      var word = num.words[i];
      for (var j = start - 1; j >= 0; j--) {
        var bit = (word >> j) & 1;
        if (res !== wnd[0]) {
          res = this.sqr(res);
        }

        if (bit === 0 && current === 0) {
          currentLen = 0;
          continue;
        }

        current <<= 1;
        current |= bit;
        currentLen++;
        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

        res = this.mul(res, wnd[current]);
        currentLen = 0;
        current = 0;
      }
      start = 26;
    }

    return res;
  };

  Red.prototype.convertTo = function convertTo (num) {
    var r = num.umod(this.m);

    return r === num ? r.clone() : r;
  };

  Red.prototype.convertFrom = function convertFrom (num) {
    var res = num.clone();
    res.red = null;
    return res;
  };

  //
  // Montgomery method engine
  //

  BN.mont = function mont (num) {
    return new Mont(num);
  };

  function Mont (m) {
    Red.call(this, m);

    this.shift = this.m.bitLength();
    if (this.shift % 26 !== 0) {
      this.shift += 26 - (this.shift % 26);
    }

    this.r = new BN(1).iushln(this.shift);
    this.r2 = this.imod(this.r.sqr());
    this.rinv = this.r._invmp(this.m);

    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
    this.minv = this.minv.umod(this.r);
    this.minv = this.r.sub(this.minv);
  }
  inherits(Mont, Red);

  Mont.prototype.convertTo = function convertTo (num) {
    return this.imod(num.ushln(this.shift));
  };

  Mont.prototype.convertFrom = function convertFrom (num) {
    var r = this.imod(num.mul(this.rinv));
    r.red = null;
    return r;
  };

  Mont.prototype.imul = function imul (a, b) {
    if (a.isZero() || b.isZero()) {
      a.words[0] = 0;
      a.length = 1;
      return a;
    }

    var t = a.imul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;

    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.mul = function mul (a, b) {
    if (a.isZero() || b.isZero()) return new BN(0)._forceRed(this);

    var t = a.mul(b);
    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    var u = t.isub(c).iushrn(this.shift);
    var res = u;
    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }

    return res._forceRed(this);
  };

  Mont.prototype.invm = function invm (a) {
    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
    var res = this.imod(a._invmp(this.m).mul(this.r2));
    return res._forceRed(this);
  };
})(typeof module === 'undefined' || module, this);

},{"buffer":19}],19:[function(require,module,exports){

},{}],20:[function(require,module,exports){
(function (Buffer){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this,require("buffer").Buffer)
},{"base64-js":16,"buffer":20,"ieee754":22}],21:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],22:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],23:[function(require,module,exports){
(function (Buffer){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLength = exports.decode = exports.encode = void 0;
var BN = require("bn.js");
/**
 * RLP Encoding based on: https://github.com/ethereum/wiki/wiki/%5BEnglish%5D-RLP
 * This function takes in a data, convert it to buffer if not, and a length for recursion
 * @param input - will be converted to buffer
 * @returns returns buffer of encoded data
 **/
function encode(input) {
    if (Array.isArray(input)) {
        var output = [];
        for (var i = 0; i < input.length; i++) {
            output.push(encode(input[i]));
        }
        var buf = Buffer.concat(output);
        return Buffer.concat([encodeLength(buf.length, 192), buf]);
    }
    else {
        var inputBuf = toBuffer(input);
        return inputBuf.length === 1 && inputBuf[0] < 128
            ? inputBuf
            : Buffer.concat([encodeLength(inputBuf.length, 128), inputBuf]);
    }
}
exports.encode = encode;
/**
 * Parse integers. Check if there is no leading zeros
 * @param v The value to parse
 * @param base The base to parse the integer into
 */
function safeParseInt(v, base) {
    if (v.slice(0, 2) === '00') {
        throw new Error('invalid RLP: extra zeros');
    }
    return parseInt(v, base);
}
function encodeLength(len, offset) {
    if (len < 56) {
        return Buffer.from([len + offset]);
    }
    else {
        var hexLength = intToHex(len);
        var lLength = hexLength.length / 2;
        var firstByte = intToHex(offset + 55 + lLength);
        return Buffer.from(firstByte + hexLength, 'hex');
    }
}
function decode(input, stream) {
    if (stream === void 0) { stream = false; }
    if (!input || input.length === 0) {
        return Buffer.from([]);
    }
    var inputBuffer = toBuffer(input);
    var decoded = _decode(inputBuffer);
    if (stream) {
        return decoded;
    }
    if (decoded.remainder.length !== 0) {
        throw new Error('invalid remainder');
    }
    return decoded.data;
}
exports.decode = decode;
/**
 * Get the length of the RLP input
 * @param input
 * @returns The length of the input or an empty Buffer if no input
 */
function getLength(input) {
    if (!input || input.length === 0) {
        return Buffer.from([]);
    }
    var inputBuffer = toBuffer(input);
    var firstByte = inputBuffer[0];
    if (firstByte <= 0x7f) {
        return inputBuffer.length;
    }
    else if (firstByte <= 0xb7) {
        return firstByte - 0x7f;
    }
    else if (firstByte <= 0xbf) {
        return firstByte - 0xb6;
    }
    else if (firstByte <= 0xf7) {
        // a list between  0-55 bytes long
        return firstByte - 0xbf;
    }
    else {
        // a list  over 55 bytes long
        var llength = firstByte - 0xf6;
        var length = safeParseInt(inputBuffer.slice(1, llength).toString('hex'), 16);
        return llength + length;
    }
}
exports.getLength = getLength;
/** Decode an input with RLP */
function _decode(input) {
    var length, llength, data, innerRemainder, d;
    var decoded = [];
    var firstByte = input[0];
    if (firstByte <= 0x7f) {
        // a single byte whose value is in the [0x00, 0x7f] range, that byte is its own RLP encoding.
        return {
            data: input.slice(0, 1),
            remainder: input.slice(1),
        };
    }
    else if (firstByte <= 0xb7) {
        // string is 0-55 bytes long. A single byte with value 0x80 plus the length of the string followed by the string
        // The range of the first byte is [0x80, 0xb7]
        length = firstByte - 0x7f;
        // set 0x80 null to 0
        if (firstByte === 0x80) {
            data = Buffer.from([]);
        }
        else {
            data = input.slice(1, length);
        }
        if (length === 2 && data[0] < 0x80) {
            throw new Error('invalid rlp encoding: byte must be less 0x80');
        }
        return {
            data: data,
            remainder: input.slice(length),
        };
    }
    else if (firstByte <= 0xbf) {
        // string is greater than 55 bytes long. A single byte with the value (0xb7 plus the length of the length),
        // followed by the length, followed by the string
        llength = firstByte - 0xb6;
        if (input.length - 1 < llength) {
            throw new Error('invalid RLP: not enough bytes for string length');
        }
        length = safeParseInt(input.slice(1, llength).toString('hex'), 16);
        if (length <= 55) {
            throw new Error('invalid RLP: expected string length to be greater than 55');
        }
        data = input.slice(llength, length + llength);
        if (data.length < length) {
            throw new Error('invalid RLP: not enough bytes for string');
        }
        return {
            data: data,
            remainder: input.slice(length + llength),
        };
    }
    else if (firstByte <= 0xf7) {
        // a list between  0-55 bytes long
        length = firstByte - 0xbf;
        innerRemainder = input.slice(1, length);
        while (innerRemainder.length) {
            d = _decode(innerRemainder);
            decoded.push(d.data);
            innerRemainder = d.remainder;
        }
        return {
            data: decoded,
            remainder: input.slice(length),
        };
    }
    else {
        // a list  over 55 bytes long
        llength = firstByte - 0xf6;
        length = safeParseInt(input.slice(1, llength).toString('hex'), 16);
        var totalLength = llength + length;
        if (totalLength > input.length) {
            throw new Error('invalid rlp: total length is larger than the data');
        }
        innerRemainder = input.slice(llength, totalLength);
        if (innerRemainder.length === 0) {
            throw new Error('invalid rlp, List has a invalid length');
        }
        while (innerRemainder.length) {
            d = _decode(innerRemainder);
            decoded.push(d.data);
            innerRemainder = d.remainder;
        }
        return {
            data: decoded,
            remainder: input.slice(totalLength),
        };
    }
}
/** Check if a string is prefixed by 0x */
function isHexPrefixed(str) {
    return str.slice(0, 2) === '0x';
}
/** Removes 0x from a given String */
function stripHexPrefix(str) {
    if (typeof str !== 'string') {
        return str;
    }
    return isHexPrefixed(str) ? str.slice(2) : str;
}
/** Transform an integer into its hexadecimal value */
function intToHex(integer) {
    if (integer < 0) {
        throw new Error('Invalid integer as argument, must be unsigned!');
    }
    var hex = integer.toString(16);
    return hex.length % 2 ? "0" + hex : hex;
}
/** Pad a string to be even */
function padToEven(a) {
    return a.length % 2 ? "0" + a : a;
}
/** Transform an integer into a Buffer */
function intToBuffer(integer) {
    var hex = intToHex(integer);
    return Buffer.from(hex, 'hex');
}
/** Transform anything into a Buffer */
function toBuffer(v) {
    if (!Buffer.isBuffer(v)) {
        if (typeof v === 'string') {
            if (isHexPrefixed(v)) {
                return Buffer.from(padToEven(stripHexPrefix(v)), 'hex');
            }
            else {
                return Buffer.from(v);
            }
        }
        else if (typeof v === 'number' || typeof v === 'bigint') {
            if (!v) {
                return Buffer.from([]);
            }
            else {
                return intToBuffer(v);
            }
        }
        else if (v === null || v === undefined) {
            return Buffer.from([]);
        }
        else if (v instanceof Uint8Array) {
            return Buffer.from(v);
        }
        else if (BN.isBN(v)) {
            // converts a BN to a Buffer
            return Buffer.from(v.toArray());
        }
        else {
            throw new Error('invalid type');
        }
    }
    return v;
}

}).call(this,require("buffer").Buffer)
},{"bn.js":18,"buffer":20}],24:[function(require,module,exports){
'use strict';
module.exports = require( './lib/u2f-api' );
},{"./lib/u2f-api":26}],25:[function(require,module,exports){
// Copyright 2014 Google Inc. All rights reserved
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * @fileoverview The U2F api.
 */

'use strict';

/** Namespace for the U2F api.
 * @type {Object}
 */
var u2f = u2f || {};

module.exports = u2f; // Adaptation for u2f-api package

/**
 * The U2F extension id
 * @type {string}
 * @const
 */
u2f.EXTENSION_ID = 'kmendfapggjehodndflmmgagdbamhnfd';

/**
 * Message types for messsages to/from the extension
 * @const
 * @enum {string}
 */
u2f.MessageTypes = {
  'U2F_REGISTER_REQUEST': 'u2f_register_request',
  'U2F_SIGN_REQUEST': 'u2f_sign_request',
  'U2F_REGISTER_RESPONSE': 'u2f_register_response',
  'U2F_SIGN_RESPONSE': 'u2f_sign_response'
};

/**
 * Response status codes
 * @const
 * @enum {number}
 */
u2f.ErrorCodes = {
  'OK': 0,
  'OTHER_ERROR': 1,
  'BAD_REQUEST': 2,
  'CONFIGURATION_UNSUPPORTED': 3,
  'DEVICE_INELIGIBLE': 4,
  'TIMEOUT': 5
};

/**
 * A message type for registration requests
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   signRequests: Array.<u2f.SignRequest>,
 *   registerRequests: ?Array.<u2f.RegisterRequest>,
 *   timeoutSeconds: ?number,
 *   requestId: ?number
 * }}
 */
u2f.Request;

/**
 * A message for registration responses
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   responseData: (u2f.Error | u2f.RegisterResponse | u2f.SignResponse),
 *   requestId: ?number
 * }}
 */
u2f.Response;

/**
 * An error object for responses
 * @typedef {{
 *   errorCode: u2f.ErrorCodes,
 *   errorMessage: ?string
 * }}
 */
u2f.Error;

/**
 * Data object for a single sign request.
 * @typedef {{
 *   version: string,
 *   challenge: string,
 *   keyHandle: string,
 *   appId: string
 * }}
 */
u2f.SignRequest;

/**
 * Data object for a sign response.
 * @typedef {{
 *   keyHandle: string,
 *   signatureData: string,
 *   clientData: string
 * }}
 */
u2f.SignResponse;

/**
 * Data object for a registration request.
 * @typedef {{
 *   version: string,
 *   challenge: string,
 *   appId: string
 * }}
 */
u2f.RegisterRequest;

/**
 * Data object for a registration response.
 * @typedef {{
 *   registrationData: string,
 *   clientData: string
 * }}
 */
u2f.RegisterResponse;


// Low level MessagePort API support

/**
 * Call MessagePort disconnect
 */
u2f.disconnect = function() {
  if (u2f.port_ && u2f.port_.port_) {
    u2f.port_.port_.disconnect();
    u2f.port_ = null;
  }
};

/**
 * Sets up a MessagePort to the U2F extension using the
 * available mechanisms.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 */
u2f.getMessagePort = function(callback) {
  if (typeof chrome != 'undefined' && chrome.runtime) {
    // The actual message here does not matter, but we need to get a reply
    // for the callback to run. Thus, send an empty signature request
    // in order to get a failure response.
    var msg = {
      type: u2f.MessageTypes.U2F_SIGN_REQUEST,
      signRequests: []
    };
    chrome.runtime.sendMessage(u2f.EXTENSION_ID, msg, function() {
      if (!chrome.runtime.lastError) {
        // We are on a whitelisted origin and can talk directly
        // with the extension.
        u2f.getChromeRuntimePort_(callback);
      } else {
        // chrome.runtime was available, but we couldn't message
        // the extension directly, use iframe
        u2f.getIframePort_(callback);
      }
    });
  } else {
    // chrome.runtime was not available at all, which is normal
    // when this origin doesn't have access to any extensions.
    u2f.getIframePort_(callback);
  }
};

/**
 * Connects directly to the extension via chrome.runtime.connect
 * @param {function(u2f.WrappedChromeRuntimePort_)} callback
 * @private
 */
u2f.getChromeRuntimePort_ = function(callback) {
  var port = chrome.runtime.connect(u2f.EXTENSION_ID,
    {'includeTlsChannelId': true});
  setTimeout(function() {
    callback(null, new u2f.WrappedChromeRuntimePort_(port));
  }, 0);
};

/**
 * A wrapper for chrome.runtime.Port that is compatible with MessagePort.
 * @param {Port} port
 * @constructor
 * @private
 */
u2f.WrappedChromeRuntimePort_ = function(port) {
  this.port_ = port;
};

/**
 * Posts a message on the underlying channel.
 * @param {Object} message
 */
u2f.WrappedChromeRuntimePort_.prototype.postMessage = function(message) {
  this.port_.postMessage(message);
};

/**
 * Emulates the HTML 5 addEventListener interface. Works only for the
 * onmessage event, which is hooked up to the chrome.runtime.Port.onMessage.
 * @param {string} eventName
 * @param {function({data: Object})} handler
 */
u2f.WrappedChromeRuntimePort_.prototype.addEventListener =
    function(eventName, handler) {
  var name = eventName.toLowerCase();
  if (name == 'message' || name == 'onmessage') {
    this.port_.onMessage.addListener(function(message) {
      // Emulate a minimal MessageEvent object
      handler({'data': message});
    });
  } else {
    console.error('WrappedChromeRuntimePort only supports onMessage');
  }
};

/**
 * Sets up an embedded trampoline iframe, sourced from the extension.
 * @param {function(MessagePort)} callback
 * @private
 */
u2f.getIframePort_ = function(callback) {
  // Create the iframe
  var iframeOrigin = 'chrome-extension://' + u2f.EXTENSION_ID;
  var iframe = document.createElement('iframe');
  iframe.src = iframeOrigin + '/u2f-comms.html';
  iframe.setAttribute('style', 'display:none');
  document.body.appendChild(iframe);

  var hasCalledBack = false;

  var channel = new MessageChannel();
  var ready = function(message) {
    if (message.data == 'ready') {
      channel.port1.removeEventListener('message', ready);
      if (!hasCalledBack)
      {
        hasCalledBack = true;
        callback(null, channel.port1);
      }
    } else {
      console.error('First event on iframe port was not "ready"');
    }
  };
  channel.port1.addEventListener('message', ready);
  channel.port1.start();

  iframe.addEventListener('load', function() {
    // Deliver the port to the iframe and initialize
    iframe.contentWindow.postMessage('init', iframeOrigin, [channel.port2]);
  });

  // Give this 200ms to initialize, after that, we treat this method as failed
  setTimeout(function() {
    if (!hasCalledBack)
    {
      hasCalledBack = true;
      callback(new Error("IFrame extension not supported"));
    }
  }, 200);
};


// High-level JS API

/**
 * Default extension response timeout in seconds.
 * @const
 */
u2f.EXTENSION_TIMEOUT_SEC = 30;

/**
 * A singleton instance for a MessagePort to the extension.
 * @type {MessagePort|u2f.WrappedChromeRuntimePort_}
 * @private
 */
u2f.port_ = null;

/**
 * Callbacks waiting for a port
 * @type {Array.<function((MessagePort|u2f.WrappedChromeRuntimePort_))>}
 * @private
 */
u2f.waitingForPort_ = [];

/**
 * A counter for requestIds.
 * @type {number}
 * @private
 */
u2f.reqCounter_ = 0;

/**
 * A map from requestIds to client callbacks
 * @type {Object.<number,(function((u2f.Error|u2f.RegisterResponse))
 *                       |function((u2f.Error|u2f.SignResponse)))>}
 * @private
 */
u2f.callbackMap_ = {};

/**
 * Creates or retrieves the MessagePort singleton to use.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 * @private
 */
u2f.getPortSingleton_ = function(callback) {
  if (u2f.port_) {
    callback(null, u2f.port_);
  } else {
    if (u2f.waitingForPort_.length == 0) {
      u2f.getMessagePort(function(err, port) {
        if (!err) {
          u2f.port_ = port;
          u2f.port_.addEventListener('message',
            /** @type {function(Event)} */ (u2f.responseHandler_));
        }

        // Careful, here be async callbacks. Maybe.
        while (u2f.waitingForPort_.length)
          u2f.waitingForPort_.shift()(err, port);
      });
    }
    u2f.waitingForPort_.push(callback);
  }
};

/**
 * Handles response messages from the extension.
 * @param {MessageEvent.<u2f.Response>} message
 * @private
 */
u2f.responseHandler_ = function(message) {
  var response = message.data;
  var reqId = response['requestId'];
  if (!reqId || !u2f.callbackMap_[reqId]) {
    console.error('Unknown or missing requestId in response.');
    return;
  }
  var cb = u2f.callbackMap_[reqId];
  delete u2f.callbackMap_[reqId];
  cb(null, response['responseData']);
};

/**
 * Calls the callback with true or false as first and only argument
 * @param {Function} callback
 */
u2f.isSupported = function(callback) {
  u2f.getPortSingleton_(function(err, port) {
    callback(!err);
  });
}

/**
 * Dispatches an array of sign requests to available U2F tokens.
 * @param {Array.<u2f.SignRequest>} signRequests
 * @param {function((u2f.Error|u2f.SignResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.sign = function(signRequests, callback, opt_timeoutSeconds) {
  u2f.getPortSingleton_(function(err, port) {
    if (err)
      return callback(err);

    var reqId = ++u2f.reqCounter_;
    u2f.callbackMap_[reqId] = callback;
    var req = {
      type: u2f.MessageTypes.U2F_SIGN_REQUEST,
      signRequests: signRequests,
      timeoutSeconds: (typeof opt_timeoutSeconds !== 'undefined' ?
        opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC),
      requestId: reqId
    };
    port.postMessage(req);
  });
};

/**
 * Dispatches register requests to available U2F tokens. An array of sign
 * requests identifies already registered tokens.
 * @param {Array.<u2f.RegisterRequest>} registerRequests
 * @param {Array.<u2f.SignRequest>} signRequests
 * @param {function((u2f.Error|u2f.RegisterResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.register = function(registerRequests, signRequests,
    callback, opt_timeoutSeconds) {
  u2f.getPortSingleton_(function(err, port) {
    if (err)
      return callback(err);

    var reqId = ++u2f.reqCounter_;
    u2f.callbackMap_[reqId] = callback;
    var req = {
      type: u2f.MessageTypes.U2F_REGISTER_REQUEST,
      signRequests: signRequests,
      registerRequests: registerRequests,
      timeoutSeconds: (typeof opt_timeoutSeconds !== 'undefined' ?
        opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC),
      requestId: reqId
    };
    port.postMessage(req);
  });
};

},{}],26:[function(require,module,exports){
(function (global){
'use strict';

module.exports = API;

var chromeApi = require( './google-u2f-api' );

// Feature detection (yes really)
var isBrowser = ( typeof navigator !== 'undefined' ) && !!navigator.userAgent;
var isSafari = isBrowser && navigator.userAgent.match( /Safari\// )
	&& !navigator.userAgent.match( /Chrome\// );
var isEDGE = isBrowser && navigator.userAgent.match( /Edge\/1[2345]/ );

var _backend = null;
function getBackend( Promise )
{
	if ( !_backend )
		_backend = new Promise( function( resolve, reject )
		{
			function notSupported( )
			{
				// Note; {native: true} means *not* using Google's hack
				resolve( { u2f: null, native: true } );
			}

			if ( !isBrowser )
				return notSupported( );

			if ( isSafari )
				// Safari doesn't support U2F, and the Safari-FIDO-U2F
				// extension lacks full support (Multi-facet apps), so we
				// block it until proper support.
				return notSupported( );

			var hasNativeSupport =
				( typeof window.u2f !== 'undefined' ) &&
				( typeof window.u2f.sign === 'function' );

			if ( hasNativeSupport )
				resolve( { u2f: window.u2f, native: true } );

			if ( isEDGE )
				// We don't want to check for Google's extension hack on EDGE
				// as it'll cause trouble (popups, etc)
				return notSupported( );

			if ( location.protocol === 'http:' )
				// U2F isn't supported over http, only https
				return notSupported( );

			if ( typeof MessageChannel === 'undefined' )
				// Unsupported browser, the chrome hack would throw
				return notSupported( );

			// Test for google extension support
			chromeApi.isSupported( function( ok )
			{
				if ( ok )
					resolve( { u2f: chromeApi, native: false } );
				else
					notSupported( );
			} );
		} );

	return _backend;
}

function API( Promise )
{
	return {
		isSupported   : isSupported.bind( Promise ),
		ensureSupport : ensureSupport.bind( Promise ),
		register      : register.bind( Promise ),
		sign          : sign.bind( Promise ),
		ErrorCodes    : API.ErrorCodes,
		ErrorNames    : API.ErrorNames
	};
}

API.ErrorCodes = {
	CANCELLED: -1,
	OK: 0,
	OTHER_ERROR: 1,
	BAD_REQUEST: 2,
	CONFIGURATION_UNSUPPORTED: 3,
	DEVICE_INELIGIBLE: 4,
	TIMEOUT: 5
};
API.ErrorNames = {
	"-1": "CANCELLED",
	"0": "OK",
	"1": "OTHER_ERROR",
	"2": "BAD_REQUEST",
	"3": "CONFIGURATION_UNSUPPORTED",
	"4": "DEVICE_INELIGIBLE",
	"5": "TIMEOUT"
};

function makeError( msg, err )
{
	var code = err != null ? err.errorCode : 1; // Default to OTHER_ERROR
	var type = API.ErrorNames[ '' + code ];
	var error = new Error( msg );
	error.metaData = {
		type: type,
		code: code
	}
	return error;
}

function deferPromise( Promise, promise )
{
	var ret = { };
	ret.promise = new Promise( function( resolve, reject ) {
		ret.resolve = resolve;
		ret.reject = reject;
		promise.then( resolve, reject );
	} );
	/**
	 * Reject request promise and disconnect port if 'disconnect' flag is true
	 * @param {string} msg
	 * @param {boolean} disconnect
	 */
	ret.promise.cancel = function( msg, disconnect )
	{
		getBackend( Promise )
		.then( function( backend )
		{
			if ( disconnect && !backend.native )
				backend.u2f.disconnect( );

			ret.reject( makeError( msg, { errorCode: -1 } ) );
		} );
	};
	return ret;
}

function defer( Promise, fun )
{
	return deferPromise( Promise, new Promise( function( resolve, reject )
	{
		try
		{
			fun && fun( resolve, reject );
		}
		catch ( err )
		{
			reject( err );
		}
	} ) );
}

function isSupported( )
{
	var Promise = this;

	return getBackend( Promise )
	.then( function( backend )
	{
		return !!backend.u2f;
	} );
}

function _ensureSupport( backend )
{
	if ( !backend.u2f )
	{
		if ( location.protocol === 'http:' )
			throw new Error( "U2F isn't supported over http, only https" );
		throw new Error( "U2F not supported" );
	}
}

function ensureSupport( )
{
	var Promise = this;

	return getBackend( Promise )
	.then( _ensureSupport );
}

function register( registerRequests, signRequests /* = null */, timeout )
{
	var Promise = this;

	if ( !Array.isArray( registerRequests ) )
		registerRequests = [ registerRequests ];

	if ( typeof signRequests === 'number' && typeof timeout === 'undefined' )
	{
		timeout = signRequests;
		signRequests = null;
	}

	if ( !signRequests )
		signRequests = [ ];

	return deferPromise( Promise, getBackend( Promise )
	.then( function( backend )
	{
		_ensureSupport( backend );

		var native = backend.native;
		var u2f = backend.u2f;

		return new Promise( function( resolve, reject )
		{
			function cbNative( response )
			{
				if ( response.errorCode )
					reject( makeError( "Registration failed", response ) );
				else
				{
					delete response.errorCode;
					resolve( response );
				}
			}

			function cbChrome( err, response )
			{
				if ( err )
					reject( err );
				else if ( response.errorCode )
					reject( makeError( "Registration failed", response ) );
				else
					resolve( response );
			}

			if ( native )
			{
				var appId = registerRequests[ 0 ].appId;

				u2f.register(
					appId, registerRequests, signRequests, cbNative, timeout );
			}
			else
			{
				u2f.register(
					registerRequests, signRequests, cbChrome, timeout );
			}
		} );
	} ) ).promise;
}

function sign( signRequests, timeout )
{
	var Promise = this;

	if ( !Array.isArray( signRequests ) )
		signRequests = [ signRequests ];

	return deferPromise( Promise, getBackend( Promise )
	.then( function( backend )
	{
		_ensureSupport( backend );

		var native = backend.native;
		var u2f = backend.u2f;

		return new Promise( function( resolve, reject )
		{
			function cbNative( response )
			{
				if ( response.errorCode )
					reject( makeError( "Sign failed", response ) );
				else
				{
					delete response.errorCode;
					resolve( response );
				}
			}

			function cbChrome( err, response )
			{
				if ( err )
					reject( err );
				else if ( response.errorCode )
					reject( makeError( "Sign failed", response ) );
				else
					resolve( response );
			}

			if ( native )
			{
				var appId = signRequests[ 0 ].appId;
				var challenge = signRequests[ 0 ].challenge;

				u2f.sign( appId, challenge, signRequests, cbNative, timeout );
			}
			else
			{
				u2f.sign( signRequests, cbChrome, timeout );
			}
		} );
	} ) ).promise;
}

function makeDefault( func )
{
	API[ func ] = function( )
	{
		if ( !global.Promise )
			// This is very unlikely to ever happen, since browsers
			// supporting U2F will most likely support Promises.
			throw new Error( "The platform doesn't natively support promises" );

		var args = [ ].slice.call( arguments );
		return API( global.Promise )[ func ].apply( null, args );
	};
}

// Provide default functions using the built-in Promise if available.
makeDefault( 'isSupported' );
makeDefault( 'ensureSupport' );
makeDefault( 'register' );
makeDefault( 'sign' );

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./google-u2f-api":25}],27:[function(require,module,exports){
'use strict';

module.exports = function() {
  throw new Error(
    'ws does not work in the browser. Browser clients must use the native ' +
      'WebSocket object'
  );
};

},{}]},{},[2]);
