#!/usr/bin/env bash

echo "🚀 Starting ICP Fusion+ canister deployment..."

# Check if required identities exist, create if they don't
if ! dfx identity list | grep -q "minter"; then
    echo "📝 Creating minter identity..."
    dfx identity new minter
fi

if ! dfx identity list | grep -q "default"; then
    echo "📝 Creating default identity..."
    dfx identity new default
fi

echo "🔧 Starting DFX local replica..."
dfx start --host 127.0.0.1:8080 --clean --background

echo "🔑 Setting up identities and accounts..."
export MINTER_ACCOUNT_ID=$(dfx ledger account-id --of-principal $(dfx identity --identity minter get-principal))
export DEFAULT_ACCOUNT_ID=$(dfx ledger account-id --of-principal $(dfx identity --identity default get-principal))
echo "Minter account created with ID: $MINTER_ACCOUNT_ID"
echo "Default account created with ID: $DEFAULT_ACCOUNT_ID"

echo "📦 Deploying canisters..."
dfx deploy --specified-id ryjl3-tyaaa-aaaaa-aaaba-cai icp_ledger_canister --argument "(variant {Init = record {minting_account = \"$MINTER_ACCOUNT_ID\";initial_values = vec {record {\"$DEFAULT_ACCOUNT_ID\";record {e8s = 10_000_000_000 : nat64;};};};send_whitelist = vec {};transfer_fee = opt record {e8s = 10_000 : nat64;};token_symbol = opt \"LICP\";token_name = opt \"Local ICP\";}})"
dfx deploy internet_identity --argument '(null)'
dfx deploy icp_backend

echo "💰 Transferring initial funds..."
# Get the default account ID dynamically for the transfer
dfx ledger transfer $DEFAULT_ACCOUNT_ID --memo 12345 --icp 10

echo "✅ ICP canisters deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Note down the canister IDs from the output above"
echo "2. Update resolver/.env with the ICP canister ID"
echo "3. Update frontend/.env with the ICP canister ID"
echo "4. Deploy EVM contracts using evm/deploy-base-sepolia.sh"