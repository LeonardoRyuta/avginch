# ICP Canister Backend

This directory contains the Rust canister for the ICP side of ICP-Fusion, providing secure escrow functionality and direct ICP ledger integration.

## Architecture

### Core Components

- **`src/icp_backend/`**: Main canister implementation
- **Storage Module**: Persistent state management for escrows
- **Ledger Integration**: Direct ICP ledger interaction
- **Types System**: Comprehensive type definitions
- **Utils Module**: Cryptographic validation and time management

## Quick Start

### Prerequisites

- Rust and Cargo
- DFX (DFINITY Canister SDK)
- Internet Computer development environment

### Automated Deployment (Recommended)

```bash
# Use the automated deployment script
./canister_deploy.sh
```

**What the script does:**
- Creates required DFX identities (`minter` and `default`)
- Starts local IC replica on port 8080
- Deploys ICP ledger canister with initial funding
- Deploys Internet Identity canister
- Deploys the main ICP backend canister
### Manual Setup

```bash
# Start local IC replica
dfx start --host 127.0.0.1:8080 --clean --background

# Create required identities
dfx identity new minter
dfx identity new default

# Deploy canisters
dfx deploy
```

## Deployment Script

The `canister_deploy.sh` script automates the entire ICP deployment process:

1. **Identity Management**: Creates `minter` and `default` identities if they don't exist
2. **Network Setup**: Starts local IC replica on the correct host
3. **Ledger Deployment**: Deploys ICP ledger with pre-funded accounts
4. **Identity Deployment**: Deploys Internet Identity for authentication
5. **Backend Deployment**: Deploys the main ICP-Fusion canister
6. **Initial Funding**: Transfers initial ICP for testing

**Script output:**
- Canister IDs for resolver and frontend configuration
- Account IDs for testing
- Deployment status and next steps

## Canister Configuration

The deployment is configured through `dfx.json`:

```json
{
  "canisters": {
    "icp_ledger_canister": {
      "type": "custom",
      "candid": "https://raw.githubusercontent.com/dfinity/ic/master/rs/rosetta-api/icp_ledger/ledger.did",
      "wasm": "https://download.dfinity.systems/ic/universal/canister/ledger-canister.wasm.gz"
    },
    "internet_identity": {
      "type": "custom",
      "candid": "https://github.com/dfinity/internet-identity/releases/latest/download/internet_identity.did",
      "wasm": "https://github.com/dfinity/internet-identity/releases/latest/download/internet_identity_dev.wasm.gz"
    },
    "icp_backend": {
      "type": "rust",
      "package": "icp_backend"
    }
  }
}
```

## Environment Setup

### DFX Identities

The system requires two identities:

1. **Minter Identity**: Used for ICP ledger minting operations
2. **Default Identity**: Used for regular canister interactions

The deployment script creates these automatically, but you can create them manually:

```bash
dfx identity new minter
dfx identity new default

# Check identities
dfx identity list
dfx identity whoami
```

### Local Network

Start the local IC replica:

```bash
dfx start --host 127.0.0.1:8080 --clean --background
```

## Troubleshooting

### Common Issues

1. **"Canister not found"**: Run `./canister_deploy.sh` to redeploy
2. **"Caller not authorized"**: Check DFX identity with `dfx identity whoami`
3. **"Insufficient funds"**: Ensure ledger has adequate ICP balance
4. **"Network connection failed"**: Verify IC replica is running

### Debug Mode

Enable detailed logging:

```bash
# Check canister logs
dfx canister logs icp_backend

# Debug deployment
dfx deploy --verbose
```

### Identity Issues

```bash
# Check current identity
dfx identity whoami

# Switch to specific identity
dfx identity use default

# Get principal ID
dfx identity get-principal
```

### Network Issues

```bash
# Check if IC replica is running
dfx ping

# Restart IC replica
dfx stop
dfx start --clean --background
```

## Mainnet Deployment

For production deployment to IC mainnet:

