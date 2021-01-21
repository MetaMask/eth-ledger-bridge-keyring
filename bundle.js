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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require('buffer');

var LedgerBridge = function () {
    function LedgerBridge() {
        _classCallCheck(this, LedgerBridge);

        this.addEventListeners();
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
        key: 'makeApp',
        value: async function makeApp() {
            try {
                this.transport = await _hwTransportU2f2.default.create();
                this.app = new _hwAppEth2.default(this.transport);
            } catch (e) {
                console.log('LEDGER:::CREATE APP ERROR', e);
            }
        }
    }, {
        key: 'cleanUp',
        value: function cleanUp() {
            this.app = null;
            this.transport.close();
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
                this.cleanUp();
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
                this.cleanUp();
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

            // https://developers.yubico.com/U2F/Libraries/Client_error_codes.html
            if (isU2FError(err)) {
                // Timeout
                if (err.metaData.code === 5) {
                    return 'LEDGER_TIMEOUT';
                }

                return err.metaData.type;
            }

            if (isStringError(err)) {
                // Wrong app logged into
                if (err.includes('6804')) {
                    return 'LEDGER_WRONG_APP';
                }
                // Ledger locked
                if (err.includes('6801')) {
                    return 'LEDGER_LOCKED';
                }

                return err;
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

},{"@ledgerhq/hw-app-eth":6,"@ledgerhq/hw-app-eth/erc20":5,"@ledgerhq/hw-transport-u2f":9,"buffer":16}],2:[function(require,module,exports){
'use strict';

var _ledgerBridge = require('./ledger-bridge');

var _ledgerBridge2 = _interopRequireDefault(_ledgerBridge);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(async function () {
    var bridge = new _ledgerBridge2.default();
})();
console.log('MetaMask < = > Ledger Bridge initialized!');

},{"./ledger-bridge":1}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/* eslint-disable no-continue */
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

},{}],4:[function(require,module,exports){
module.exports = "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";
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
    transport.decorateAppAPIMethods(this, ["getAddress", "provideERC20TokenInformation", "signTransaction", "signPersonalMessage", "getAppConfiguration", "starkGetPublicKey", "starkSignOrder", "starkSignTransfer", "starkProvideQuantum"], scrambleKey);
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

    if (rlpTx.length > 6) {
      let rlpVrs = (0, _rlp.encode)(rlpTx.slice(-3));
      rlpOffset = rawTx.length - (rlpVrs.length - 1);
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
      const v = response.slice(0, 1).toString("hex");
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

}

exports.default = Eth;

}).call(this,require("buffer").Buffer)
},{"./utils":8,"@ledgerhq/errors":3,"bignumber.js":13,"buffer":16,"rlp":19}],7:[function(require,module,exports){
(function (Buffer){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.list = exports.byContractAddress = void 0;

var _erc = _interopRequireDefault(require("../data/erc20.js"));

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
    const buf = Buffer.from(_erc.default, "base64");
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
},{"../data/erc20.js":4,"buffer":16}],8:[function(require,module,exports){
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
},{"@ledgerhq/errors":3,"@ledgerhq/hw-transport":10,"@ledgerhq/logs":11,"buffer":16,"u2f-api":20}],10:[function(require,module,exports){
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
},{"@ledgerhq/errors":3,"buffer":16,"events":17}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
;(function (globalObject) {
  'use strict';

/*
 *      bignumber.js v9.0.0
 *      A JavaScript library for arbitrary-precision arithmetic.
 *      https://github.com/MikeMcl/bignumber.js
 *      Copyright (c) 2019 Michael Mclaughlin <M8ch88l@gmail.com>
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

            // Disallow if only one character,
            // or if it contains '+', '-', '.', whitespace, or a repeated character.
            if (typeof v == 'string' && !/^.$|[+-.\s]|(.).*\1/.test(v)) {
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
          n = '1e' + e;
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

},{}],14:[function(require,module,exports){
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

},{"buffer":15}],15:[function(require,module,exports){

},{}],16:[function(require,module,exports){
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
},{"base64-js":12,"buffer":16,"ieee754":18}],17:[function(require,module,exports){
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

},{}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
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
},{"bn.js":14,"buffer":16}],20:[function(require,module,exports){
'use strict';
module.exports = require( './lib/u2f-api' );
},{"./lib/u2f-api":22}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
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
},{"./google-u2f-api":21}]},{},[2]);
