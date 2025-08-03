# ICP-Fusion: Cross-Chain Atomic Swaps

ICP-Fusion is a trustless cross-chain atomic swap system that enables direct token exchanges between EVM networks and the Internet Computer Protocol (ICP) without bridges, wrapped assets, or centralized intermediaries. The system implements a resolver-based liquidity model inspired by 1inch Fusion+ but adapted for cross-chain scenarios.

## What is ICP-Fusion?

ICP-Fusion eliminates the need for traditional liquidity pools by using a resolver-based approach where any entity holding the desired tokens can facilitate swaps on-demand. This creates unlimited trading possibilities without the capital inefficiency of AMM pools, allowing users to trade any supported token combination as long as a resolver supports both assets.

## Key Features

- **Trustless Atomic Execution**: Either both sides of the trade complete or both revert
- **No Liquidity Pools Required**: Resolvers provide liquidity from their existing holdings
- **Universal Token Support**: Any ERC-20 token on EVM, any ICRC-1 token on ICP
- **Competitive Pricing**: Multiple resolvers can compete for the same trades
- **Deterministic Addresses**: Escrow contracts with predictable addresses
- **Emergency Recovery**: Time-locked mechanisms prevent permanent fund loss

## Project Architecture

### 🔗 EVM Smart Contracts (`evm/`)
Solidity contracts deployed on Base Sepolia testnet that handle escrow creation, fund management, and atomic execution on the EVM side.

**Key Components:**
- `ICPEscrowFactory.sol`: Factory for deterministic escrow deployment
- `ICPEscrowSrc.sol`: Source-side escrow for EVM → ICP swaps
- `ICPEscrowDst.sol`: Destination-side escrow for ICP → EVM swaps
- `BaseEscrow.sol`: Core escrow logic with time-locked mechanisms

### 🦀 ICP Canister Backend (`icp/`)
Rust canister running on the Internet Computer that provides secure escrow functionality and direct ICP ledger integration.

**Key Components:**
- Persistent escrow state management
- Direct ICP ledger integration without wrapper tokens
- Principal-based authorization with public withdrawal support
- Cryptographic secret validation and time management

### 🌐 Resolver Service (`resolver/`)
Node.js Express server that coordinates cross-chain operations, provides liquidity, and executes the atomic swap protocol.

**Key Components:**
- Cross-chain order coordination
- Intelligent withdrawal sequencing
- Retry logic with exponential backoff
- Real-time status monitoring and logging

### ⚛️ Frontend Interface (`frontend/`)
React-based user interface for configuring and executing cross-chain atomic swaps.

