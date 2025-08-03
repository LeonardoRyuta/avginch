@echo off
echo 🚀 Deploying ICP Fusion+ EVM contracts...

REM Check if we're in the right directory
if not exist "hardhat.config.ts" (
    echo ❌ Please run this script from the evm/ directory
    exit /b 1
)

REM Install dependencies if needed
echo 📦 Installing dependencies...
call npm install

REM Compile contracts
echo 🔨 Compiling contracts...
call npx hardhat compile

REM Deploy contracts
echo 🎯 Deploying contracts to local network...
call npx hardhat ignition deploy ignition/modules/ICPEscrow.ts --network localhost

echo ✅ Deployment complete!
echo.
echo 📋 Next steps:
echo 1. Copy the deployed contract addresses from the output above
echo 2. Update your resolver/.env file with:
echo    - EVM_ICP_ESCROW_FACTORY_ADDRESS=^<factory_address^>
echo    - EVM_ACCESS_TOKEN_ADDRESS=^<access_token_address^>
echo 3. Update EVM_PRIVATE_KEY with your wallet private key
echo 4. Start your resolver: cd ../resolver ^&^& npm start
