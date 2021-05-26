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
            var _this3 = this;

            try {
                if (this.useLedgerLive) {
                    await _WebSocketTransport2.default.check(BRIDGE_URL, TRANSPORT_CHECK_DELAY).catch(async function () {
                        window.open('ledgerlive://bridge?appName=Ethereum');
                        await _this3.checkTransportLoop();
                        _this3.transport = await _WebSocketTransport2.default.open(BRIDGE_URL);
                        _this3.app = new _hwAppEth2.default(_this3.transport);
                    });
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

},{"@ledgerhq/hw-app-eth":6,"@ledgerhq/hw-app-eth/erc20":5,"@ledgerhq/hw-transport-http/lib/WebSocketTransport":9,"@ledgerhq/hw-transport-u2f":11,"buffer":18}],2:[function(require,module,exports){
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
(function (Buffer){(function (){
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

}).call(this)}).call(this,require("buffer").Buffer)
},{"./utils":8,"@ledgerhq/errors":4,"bignumber.js":15,"buffer":18,"rlp":21}],7:[function(require,module,exports){
(function (Buffer){(function (){
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

}).call(this)}).call(this,require("buffer").Buffer)
},{"@ledgerhq/cryptoassets/data/erc20-signatures":3,"buffer":18}],8:[function(require,module,exports){
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
(function (global,Buffer){(function (){
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

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)
},{"@ledgerhq/errors":4,"@ledgerhq/hw-transport":12,"@ledgerhq/logs":13,"buffer":18,"ws":10}],10:[function(require,module,exports){
'use strict';

module.exports = function() {
  throw new Error(
    'ws does not work in the browser. Browser clients must use the native ' +
      'WebSocket object'
  );
};

},{}],11:[function(require,module,exports){
(function (Buffer){(function (){
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

}).call(this)}).call(this,require("buffer").Buffer)
},{"@ledgerhq/errors":4,"@ledgerhq/hw-transport":12,"@ledgerhq/logs":13,"buffer":18,"u2f-api":22}],12:[function(require,module,exports){
(function (Buffer){(function (){
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

}).call(this)}).call(this,require("buffer").Buffer)
},{"@ledgerhq/errors":4,"buffer":18,"events":19}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

  var i
  for (i = 0; i < len; i += 4) {
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
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
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

},{}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
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
    if (typeof window !== 'undefined' && typeof window.Buffer !== 'undefined') {
      Buffer = window.Buffer;
    } else {
      Buffer = require('buffer').Buffer;
    }
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
      this.negative = 1;
    }

    if (start < number.length) {
      if (base === 16) {
        this._parseHex(number, start, endian);
      } else {
        this._parseBase(number, base, start);
        if (endian === 'le') {
          this._initArray(this.toArray(), base, endian);
        }
      }
    }
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

  function parseHex4Bits (string, index) {
    var c = string.charCodeAt(index);
    // 'A' - 'F'
    if (c >= 65 && c <= 70) {
      return c - 55;
    // 'a' - 'f'
    } else if (c >= 97 && c <= 102) {
      return c - 87;
    // '0' - '9'
    } else {
      return (c - 48) & 0xf;
    }
  }

  function parseHexByte (string, lowerBound, index) {
    var r = parseHex4Bits(string, index);
    if (index - 1 >= lowerBound) {
      r |= parseHex4Bits(string, index - 1) << 4;
    }
    return r;
  }

  BN.prototype._parseHex = function _parseHex (number, start, endian) {
    // Create possibly bigger array to ensure that it fits the number
    this.length = Math.ceil((number.length - start) / 6);
    this.words = new Array(this.length);
    for (var i = 0; i < this.length; i++) {
      this.words[i] = 0;
    }

    // 24-bits chunks
    var off = 0;
    var j = 0;

    var w;
    if (endian === 'be') {
      for (i = number.length - 1; i >= start; i -= 2) {
        w = parseHexByte(number, start, i) << off;
        this.words[j] |= w & 0x3ffffff;
        if (off >= 18) {
          off -= 18;
          j += 1;
          this.words[j] |= w >>> 26;
        } else {
          off += 8;
        }
      }
    } else {
      var parseLength = number.length - start;
      for (i = parseLength % 2 === 0 ? start + 1 : start; i < number.length; i += 2) {
        w = parseHexByte(number, start, i) << off;
        this.words[j] |= w & 0x3ffffff;
        if (off >= 18) {
          off -= 18;
          j += 1;
          this.words[j] |= w >>> 26;
        } else {
          off += 8;
        }
      }
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

    this.strip();
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
      if (r.strip !== undefined) {
        // r is BN v4 instance
        r.strip();
      } else {
        // r is BN v5 instance
        r._strip();
      }
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

},{"buffer":17}],17:[function(require,module,exports){

},{}],18:[function(require,module,exports){
(function (Buffer){(function (){
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

}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":14,"buffer":18,"ieee754":20}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
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

},{}],21:[function(require,module,exports){
(function (Buffer){(function (){
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

}).call(this)}).call(this,require("buffer").Buffer)
},{"bn.js":16,"buffer":18}],22:[function(require,module,exports){
'use strict';
module.exports = require( './lib/u2f-api' );
},{"./lib/u2f-api":24}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
(function (global){(function (){
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

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./google-u2f-api":23}]},{},[2]);
