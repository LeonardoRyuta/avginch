# ICP Fusion+ Resolver

The resolver service is the coordination layer that enables cross-chain atomic swaps between EVM networks and the Internet Computer Protocol. It handles order management, withdrawal sequencing, and provides the liquidity for atomic swaps.

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- Deployed ICP canisters (use `../icp/canister_deploy.sh`)
- Deployed EVM contracts on Base Sepolia (use `../evm/deploy-base-sepolia.sh`)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with deployed contract addresses

# Start development server
npm run dev
```

## Environment Configuration

Create `.env` file with the following variables:

```env
# ICP Configuration
ICP_CANISTER_ID=rdmx6-jaaaa-aaaaa-aaadq-cai  # From ICP deployment
ICP_HOST=http://127.0.0.1:4943
ICP_ENV=local

# EVM Configuration (Base Sepolia)
EVM_RPC_URL=https://sepolia.base.org
EVM_PRIVATE_KEY=your_private_key_without_0x_prefix  # From EVM deployment
EVM_ICP_ESCROW_FACTORY_ADDRESS=0x...  # From EVM deployment
EVM_GAS_LIMIT=500000

# Resolver Configuration
PORT=3000
RESOLVER_FEE_PERCENT=0.1
MAX_ORDER_SIZE=1000000000000
SUPPORTED_TOKENS=0x0000000000000000000000000000000000000000,0xa0b86a33E6417D01c97fEF10E4B19e0aB36f22E8

# Logging
LOG_LEVEL=info
```

**Required Configuration Steps:**

1. **Deploy ICP Canisters**: Run `../icp/canister_deploy.sh` and copy the `icp_backend` canister ID
2. **Deploy EVM Contracts**: Run `../evm/deploy-base-sepolia.sh` and copy the factory contract address
3. **Update Environment**: Set `ICP_CANISTER_ID` and `EVM_ICP_ESCROW_FACTORY_ADDRESS` from deployment outputs

## API Endpoints

### Health Check
```bash
GET /health
```

### Resolver Info
```bash
GET /info
```

### Order Management
```bash
POST /orders
GET /orders/:orderId
```

## Core Functionality

### Order Flow

1. **Order Submission**: Client submits an order via POST /orders
2. **Validation**: Order is validated for format, limits, and deadlines
3. **Secret Generation**: Resolver generates a secret and hashlock
4. **Source Escrow Creation**: Creates escrow on the source chain
5. **Destination Escrow Creation**: Creates escrow on the destination chain
6. **Liquidity Provision**: Resolver provides tokens to the destination escrow
7. **Monitoring**: Waits for the appropriate timelock period
8. **Withdrawal Execution**: Executes withdrawals to complete the swap

### Cross-Chain Coordination

The resolver implements intelligent coordination between EVM and ICP networks:

- **Extended Timing Buffers**: 90-second delays for ICP operations
- **Smart Sequencing**: EVM withdrawals before ICP for optimal success rates
- **Retry Logic**: Exponential backoff with up to 3.5 minutes of attempts
- **State Synchronization**: Real-time monitoring of escrow states

### Withdrawal Optimization

Key optimizations discovered through testing:

- **Sequential Execution**: EVM → ICP withdrawal order improves success rates
- **Buffer Timing**: Additional 30-second buffers for ICP consensus delays
- **Multiple Retries**: Up to 3 attempts with escalating time delays
- **Error Recovery**: Comprehensive logging and automatic recovery attempts

## Development

### Local Development

```bash
# Start local services first
cd ../icp && ./canister_deploy.sh
cd ../evm && ./deploy-base-sepolia.sh

# Configure resolver
cp .env.example .env
# Update with deployed addresses

# Start resolver
npm run dev
```

### Testing Configuration

The system uses fast timeouts for development:

- **Withdrawal window**: 30 seconds
- **Public withdrawal**: 60 seconds  
- **Resolver buffers**: 90 seconds + retries

This allows complete end-to-end testing in under 5 minutes.

### Integration Testing

```bash
# 1. Deploy all components
cd ../icp && ./canister_deploy.sh
cd ../evm && ./deploy-base-sepolia.sh

