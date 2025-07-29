#!/usr/bin/env bash

dfx start --host 127.0.0.1:8080 --clean --background

if $MINTER_ACCOUNT_ID; then
    echo "Minter account already set."
else
    dfx identity use minter
    dfx identity new minter --disable-encryption
    MINTER_ACCOUNT_ID=$(dfx identity --identity minter get-principal)
    echo "Minter account created with ID: $MINTER_ACCOUNT_ID"
fi

dfx deploy --specified-id ryjl3-tyaaa-aaaaa-aaaba-cai icp_ledger_canister --argument "(variant {Init = record {minting_account = \"$MINTER_ACCOUNT_ID\";initial_values = vec {record {\"$DEFAULT_ACCOUNT_ID\";record {e8s = 10_000_000_000 : nat64;};};};send_whitelist = vec {};transfer_fee = opt record {e8s = 10_000 : nat64;};token_symbol = opt \"LICP\";token_name = opt \"Local ICP\";}})"
    