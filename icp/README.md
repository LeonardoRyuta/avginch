# ICP Fusion+ Escrow Canister

A comprehensive Internet Computer Protocol (ICP) canister implementation for cross-chain atomic swaps between EVM-compatible blockchains and ICP. This canister provides the ICP-side functionality to complement the EVM smart contracts for 1inch Fusion+ extension.

## Overview

This canister implements Hash Time-Locked Contracts (HTLCs) on ICP to enable trustless atomic swaps between ICP and EVM tokens. It supports both directions:

- **ICP→EVM**: ICP is locked on this canister, EVM tokens released when secret is revealed
- **EVM→ICP**: ICP is released from this canister when secret from EVM is provided

## Features

### Core Functionality
- ✅ **Atomic Swaps**: Hash time-locked contracts with secret revelation
- ✅ **Dual Direction Support**: Both ICP→EVM and EVM→ICP swaps
- ✅ **Timelock Phases**: Private withdrawal, public withdrawal, and cancellation periods
- ✅ **Safety Deposits**: Anti-griefing mechanism with refundable deposits
- ✅ **Access Control**: Treasury and authorized principal management
- ✅ **Emergency Rescue**: Fund recovery mechanism after extended delays

### Advanced Features
- 📊 **Metrics & Analytics**: Comprehensive swap statistics
- 📝 **Event Logging**: Complete audit trail of all operations
- 🔍 **Cross-chain Verification**: Record ICP transaction hashes and EVM addresses
- 🛡️ **Security Validations**: Input validation, timing checks, and state management
- ⚡ **Gas-Efficient**: Optimized for minimal ICP transfer fees

## Architecture

### Contract Types

#### Source Escrow (ICP→EVM)
- Maker locks ICP with safety deposit
- Taker reveals secret after receiving EVM tokens
- ICP released to taker, safety deposit returned to maker

#### Destination Escrow (EVM→ICP)  
- Taker deposits ICP with safety deposit
- Maker reveals secret after sending EVM tokens
- ICP released to maker, safety deposit returned to taker

### Timelock Stages

1. **Private Withdrawal** (0-X hours): Only maker/taker can withdraw with secret
2. **Public Withdrawal** (X-Y hours): Authorized principals can execute with secret
3. **Cancellation Period** (Y+ hours): Appropriate party can cancel and recover funds
4. **Rescue Period** (7+ days): Emergency fund recovery by taker

## Quick Start

### Prerequisites
- [DFX SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install) installed
- ICP tokens for deployment and testing

### Deployment

1. **Build the canister**
```bash
cd icp/
dfx build
```

2. **Deploy locally**
```bash
dfx start --background
dfx deploy
```

3. **Deploy to IC mainnet**
```bash
dfx deploy --network ic --with-cycles 1000000000000
```

### Basic Usage

#### Create an escrow
```bash
dfx canister call icp_backend create_dst_escrow '(record {
    order_hash = blob "\01\02\03\04\05\06\07\08\09\0A\0B\0C\0D\0E\0F\10\11\12\13\14\15\16\17\18\19\1A\1B\1C\1D\1E\1F\20";
    hashlock = blob "\21\22\23\24\25\26\27\28\29\2A\2B\2C\2D\2E\2F\30\31\32\33\34\35\36\37\38\39\3A\3B\3C\3D\3E\3F\40";
    maker = "rrkah-fqaaa-aaaaa-aaaaq-cai";
    taker = "0x742d35Cc6E5A69e6d89B134b1234567890123456";
    token = "0x0000000000000000000000000000000000000000";
    amount = 100000000 : nat64;
    safety_deposit = 10000000 : nat64;
    timelocks = record {
        withdrawal = 3600 : nat64;
        public_withdrawal = 7200 : nat64;
        cancellation = 86400 : nat64;
        deployed_at = 0 : nat64;
    };
})'
```

#### Check escrow status
```bash
dfx canister call icp_backend get_escrow '(blob "\21\22\23\24\25\26\27\28\29\2A\2B\2C\2D\2E\2F\30\31\32\33\34\35\36\37\38\39\3A\3B\3C\3D\3E\3F\40")'
```

#### View metrics
```bash
dfx canister call icp_backend get_metrics
```

## Security Considerations

### Input Validation
- ✅ Hashlock must be exactly 32 bytes (SHA256)
- ✅ Order hash must be exactly 32 bytes
- ✅ Amounts must be within configured limits
- ✅ EVM addresses must be valid format
- ✅ Maker and taker must be different
- ✅ Timelock ordering must be correct

### Access Control
- 🔐 Only maker/taker can withdraw in private period
- 🔐 Only authorized principals can execute public withdrawals
- 🔐 Only treasury can modify configuration
- 🔐 Only appropriate party can cancel escrows
- 🔐 Only taker can rescue funds after delay

## Documentation

For comprehensive documentation, see:
- [IC Developer Docs](https://internetcomputer.org/docs/current/developer-docs/backend/rust/)
- [Candid Guide](https://internetcomputer.org/docs/current/developer-docs/backend/candid/)
- [IC-CDK Documentation](https://docs.rs/ic-cdk)

## License

MIT License

Which will start a server at `http://localhost:8080`, proxying API requests to the replica at port 4943.

### Note on frontend environment variables

If you are hosting frontend code somewhere without using DFX, you may need to make one of the following adjustments to ensure your project does not fetch the root key in production:

- set`DFX_NETWORK` to `ic` if you are using Webpack
- use your own preferred method to replace `process.env.DFX_NETWORK` in the autogenerated declarations
  - Setting `canisters -> {asset_canister_id} -> declarations -> env_override to a string` in `dfx.json` will replace `process.env.DFX_NETWORK` with the string in the autogenerated declarations
- Write your own `createActor` constructor
