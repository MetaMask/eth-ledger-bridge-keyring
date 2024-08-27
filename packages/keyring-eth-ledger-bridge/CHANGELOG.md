# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.1.1]
### Fixed
- The promise returned by the `init` method now resolves only after iframe has been loaded ([#236](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/236))
  - `updateTransportMethod` will throw an error when called before `init`

## [4.1.0]
### Changed
- Refactor error message in `LedgerKeyring` ([#232](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/232))
- Extend `LedgerMobileBridge` type from `LedgerBridge` ([#233](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/233))
- Create new `MetaMaskLedgerHwAppEth` instance instead of re-using previous instance ([#231](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/231))

## [4.0.0]
### Added
- Add classes `LedgerMobileBridge`, `LedgerTransportMiddleware`, and `MetaMaskLedgerHwAppEth` to support Bluetooth as a HW Ledger Transport option ([#225](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/225))

### Changed
- **BREAKING**: The `LedgerKeyring` method `setAccountToUnlock` now only accepts an input of type `number` ([#225](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/225))
- **BREAKING**: Removed the `chainCode` property from the `GetPublicKeyResponse` type ([#225](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/225))

## [3.0.0]
### Added
-  Add `getOptions` and `setOptions` methods to `LedgerBridge` interface ([#210](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/210))

### Changed
- **BREAKING**: `LedgerIframeBridge` class constructor now takes an options object with `bridgeUrl` ([#210](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/210))
- **BREAKING**: `LedgerBridge` `init` function now takes no parameters ([#210](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/210))
- **BREAKING**: `LedgerBridgeKeyringOptions` no longer contain `bridgeUrl` ([#210](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/210))
- **BREAKING**: `LedgerBridge` interface is now parameterized over its option type ([#210](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/210))
- Minor performance enhancement ([#211](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/211))

### Fixed
- **BREAKING**: `IFrameMessageResponse` now has more restrictive typings (#207) ([#207](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/207))

## [2.0.1]
### Fixed
- Fix `invalid rlp data` error for legacy transactions in `2.0.0` ([#212](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/212))

## [2.0.0]
### Changed
- **BREAKING**: Remove support for major node versions 14,15,17,19. Minimum Node.js version is now 16. ([#204](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/204))
- Bump `@metamask/eth-sig-util` from `^6.0.1` to `^7.0.0` ([#205](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/205))

### Fixed
- Move `@metamask/utils` from deendencies to devDependencies ([#209](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/209))

## [1.0.1]
### Fixed
- Bump dependency `hdkey` from `0.8.0` to `^2.1.0` ([#196](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/196))
- Replace dependency `eth-sig-util@^2` with `@metamask/eth-sig-util@^6` ([#157](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/157))
- Replace dependency `ethereumjs-util@^7.0.9` with `@ethereumjs/util@^8.0.0` and `@ethereumjs/rlp` ([#153](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/153))

## [1.0.0]
### Changed
- **BREAKING:** Separate the bridge from the keyring ([#156](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/156))
  - The Ledger bridge is now a separate class (`LedgerIframeBridge`), which must be constructed separately from the keyring and passed in as a constructor argument.
  - The bridge initialization has been moved from the keyring constructor to the keyring `init` method. The bridge is expected to be passed to the keyring uninitialized, and the keyring `init` method is expected to be called after keyring construction (before the keyring is used).
  - The keyring constructor no longer accepts keyring state. Instead, any pre-existing keyring state should be passed to the `deserialize` method after construction.
- **BREAKING:** Export changed from default to named ([#174](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/174))
  - The keyring is exported as `LedgerKeyring`
- Add TypeScript types ([#174](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/174))

## [0.15.0]
### Changed
- **BREAKING:** @ethereumjs/tx upgraded to major version 4, which includes a shift from storing numerical values as BNs to storing them as native BigInts. This is a breaking change for users of this keyring who access the values of the tx object, or that use those tx objects to interact with other libraries that depend on @ethereumsjs/tx versions under 4.0.0. ([#181](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/181))

## [0.14.0]
### Changed
- **BREAKING:** The minimum version of Node.js required for this package has been bumped to v14. ([#169](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/169))

### Fixed
- Fix incorrect `v` for EIP-712 signatures and `personal_sign` ([#152](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/152))

## [0.13.0]
### Added
- hdk.publicKey and hdk.chainCode should not be updated when unlocking using hdPath for an account.  ([#146](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/146))

## [0.12.0]
### Added
- Add a new `destroy` method which will remove the `message` event listener from window.  ([#145](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/145))

## [0.11.0]
### Added
- Add a new `isConnected` method which allows determining if the device is last known to be connected.  ([#131](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/131))

### Changed
- Messaging now runs off of message IDs instead of assuming the response received is from the last message sent, which will not always been true.  ([#132](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/132))

## [0.10.0]
### Added
- Add a new `attemptMakeApp` method which allows clients to attempt a creation of the Ledger transport for the purposes of detecting/catching potential connection errors.  ([#126](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/126))

## [0.9.0]
### Changed
- `updateTransportMethod` no longer defaults its parameter to false, and now names the param sent with the `'ledger-update-transport'` message `transportType`. This better is to support the use of an enum, instead of a boolean, for specifying transport preferences.  ([#114](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/114))

## [0.8.0]
### Added
- Allow ledger-bridge iframe to connect Ledger wia WebHID, when it is supported by the current browser ([#107](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/107))

### Changed
- Reject with an Error object if unlocking is not successful  ([#104](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/104))
- Ensure that logs of errors only have a single `Error:` string in the message ([#105](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/105))

## [0.7.0]
### Changed
- Remove unused `events` and `ethereumjs-tx` dependencies ([#101](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/101), [#102](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/102))
- Update eth-ledger-bridge-keyring to support EIP-1559 transactions ([#98](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/98), [#97](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/97), [#96](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/96))

## [0.6.0]
### Added
- Support new versions of ethereumjs/tx ([#68](https://github.com/MetaMask/eth-ledger-bridge-keyring/pull/68))

[Unreleased]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v4.1.1...HEAD
[4.1.1]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v4.1.0...v4.1.1
[4.1.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v2.0.1...v3.0.0
[2.0.1]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.15.0...v1.0.0
[0.15.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/MetaMask/eth-ledger-bridge-keyring/releases/tag/v0.6.0
