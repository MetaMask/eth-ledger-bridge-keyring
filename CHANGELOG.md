# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
## [0.14.0]
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