**Key Components:**
- Wallet integration for both EVM and ICP
- Real-time swap status tracking
- Token selection and amount configuration
- Resolver discovery and rate comparison

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Rust and Cargo
- DFX (DFINITY Canister SDK)
- Git
- Base Sepolia ETH for testing (get from https://bridge.base.org/deposit)

### 1. Clone and Install

```bash
git clone <repository-url>
cd icp-fusion

# Install dependencies for all components
cd evm && npm install && cd ..
cd resolver && npm install && cd ..
cd frontend && npm install && cd ..
cd scripts && npm install && cd ..
```

### 2. Deploy Smart Contracts

**Deploy ICP Canisters:**
```bash
cd icp
./canister_deploy.sh
```
*This script automatically creates the required DFX identities (minter and default), starts the local IC replica, and deploys all necessary canisters including the ICP ledger.*

**Deploy EVM Contracts to Base Sepolia:**
```bash
cd evm
# Configure your .env file first with private key
cp .env.example .env
# Edit .env and add your PRIVATE_KEY (without 0x prefix)
./deploy-base-sepolia.sh
```
*This script automatically deploys all smart contracts to Base Sepolia testnet and provides the contract addresses for configuration.*

### 3. Configure Environment Variables

Update the environment files with the deployed contract addresses from the script outputs:

**Resolver Configuration (`resolver/.env`):**
```bash
cd resolver
cp .env.example .env
# Update ICP_CANISTER_ID from ICP deployment output
# Update EVM_ICP_ESCROW_FACTORY_ADDRESS from EVM deployment output
```

**Frontend Configuration (`frontend/.env`):**
```bash
cd frontend
cp .env.example .env
# Update VITE_ICP_CANISTER_ID from ICP deployment output
# Update VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS from EVM deployment output
```

### 4. Start Development Services

**Terminal 1 - Start Resolver Service:**
```bash
cd resolver
npm run dev
```

**Terminal 2 - Start Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Access the Application

- Frontend: http://localhost:5173
- Resolver API: http://localhost:3000
- ICP Local Network: http://127.0.0.1:8080

## Component Setup Details

### EVM Smart Contracts (`evm/`)

The EVM contracts are deployed to Base Sepolia testnet using the automated deployment script.

**Quick Setup:**
```bash
cd evm
npm install
cp .env.example .env
# Add your PRIVATE_KEY to .env (without 0x prefix)
./deploy-base-sepolia.sh
```

**Environment Variables Required:**
- `PRIVATE_KEY`: Your Ethereum private key (without 0x prefix)
- `BASE_SEPOLIA_RPC_URL`: Base Sepolia RPC URL (defaults to https://sepolia.base.org)

**Get Test ETH:**
- Get Base Sepolia ETH from: https://bridge.base.org/deposit
- Or use faucets listed on Base documentation

### ICP Canister Backend (`icp/`)

The ICP canisters are deployed to local IC replica using the automated deployment script.

**Quick Setup:**
```bash
cd icp
./canister_deploy.sh
```

**What the script does:**
- Creates two DFX identities: `minter` and `default`
- Starts local IC replica on port 8080
- Deploys ICP ledger canister with initial funding
- Deploys Internet Identity canister
- Deploys the main ICP backend canister
- Provides canister IDs for configuration

**Manual Setup (if needed):**
```bash
dfx start --host 127.0.0.1:8080 --clean --background
dfx identity new minter
dfx identity new default
dfx deploy
```

### Resolver Service (`resolver/`)

The resolver coordinates cross-chain operations and provides the swap API.

**Setup:**
```bash
cd resolver
npm install
cp .env.example .env
# Configure with deployed contract addresses
npm run dev
```

**Environment Variables Required:**
- `ICP_CANISTER_ID`: From ICP canister deployment
- `EVM_ICP_ESCROW_FACTORY_ADDRESS`: From EVM contract deployment
- `EVM_PRIVATE_KEY`: Private key for resolver operations
- `EVM_RPC_URL`: Base Sepolia RPC URL

### Frontend Application (`frontend/`)

The React frontend provides the user interface for atomic swaps.

**Setup:**
```bash
cd frontend
npm install
cp .env.example .env
# Configure with deployed contract addresses (note VITE_ prefix)
npm run dev
```

**Environment Variables Required (with VITE_ prefix):**
- `VITE_ICP_CANISTER_ID`: From ICP canister deployment
- `VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS`: From EVM contract deployment
- `VITE_EVM_RPC_URL`: Base Sepolia RPC URL
- `VITE_EVM_CHAIN_ID`: 84532 for Base Sepolia

## Development Workflow

### Testing Configuration

The system uses fast timeouts for development:
- Withdrawal window: 30 seconds
- Public withdrawal: 60 seconds
- Resolver buffers: 90 seconds with retries

This allows complete end-to-end testing in under 5 minutes.

### Complete Setup Script

For a complete automated setup:

```bash
# 1. Deploy ICP canisters
cd icp && ./canister_deploy.sh && cd ..

# 2. Deploy EVM contracts
cd evm && ./deploy-base-sepolia.sh && cd ..

# 3. Configure resolver
cd resolver && cp .env.example .env
# Edit resolver/.env with addresses from deployment outputs

# 4. Configure frontend
cd frontend && cp .env.example .env
# Edit frontend/.env with addresses from deployment outputs

# 5. Start services
cd resolver && npm run dev &
cd frontend && npm run dev
```

## Security Considerations

- **Private Key Management**: Store private keys securely, never commit to version control
- **Environment Variables**: Use proper environment variable management
- **Network Configuration**: Verify RPC URLs and chain IDs
- **Fund Safety**: Test with small amounts before large transactions
- **DFX Identities**: Keep your DFX identities secure for ICP operations

## Troubleshooting

### Common Issues

1. **"Connection refused"**: Ensure all services are running on correct ports
2. **"Invalid canister ID"**: Run `./canister_deploy.sh` to redeploy ICP canisters
3. **"Transaction reverted"**: Check Base Sepolia ETH balance and gas limits
4. **"Unauthorized"**: Verify ICP identity setup with `dfx identity whoami`

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug  # For resolver
VITE_DEBUG=true  # For frontend
```

### Getting Help

- Check the individual component READMEs for detailed setup instructions
- Verify all deployment scripts completed successfully
- Ensure environment variables are properly configured
- Test with small amounts first

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Update documentation
5. Submit a pull request

## License

MIT License

## Links

- [Internet Computer](https://internetcomputer.org/)
- [1inch Fusion+](https://docs.1inch.io/docs/fusion-plus/introduction)
- [Base Sepolia](https://docs.base.org/using-base)
- [Hardhat](https://hardhat.org/)
- [React](https://react.dev/)
- Wallet integration for both EVM and ICP
- Real-time swap status tracking
- Token selection and amount configuration
- Resolver discovery and rate comparison

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Rust and Cargo
- DFX (DFINITY Canister SDK)
- Git

### 1. Clone and Install

```bash
git clone <repository-url>
cd icp-fusion

# Install dependencies for all components
cd evm && npm install && cd ..
cd resolver && npm install && cd ..
cd frontend && npm install && cd ..
cd scripts && npm install && cd ..
```

### 2. Deploy Smart Contracts

**Deploy ICP Canisters:**
```bash
cd icp
./canister_deploy.sh
```
*This script automatically creates the required DFX identities (minter and default), starts the local IC replica, and deploys all necessary canisters.*

**Deploy EVM Contracts to Base Sepolia:**
```bash
cd evm
# Configure your .env file first with private key
./deploy-base-sepolia.sh
```
*This script automatically deploys all smart contracts to Base Sepolia testnet and provides the contract addresses for configuration.*

### 3. Configure Environment Variables

Update the environment files with the deployed contract addresses:

**Resolver Configuration (`resolver/.env`):**
```bash
cp .env.example .env
# Add the ICP canister ID and EVM contract addresses from deployment outputs
```

**Frontend Configuration (`frontend/.env`):**
```bash
cp .env.example .env
# Add the ICP canister ID and EVM contract addresses from deployment outputs
```

### 4. Start Development Services

**Terminal 1 - Start Resolver Service:**
```bash
cd resolver
npm run dev
```

**Terminal 2 - Start Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Access the Application

- Frontend: http://localhost:5173
- Resolver API: http://localhost:3000
- ICP Local Network: http://127.0.0.1:8080

## Component Setup Details

### EVM Smart Contracts

```bash
cd evm
npm install
npx hardhat compile

# For Base Sepolia deployment (recommended)
./deploy-base-sepolia.sh

# For local development
npx hardhat node  # In separate terminal
npx hardhat run scripts/deploy.js --network localhost
```

**Environment Configuration:**
Create `evm/.env`:
```env
PRIVATE_KEY=your_ethereum_private_key_without_0x
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ETHERSCAN_API_KEY=your_etherscan_api_key
```

**Deployment Notes:**
- Use the provided `deploy-base-sepolia.sh` script for automatic Base Sepolia deployment
- The script will deploy all contracts and provide addresses for configuration
- Get Base Sepolia ETH from https://bridge.base.org/deposit

### ICP Canister Backend

```bash
cd icp

# Use the automated deployment script (recommended)
./canister_deploy.sh

# Or manual deployment
dfx start --background
dfx deploy
```

**Deployment Notes:**
- Use the provided `canister_deploy.sh` script for automatic setup
- The script creates required DFX identities (minter and default) if they don't exist
- Automatically starts the local IC replica and deploys all canisters
- Provides initial funding for testing

**Environment Configuration:**
- Local development uses `dfx.json` configuration
- The deployment script handles identity creation automatically
- Mainnet deployment requires separate IC identity setup

### Resolver Service

```bash
cd resolver
npm install
cp .env.example .env
# Configure environment variables
npm run dev
```

**Environment Configuration:**
Create `resolver/.env` with:
- ICP canister configuration
- EVM RPC URLs and private keys
- Resolver operational parameters
- Logging configuration

### Frontend Application

```bash
cd frontend
npm install
cp .env.example .env
# Configure environment variables
npm run dev
```

**Environment Configuration:**
Create `frontend/.env` with `VITE_` prefixed variables:
- `VITE_ICP_CANISTER_ID`
- `VITE_ICP_HOST`
- `VITE_EVM_RPC_URL`
- `VITE_EVM_CHAIN_ID`

## Development Workflow

### Testing Configuration

The system uses fast timeouts for development:
- Withdrawal window: 30 seconds
- Public withdrawal: 60 seconds
- Resolver buffers: 90 seconds with retries

This allows complete end-to-end testing in under 5 minutes.

### Production Deployment

1. **Deploy ICP Canister**: `dfx deploy --network ic`
2. **Deploy EVM Contracts**: Deploy to Base Sepolia or mainnet
3. **Configure Resolver**: Update with production addresses
4. **Deploy Frontend**: Build and deploy to hosting service

## Security Considerations

- **Private Key Management**: Store private keys securely, never commit to version control
- **Environment Variables**: Use proper environment variable management
- **Network Configuration**: Verify RPC URLs and chain IDs
- **Fund Safety**: Test with small amounts before large transactions

## Troubleshooting

### Common Issues

1. **"Connection refused"**: Ensure all services are running on correct ports
2. **"Invalid canister ID"**: Verify ICP canister deployment and configuration
3. **"Transaction reverted"**: Check EVM contract deployment and gas limits
4. **"Unauthorized"**: Verify ICP identity and authorization setup

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug  # For resolver
```

### Network Issues

- Verify RPC endpoints are accessible
- Check firewall settings for local development
- Ensure proper CORS configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Update documentation
5. Submit a pull request

## License

MIT License

## Links

- [Internet Computer](https://internetcomputer.org/)
- [1inch Fusion+](https://docs.1inch.io/docs/fusion-plus/introduction)
- [Hardhat](https://hardhat.org/)
- [React](https://react.dev/)
