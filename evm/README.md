# EVM Smart Contracts

This directory contains the Solidity smart contracts for the EVM side of ICP-Fusion, deployed on Base Sepolia testnet.

## Contracts

### Core Contracts

- **`ICPEscrowFactory.sol`**: Factory contract for deterministic escrow deployment using CREATE2
- **`BaseEscrow.sol`**: Base escrow implementation with core atomic swap logic
- **`ICPEscrowSrc.sol`**: Source-side escrow for EVM → ICP swaps
- **`ICPEscrowDst.sol`**: Destination-side escrow for ICP → EVM swaps
### Interface Contracts

- **`IBaseEscrow.sol`**: Interface for base escrow functionality
- **`IEscrow.sol`**: Interface for escrow operations
- **`IEscrowDst.sol`**: Interface for destination escrow operations
- **`IEscrowFactory.sol`**: Interface for factory operations
- **`IICPEscrowFactory.sol`**: Interface for ICP-specific factory operations

### Library Contracts

- **`AddressLib.sol`**: Address utility functions
- **`ImmutablesLib.sol`**: Immutable data handling
- **`ProxyHashLib.sol`**: Proxy contract hash calculations
- **`TimelocksLib.sol`**: Timelock utility functions

## Quick Start

### Prerequisites

- Node.js 18+
- Base Sepolia ETH (get from https://bridge.base.org/deposit)

### Automated Deployment (Recommended)

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your PRIVATE_KEY (without 0x prefix)

# Deploy to Base Sepolia
./deploy-base-sepolia.sh
```

### Manual Setup

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Deploy to Base Sepolia (manual)
npm run deploy:base-sepolia
```

## Environment Configuration

Create `.env` file with the following variables:

```env
# Required: Private key for contract deployment (without 0x prefix)
PRIVATE_KEY=your_ethereum_private_key_without_0x

# Required: RPC URL for Base Sepolia testnet
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Optional: Etherscan API key for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# Optional: Local network RPC (defaults to http://127.0.0.1:8545)
LOCAL_RPC_URL=http://127.0.0.1:8545

# Optional: Gas price settings
GAS_PRICE=20000000000
GAS_LIMIT=500000
```

## Deployment Script

The `deploy-base-sepolia.sh` script automates the entire deployment process:

1. Checks for proper `.env` configuration
2. Installs dependencies
3. Compiles contracts
4. Deploys to Base Sepolia testnet
5. Provides contract addresses for configuration

**What you need:**
- Base Sepolia ETH in your wallet
- Private key in `.env` file

**Script output:**
- Contract addresses for resolver and frontend configuration
- Deployment transaction hashes
- Gas usage information

## Local Development

For local development with Hardhat:

```bash
# Start local Ethereum node
npx hardhat node

# Deploy to local network (in another terminal)
npx hardhat run scripts/deploy.js --network localhost

# Run tests
npm test
```

## Contract Architecture

### Factory Pattern

The system uses a factory pattern for deterministic escrow deployment:

```solidity
contract ICPEscrowFactory {
    function createEscrow(bytes32 salt) external returns (address) {
        return Clones.cloneDeterministic(implementation, salt);
    }
}
```

### Deterministic Addresses

Escrow addresses are calculated using CREATE2:

```solidity
bytes32 salt = keccak256(abi.encodePacked(
    orderHash,
    maker,
    taker,
    token,
    amount,
    timelocks
));
```

### Timelock System

Multiple timelock periods ensure fund safety:

- **Withdrawal Period**: Only authorized parties can withdraw with secret
- **Public Withdrawal**: Resolvers can execute after timelock
- **Cancellation Period**: Fallback recovery mechanism

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/EscrowFactory.test.js

# Run tests with gas reporting
REPORT_GAS=true npm test

# Run tests with coverage
npm run coverage
```

## Gas Optimization

The contracts include several gas optimizations:

- **Packed Structs**: Multiple values in single storage slots
- **Immutable Variables**: Deployment-time constants
- **CREATE2**: Deterministic deployment without additional calls
- **Assembly**: Critical path optimizations

## Security Features

- **Immutable Core Logic**: Cannot be changed after deployment
- **Time-locked Mechanisms**: Automatic fund recovery
- **Public Withdrawal**: Community-based emergency recovery
- **Reentrancy Protection**: Safe external calls
- **Input Validation**: Comprehensive parameter checking

## Deployment Networks

### Base Sepolia (Recommended)

- **Chain ID**: 84532
- **RPC URL**: https://sepolia.base.org
- **Explorer**: https://sepolia.basescan.org
- **Faucet**: https://bridge.base.org/deposit

### Local Network

- **Chain ID**: 31337
- **RPC URL**: http://127.0.0.1:8545
- **Accounts**: Hardhat's default accounts

## Troubleshooting

### Common Issues

1. **"Insufficient funds"**: Ensure you have Base Sepolia ETH
2. **"Private key not found"**: Check `.env` file configuration
3. **"Network not found"**: Verify RPC URL in Hardhat config
4. **"Gas limit exceeded"**: Increase gas limit in `.env`

### Getting Base Sepolia ETH

1. Go to https://bridge.base.org/deposit
2. Bridge ETH from Ethereum Sepolia to Base Sepolia
3. Or use Base-specific faucets

### Verification

After deployment, verify contracts on BaseScan:

```bash
npx hardhat verify --network base-sepolia <contract-address> <constructor-args>
```

## Scripts

Available npm scripts:

```bash
npm run compile          # Compile contracts
npm run test            # Run tests
npm run deploy:local    # Deploy to local network
npm run deploy:base-sepolia  # Deploy to Base Sepolia
npm run verify          # Verify contracts on explorer
npm run clean           # Clean build artifacts
```

## Integration

After deployment, update other components with contract addresses:

1. **Resolver**: Update `EVM_ICP_ESCROW_FACTORY_ADDRESS` in `resolver/.env`
2. **Frontend**: Update `VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS` in `frontend/.env`

## Contributing

1. Follow Solidity style guide
2. Add tests for new functionality
3. Update documentation
4. Ensure gas optimization
5. Test on Base Sepolia before mainnet
