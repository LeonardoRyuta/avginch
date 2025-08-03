#!/bin/bash

# Deploy EVM contracts script for ICP Fusion+

echo "🚀 Deploying ICP Fusion+ EVM contracts..."

# Check if we're in the right directory
if [ ! -f "hardhat.config.ts" ]; then
    echo "❌ Please run this script from the evm/ directory"
    exit 1
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."
npm install

# Compile contracts
echo "🔨 Compiling contracts..."
npx hardhat compile

# Deploy contracts
echo "🎯 Deploying contracts to local network..."
npx hardhat ignition deploy ignition/modules/ICPEscrow.ts --network localhost

echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy the deployed contract addresses from the output above"
echo "2. Update your resolver/.env file with:"
echo "   - EVM_ICP_ESCROW_FACTORY_ADDRESS=<factory_address>"
echo "   - EVM_ACCESS_TOKEN_ADDRESS=<access_token_address>"
echo "3. Update EVM_PRIVATE_KEY with your wallet private key"
echo "4. Start your resolver: cd ../resolver && npm start"
