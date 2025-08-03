#!/bin/bash

# Deploy to Base Sepolia Script
echo "🚀 Deploying ICP Fusion+ contracts to Base Sepolia..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env file with your PRIVATE_KEY"
    echo "Example:"
    echo "PRIVATE_KEY=your_private_key_here"
    exit 1
fi

# Check if private key is set
if ! grep -q "PRIVATE_KEY=" .env || grep -q "PRIVATE_KEY=your_private_key_here" .env; then
    echo "❌ PRIVATE_KEY not set in .env file!"
    echo "Please add your private key to .env file"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔨 Compiling contracts..."
npm run compile

echo "🌐 Deploying to Base Sepolia..."
npm run deploy:base-sepolia

echo "✅ Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Copy the contract addresses from the output above"
echo "2. Update resolver/.env with the deployed addresses"
echo "3. Make sure you have some Base Sepolia ETH for testing"
echo ""
echo "💡 Get Base Sepolia ETH from: https://bridge.base.org/deposit"