```bash
# Deploy to mainnet
dfx deploy --network ic

# Verify deployment
dfx canister --network ic status icp_backend
```

**Mainnet considerations:**
- Requires cycles for canister operation
- Use production-ready identities
- Configure proper access controls
- Test thoroughly on local network first

## Security Considerations

- **Identity Management**: Keep DFX identities secure
- **Principal Authorization**: Only authorize trusted callers
- **Time-lock Configuration**: Use appropriate timelock periods
- **Fund Safety**: Test with small amounts first

## Contributing

1. Follow Rust coding standards
2. Add comprehensive tests
3. Update Candid interface files
4. Document all public methods
5. Test on local network before mainnet

**Requirements:**
- DFX installed and configured
- Rust toolchain with wasm32-unknown-unknown target
- No additional setup required - script handles identity creation

### Manual Identity Setup

If not using the automated script, create identities manually:

```bash
# Create required identities
dfx identity new minter
dfx identity new default

# Use default identity for development
dfx identity use default
```

### Start Local IC Network

```bash
dfx start --clean --host 127.0.0.1:8080
```

This starts a local Internet Computer replica with:
- Local replica accessible at `http://127.0.0.1:8080`
- Candid UI available at the replica address
- Local identity management

### Configuration

The canister configuration is managed through `dfx.json`:

```json
{
  "canisters": {
    "icp_backend": {
      "type": "rust",
      "package": "icp_backend",
      "candid": "src/icp_backend/icp_backend.did"
    }
  },
  "networks": {
    "local": {
      "bind": "127.0.0.1:8080",
      "type": "ephemeral"
    }
  }
}
```

### Environment Setup

**Local Development:**
- Uses local replica configuration from `dfx.json`
- No additional environment variables required
- Identity management through DFX

**IC Mainnet:**
- Requires IC identity setup: `dfx identity new <name>`
- Principal management for canister control
- Production-level security considerations

### Identity Management

```bash
# Create new identity
dfx identity new production

# Use specific identity
dfx identity use production

```

## Canister Interface

### Core Functions

```rust
// Create a new escrow
create_escrow(order: EscrowOrder) -> Result<String, String>

// Deposit funds to escrow
deposit_to_escrow(escrow_id: String, amount: u64) -> Result<(), String>

// Withdraw from escrow with secret
withdraw_from_escrow(escrow_id: String, secret: String) -> Result<(), String>

// Public withdrawal (after timelock)
public_withdraw_from_escrow(escrow_id: String, secret: String) -> Result<(), String>

// Get escrow status
get_escrow_status(escrow_id: String) -> Result<EscrowStatus, String>

// Cancel escrow (after timelock)
cancel_escrow(escrow_id: String) -> Result<(), String>
```

### Query Functions

```rust
// Get escrow details
get_escrow(escrow_id: String) -> Option<Escrow>

// Get all escrows for principal
get_user_escrows(user: Principal) -> Vec<Escrow>

// Get canister stats
get_stats() -> CanisterStats
```

## Testing

### Unit Tests

```bash
cargo test
```

### Integration Tests

```bash
# Deploy to local network
dfx deploy

# Run Candid interface tests
dfx canister call icp_backend create_escrow '(record {
  order_hash = "test_hash";
  maker = principal "rrkah-fqaaa-aaaaa-aaaaq-cai";
  taker = principal "rdmx6-jaaaa-aaaaa-aaadq-cai";
  src_amount = 1000000;
  dst_amount = 1000000000000000000;
  hash_lock = "abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  time_lock = 1700000000;
})'
```

### End-to-End Testing

1. Start local IC replica
2. Deploy canister
3. Start EVM local network
4. Run resolver service
5. Execute complete swap flow

## Data Structures

### Escrow Structure

