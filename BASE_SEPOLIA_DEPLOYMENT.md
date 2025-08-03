# Base Sepolia Deployment Guide

## Prerequisites

1. **Wallet with Base Sepolia ETH** - Get test ETH from [Base Sepolia Bridge](https://bridge.base.org/deposit)
2. **Private Key** - Your wallet's private key (keep this secure!)
3. **Node.js** v18+ installed

## Step 1: Configure Private Key

1. Navigate to the `evm/` directory
2. Open the `.env` file
3. Replace `your_private_key_here` with your actual private key (without 0x prefix)

```bash
# Base Sepolia Deployment Configuration
PRIVATE_KEY=1234567890abcdef...  # Your actual private key here
```

⚠️ **Security Warning**: Never commit your private key to version control!

## Step 2: Deploy Contracts

### On Windows:
```cmd
cd evm
deploy-base-sepolia.bat
```

### On Linux/Mac:
```bash
cd evm
chmod +x deploy-base-sepolia.sh
./deploy-base-sepolia.sh
```

### Manual Deployment:
```bash
cd evm
npm install
npm run compile
npm run deploy:base-sepolia
```

## Step 3: Copy Contract Addresses

After deployment, you'll see output like this:

```
✅ ICPEscrowModule#MockAccessToken deployed at: 0x1234...abcd
✅ ICPEscrowModule#ICPEscrowFactory deployed at: 0x5678...efgh
```

## Step 4: Update Resolver Configuration

1. Navigate to `resolver/.env`
2. Update the contract addresses:

```bash
# Replace with actual deployed addresses
EVM_ICP_ESCROW_FACTORY_ADDRESS=0x5678...efgh
EVM_ACCESS_TOKEN_ADDRESS=0x1234...abcd
EVM_PRIVATE_KEY=your_private_key_here  # Same as deployment key
```

## Step 5: Start the Resolver

```bash
cd resolver
npm install
npm start
```

## Step 6: Test the Setup

```bash
# Health check
curl http://localhost:3000/health

# Get resolver info
curl http://localhost:3000/info
```

## Troubleshooting

### "Insufficient funds" error
- Make sure you have Base Sepolia ETH in your wallet
- Get test ETH from: https://bridge.base.org/deposit

### "Invalid private key" error
- Ensure your private key is correct (64 hex characters)
- Don't include the "0x" prefix in the .env file

### "Network error" error
- Check that Base Sepolia RPC is accessible
- Try using alternative RPC: `https://base-sepolia-rpc.publicnode.com`

### Contract verification
- Add `BASESCAN_API_KEY` to `evm/.env` for automatic verification
- Get API key from: https://basescan.org/apis

## Next Steps

1. Deploy your ICP canister
2. Test cross-chain swaps
3. Monitor resolver logs for any issues

## Production Considerations

- Use a hardware wallet or secure key management
- Set up monitoring and alerting
- Consider using a multi-sig wallet for contract ownership
- Implement proper access controls
