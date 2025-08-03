#!/usr/bin/env bash

dfx start --host 127.0.0.1:8080 --clean --background


export MINTER_ACCOUNT_ID=$(dfx ledger account-id --of-principal $(dfx identity --identity minter get-principal))
export DEFAULT_ACCOUNT_ID=$(dfx ledger account-id --of-principal $(dfx identity --identity leo-dev get-principal))
echo "Minter account created with ID: $MINTER_ACCOUNT_ID"
echo "Default account created with ID: $DEFAULT_ACCOUNT_ID"

dfx deploy --specified-id ryjl3-tyaaa-aaaaa-aaaba-cai icp_ledger_canister --argument "(variant {Init = record {minting_account = \"$MINTER_ACCOUNT_ID\";initial_values = vec {record {\"$DEFAULT_ACCOUNT_ID\";record {e8s = 10_000_000_000 : nat64;};};};send_whitelist = vec {};transfer_fee = opt record {e8s = 10_000 : nat64;};token_symbol = opt \"LICP\";token_name = opt \"Local ICP\";}})"
dfx deploy internet_identity --argument '(null)'
dfx deploy icp_backend

dfx ledger transfer 1bf1f6e7030eea8e3f95075c2e941727f5543f02da5c7400722e521618b9daa7 --memo 12345 --icp 10