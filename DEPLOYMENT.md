# ICP Fusion+ Deployment Guide

## Prerequisites

1. **Node.js** (v18 or later)
2. **Git**
3. **Local Hardhat node** running on port 8545
4. **Wallet with test ETH** for deployments

## Step 1: Start Local Blockchain

In a separate terminal, navigate to the `evm/` directory and start Hardhat:

```bash
cd evm
npx hardhat node
```

This will:
- Start a local blockchain on `http://127.0.0.1:8545`
- Create 20 test accounts with 10,000 ETH each
- Display account addresses and private keys

## Step 2: Deploy EVM Contracts

### Option A: Using the deployment script (Recommended)

**On Windows:**
```cmd
cd evm
deploy.bat
```

**On Linux/Mac:**
```bash
cd evm
chmod +x deploy.sh
./deploy.sh
```

### Option B: Manual deployment

```bash
cd evm
npm install
npx hardhat compile
npx hardhat ignition deploy ignition/modules/ICPEscrow.ts --network localhost
```

## Step 3: Configure Resolver

1. **Copy contract addresses** from the deployment output
2. **Update `resolver/.env`** with the deployed addresses:

```bash
# Use one of the private keys from hardhat node output
EVM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Contract addresses from deployment
EVM_ICP_ESCROW_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
EVM_ACCESS_TOKEN_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# ICP Configuration (adjust as needed)
ICP_CANISTER_ID=uzt4z-lp777-77774-qaabq-cai
ICP_HOST=http://127.0.0.1:8080
```

## Step 4: Start the Resolver

```bash
cd resolver
npm install
npm start
```

The resolver will start on `http://localhost:3000`

## Step 5: Test the Setup

### Health Check
```bash
curl http://localhost:3000/health
```

### Get Resolver Info
```bash
curl http://localhost:3000/info
```

### Submit a Test Order
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderHash": "0x1234567890123456789012345678901234567890123456789012345678901234",
    "srcChain": "ethereum",
    "dstChain": "icp",
    "srcToken": "0x0000000000000000000000000000000000000000",
    "dstToken": "ICP",
    "srcAmount": "1000000000000000000",
    "dstAmount": "100000000",
    "maker": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "taker": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "deadline": '$(date -d "+1 hour" +%s)',
    "timelocks": {
      "withdrawal": 300,
      "publicWithdrawal": 600,
      "cancellation": 3600
    }
  }'
```

## Access Token Handling

The MockAccessToken contract allows anyone to mint tokens for free:

```bash
# If you need to mint access tokens manually (the resolver does this automatically)
npx hardhat console --network localhost

# In the console:
const token = await ethers.getContractAt("MockAccessToken", "YOUR_TOKEN_ADDRESS");
await token.mintToSelf(); // Mint 1 token to your address
```

## Troubleshooting

### 1. "Insufficient funds" error
- Make sure your wallet has enough ETH for gas fees
- Check that you're using the correct private key from hardhat node

### 2. "Access token" related errors
- The resolver automatically mints access tokens
- If issues persist, manually mint tokens using the console commands above

### 3. "Contract not deployed" error
- Verify contract addresses in your `.env` file
- Ensure hardhat node is running and contracts are deployed

### 4. "Invalid network" error
- Make sure hardhat node is running on port 8545
- Check that `EVM_RPC_URL` is set to `http://127.0.0.1:8545`

## Production Deployment

For production:

1. Replace `MockAccessToken` with a real access control mechanism
2. Deploy to mainnet/testnet instead of localhost
3. Use a secure private key management solution
4. Set up proper monitoring and logging
5. Use a production database instead of in-memory storage

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │────│    Resolver     │────│  ICP Canister   │
│                 │    │  (Express.js)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              │
                    ┌─────────────────┐
                    │ ICPEscrowFactory│
                    │   (EVM Chain)   │
                    └─────────────────┘
                              │
                    ┌─────────────────┐
                    │   Escrow Proxies│
                    │ (Src/Dst Escrows)│
                    └─────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/info` | Resolver information |
| GET | `/liquidity` | Liquidity status |
| GET | `/stats` | Resolver statistics |
| POST | `/orders` | Submit order |
| GET | `/orders/:hash` | Get order status |
| GET | `/orders` | List orders |
| POST | `/orders/:hash/cancel` | Cancel order |