# 2. Configure resolver with deployed addresses
cp .env.example .env
# Edit with canister IDs and contract addresses

# 3. Start resolver service
npm run dev

# 4. Test order submission
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "srcChain": "ethereum",
    "dstChain": "icp",
    "srcToken": "0x0000000000000000000000000000000000000000",
    "dstToken": "icp",
    "srcAmount": "1000000000000000000",
    "dstAmount": "100000000",
    "maker": "0x...",
    "taker": "principal...",
    "deadline": 1700000000
  }'
```

## Security Considerations

### Safety Deposits
- Each escrow requires a safety deposit (15% of order amount)
- Safety deposits are returned when the swap completes successfully
- Safety deposits are forfeited if a party acts maliciously

### Timelocks
- **Withdrawal Period**: Only maker/taker can withdraw with secret
- **Public Withdrawal**: Authorized resolvers can execute with secret
- **Cancellation Period**: Appropriate party can cancel and recover funds

### Access Control
- Resolver must have sufficient funds on both chains
- Private keys should be secured and rotated regularly
- Consider using hardware wallets or key management services for production

## Configuration Details

### Adding New Chains

1. Add chain configuration to `config` object
2. Implement contract interactions in `contracts.js`
3. Update validation schemas and supported chains list
4. Add chain-specific logic to escrow creation functions

### Adding New Tokens

1. Update `SUPPORTED_TOKENS` environment variable
2. Ensure token contracts are deployed on target chains
3. Add token-specific validation if needed

### Performance Tuning

Key configuration parameters:

```env
# Timing Configuration
TIMING_BUFFER=90000           # Base timing buffer (ms)
RETRY_ATTEMPTS=3              # Number of retry attempts
RETRY_DELAY=30000            # Delay between retries (ms)

# Order Limits
MAX_ORDER_SIZE=1000000000000  # Maximum order size
MIN_ORDER_SIZE=1000000       # Minimum order size
RESOLVER_FEE_PERCENT=0.1     # Fee percentage

# Network Configuration
EVM_GAS_LIMIT=500000         # Gas limit for EVM transactions
ICP_TRANSFER_FEE=10000       # ICP transfer fee (e8s)
```

## Troubleshooting

### Common Issues

1. **"Canister not found"**: Verify ICP canister deployment and `ICP_CANISTER_ID`
2. **"Transaction reverted"**: Check EVM contract addresses and Base Sepolia ETH balance
3. **"Unauthorized"**: Verify ICP identity setup and private key configuration
4. **"Timing out"**: Increase buffer times for slower networks

### Debug Mode

Enable detailed logging:

```env
LOG_LEVEL=debug
```

This provides comprehensive logging for:
- Order processing steps
- Cross-chain state changes
- Timing and retry information
- Error details and stack traces

### Network Issues

- Verify RPC endpoints are accessible
- Check firewall settings for local development
- Ensure proper CORS configuration for frontend access
- Test with smaller amounts before large orders

## Monitoring

### Health Checks

The resolver provides health endpoints:

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed system info
curl http://localhost:3000/info
```

### Logging

Comprehensive logging includes:

- Order lifecycle events
- Cross-chain transaction hashes
- Timing information
- Error conditions and recovery attempts
- Performance metrics

### Metrics

Track key metrics:

- Order success/failure rates
- Average processing times
- Cross-chain latency
- Error frequency by type

## Production Deployment

### Environment Setup

```env
# Production ICP Configuration
ICP_CANISTER_ID=<mainnet-canister-id>
ICP_HOST=https://ic0.app
ICP_ENV=mainnet

# Production EVM Configuration
EVM_RPC_URL=https://mainnet.base.org
EVM_PRIVATE_KEY=<secure-production-key>

# Production Timing (longer for safety)
TIMING_BUFFER=300000  # 5 minutes
RETRY_ATTEMPTS=5
```

### Security Best Practices

- Use secure key management for production private keys
- Implement proper logging and monitoring
- Set up alerting for failed transactions
- Regular security audits and updates
- Proper backup and disaster recovery procedures

## Contributing

1. Follow Node.js and Express.js best practices
2. Add comprehensive tests for new features
3. Update API documentation
4. Ensure proper error handling
5. Test across different network conditions
