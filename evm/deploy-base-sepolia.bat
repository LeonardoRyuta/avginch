@echo off

REM Deploy to Base Sepolia Script (Windows)
echo 🚀 Deploying ICP Fusion+ contracts to Base Sepolia...

REM Check if .env file exists
if not exist .env (
    echo ❌ .env file not found!
    echo Please create .env file with your PRIVATE_KEY
    echo Example:
    echo PRIVATE_KEY=your_private_key_here
    pause
    exit /b 1
)

REM Check if private key is set
findstr /C:"PRIVATE_KEY=your_private_key_here" .env >nul
if %errorlevel% == 0 (
    echo ❌ PRIVATE_KEY not set in .env file!
    echo Please add your private key to .env file
    pause
    exit /b 1
)

echo 📦 Installing dependencies...
call npm install

echo 🔨 Compiling contracts...
call npm run compile

echo 🌐 Deploying to Base Sepolia...
call npm run deploy:base-sepolia

echo ✅ Deployment completed!
echo.
echo 📋 Next steps:
echo 1. Copy the contract addresses from the output above
echo 2. Update resolver/.env with the deployed addresses
echo 3. Make sure you have some Base Sepolia ETH for testing
echo.
echo 💡 Get Base Sepolia ETH from: https://bridge.base.org/deposit
pause