```rust
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Escrow {
    pub id: String,
    pub order_hash: String,
    pub maker: Principal,
    pub taker: Principal,
    pub src_amount: u64,
    pub dst_amount: u64,
    pub hash_lock: String,
    pub time_lock: u64,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub funded_at: Option<u64>,
    pub withdrawn_at: Option<u64>,
}
```

### Status Types

```rust
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq)]
pub enum EscrowStatus {
    Created,
    Funded,
    Withdrawn,
    Cancelled,
    Expired,
}
```

## Security Considerations

### Authorization Model

- **Maker/Taker Authorization**: Only escrow participants can perform private operations
- **Public Operations**: Available after timelock expiration for emergency recovery
- **Principal Validation**: All operations validate caller principals
- **Time-based Security**: Operations respect timelock constraints

### Timelock Configuration

```rust
pub struct Timelocks {
    pub withdrawal: u64,        // 30 seconds (testing) / 3600 seconds (production)
    pub public_withdrawal: u64, // 60 seconds (testing) / 7200 seconds (production)
    pub cancellation: u64,      // 86400 seconds (24 hours)
}
```

### Fund Safety

- **Immutable Configuration**: Core escrow parameters cannot be changed
- **Time-bounded Operations**: All operations have timeout mechanisms
- **Emergency Recovery**: Public withdrawal mechanisms prevent fund loss
- **Cryptographic Validation**: Secrets must match hashlocks exactly

## Deployment

### Local Development Deployment

```bash
# Start local replica
dfx start --clean

# Deploy canister
dfx deploy

# Get canister ID
dfx canister id icp_backend
```

### Production Deployment

```bash
# Set up mainnet identity
dfx identity new mainnet
dfx identity use mainnet

# Deploy to IC mainnet with cycles
dfx deploy --network ic --with-cycles 2000000000000

# Verify deployment
dfx canister --network ic status icp_backend
```

### Cycles Management

```bash
# Check cycles balance
dfx canister --network ic status icp_backend

# Top up cycles
dfx canister --network ic deposit-cycles 1000000000000 icp_backend
```

## Monitoring and Debugging

### Canister Logs

```bash
# View canister logs
dfx canister logs icp_backend

# Real-time log monitoring
dfx canister logs icp_backend --follow
```

### Debug Mode

Enable debug mode in canister code:
```rust
#[cfg(feature = "debug")]
ic_cdk::println!("Debug: Escrow created with ID: {}", escrow_id);
```

Compile with debug features:
```bash
dfx deploy --argument '(variant { debug })' 
```

### Performance Monitoring

```rust
// Monitor instruction count
ic_cdk::api::instruction_counter()

// Monitor memory usage
ic_cdk::api::stable::stable64_size()

// Monitor cycle consumption
ic_cdk::api::canister_balance()
```

## Troubleshooting

### Common Issues

1. **"Canister not found"**: Verify deployment and canister ID
2. **"Unauthorized"**: Check principal authentication and permissions
3. **"Insufficient cycles"**: Top up canister with more cycles
4. **"Time lock not expired"**: Wait for appropriate timelock period

### Network Issues

- Verify local replica is running on correct port
- Check DFX version compatibility
- Ensure proper network configuration in `dfx.json`

### Identity Issues

```bash
# Reset identity
dfx identity remove <identity_name>
dfx identity new <identity_name>

# Verify principal
dfx identity get-principal
```

## Upgrading

### Canister Upgrades

```bash
# Stop canister
dfx canister stop icp_backend

# Upgrade with state preservation
dfx deploy icp_backend --upgrade-unchanged

# Start canister
dfx canister start icp_backend
```

### State Migration

Implement pre/post upgrade hooks:
```rust
#[pre_upgrade]
fn pre_upgrade() {
    // Save state before upgrade
}

#[post_upgrade]
fn post_upgrade() {
    // Restore state after upgrade
}
```

## Contributing

1. Follow Rust coding standards
2. Add comprehensive tests for new features
3. Update Candid interface definitions
4. Document all public functions
5. Ensure backward compatibility for upgrades

## License

MIT License

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
