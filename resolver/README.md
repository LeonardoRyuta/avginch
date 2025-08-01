# ICP Fusion+ Resolver

An Express.js server that acts as a resolver for ICP Fusion+ cross-chain atomic swaps. The resolver automatically fills orders by creating source and destination escrows, providing liquidity, and executing withdrawals.

## Features

- **Cross-chain order filling**: Supports ICP ↔ EVM chains (Ethereum, Polygon, Arbitrum)
- **Automated escrow management**: Creates both source and destination escrows
- **Liquidity provision**: Provides tokens for both sides of the swap
- **Automated execution**: Monitors escrows and executes withdrawals when conditions are met
- **RESTful API**: Easy integration with frontend applications
- **Comprehensive logging**: Winston-based logging for monitoring and debugging
- **Safety mechanisms**: Configurable safety deposits and timelock validation

## Installation

```bash
cd resolver
npm install
```

## Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Configure the environment variables:

```env
# ICP Configuration
ICP_CANISTER_ID=your_canister_id
ICP_HOST=https://ic0.app  # or http://127.0.0.1:4943 for local
ICP_ENV=mainnet  # or local

# EVM Configuration
EVM_RPC_URL=https://eth.llamarpc.com
EVM_PRIVATE_KEY=your_private_key
EVM_ESCROW_SRC_ADDRESS=deployed_src_escrow_address
EVM_ESCROW_DST_ADDRESS=deployed_dst_escrow_address

# Resolver Configuration
PORT=3000
RESOLVER_FEE_PERCENT=0.1
MAX_ORDER_SIZE=1000000000000
SUPPORTED_TOKENS=0x0000000000000000000000000000000000000000
```

## Usage

### Start the resolver

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### API Endpoints

#### Submit an Order
```bash
POST /orders
```

Example request:
```json
{
  "orderHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "srcChain": "icp",
  "dstChain": "ethereum",
  "srcToken": "0x0000000000000000000000000000000000000000",
  "dstToken": "0xA0b86a33E6417d01C97FEf10e4B19e0ab36f22e8",
  "srcAmount": "1000000000",
  "dstAmount": "1000000000000000000",
  "maker": "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae",
  "taker": "0x742d35Cc6E5A69e6d89B134b1234567890123456",
  "deadline": 1734567890,
  "timelocks": {
    "withdrawal": 3600,
    "publicWithdrawal": 7200,
    "cancellation": 86400
  }
}
```

#### Get Order Status
```bash
GET /orders/:orderHash
```

#### Get All Orders
```bash
GET /orders?page=1&limit=50&status=active
```

#### Health Check
```bash
GET /health
```

#### Resolver Info
```bash
GET /info
```

## Order Flow

1. **Order Submission**: Client submits an order via POST /orders
2. **Validation**: Order is validated for format, limits, and deadlines
3. **Secret Generation**: Resolver generates a secret and hashlock
4. **Source Escrow Creation**: Creates escrow on the source chain
5. **Destination Escrow Creation**: Creates escrow on the destination chain
6. **Liquidity Provision**: Resolver provides tokens to the destination escrow
7. **Monitoring**: Waits for the appropriate timelock period
8. **Withdrawal Execution**: Executes withdrawals to complete the swap

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

## Development

### Adding New Chains

1. Add chain configuration to `config` object
2. Implement contract interactions in `contracts.js`
3. Update validation schemas and supported chains list
4. Add chain-specific logic to escrow creation functions

### Adding New Tokens

1. Update `SUPPORTED_TOKENS` environment variable
2. Ensure token contracts are deployed on target chains
3. Add token-specific validation if needed

### Testing

```bash
# Start local development environment
dfx start --background
dfx deploy

# In another terminal, start local EVM node
npx hardhat node

# Deploy EVM contracts
npx hardhat run scripts/deploy.js --network localhost

# Start resolver
npm run dev
```

## Monitoring

The resolver includes comprehensive logging:

- **Access logs**: HTTP request logging via Morgan
- **Application logs**: Structured logging via Winston
- **Error tracking**: Automatic error logging and order failure tracking
- **Health checks**: `/health` endpoint for monitoring systems

Log files:
- `error.log`: Error-level logs only
- `combined.log`: All application logs

## Production Deployment

### Environment Setup

1. **Secure private keys**: Use environment variables or key management services
2. **Configure logging**: Set appropriate log levels and retention policies
3. **Set up monitoring**: Use health checks and log monitoring
4. **Configure limits**: Set appropriate order size limits and fee rates

### Scaling Considerations

- **Database**: Replace in-memory storage with persistent database (PostgreSQL, MongoDB)
- **Load balancing**: Use multiple resolver instances behind a load balancer
- **Queue system**: Implement job queues for order processing (Redis, RabbitMQ)
- **State management**: Use distributed caching for order state

### Security Best Practices

- **Rate limiting**: Implement rate limiting on API endpoints
- **Input validation**: Comprehensive input validation and sanitization
- **HTTPS**: Use TLS encryption for all communications
- **Monitoring**: Monitor for suspicious activity and failed transactions

## Troubleshooting

### Common Issues

1. **"Order already exists"**: Check if order hash is unique
2. **"Order amount exceeds maximum limit"**: Verify order size against MAX_ORDER_SIZE
3. **"Invalid secret"**: Ensure secret matches the hashlock
4. **"Insufficient balance"**: Resolver needs funds on both chains

### Debug Mode

Set log level to debug for verbose output:
```env
LOG_LEVEL=debug
```

### Manual Recovery

If an order gets stuck, you can manually execute withdrawals using the ICP CLI or EVM contract interactions.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License
