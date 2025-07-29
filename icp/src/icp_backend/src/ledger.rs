use candid::{CandidType, Deserialize, Principal, Nat};
use ic_cdk::{call, id};
use num_traits::ToPrimitive;

use crate::types::{EscrowError, Result};

use ic_cdk_macros::*;
use ic_ledger_types::{
    AccountIdentifier, BlockIndex, Memo, Subaccount, Tokens, DEFAULT_SUBACCOUNT,
    MAINNET_LEDGER_CANISTER_ID
};


// Define Candid-compatible wrapper types for ICP ledger
#[derive(CandidType, Deserialize, Clone, Debug)]
struct TransferArgsCanister {
    memo: u64,
    amount: Nat,
    fee: Nat,
    from_subaccount: Option<Vec<u8>>,
    to: String,
    created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
struct AccountBalanceArgs {
    account: String,
}

/// ICP Ledger canister ID (mainnet)
fn get_icp_ledger_canister_id() -> Principal {
    Principal::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap() // ICP Ledger canister ID
}

/// Standard ICP transfer fee (0.0001 ICP)
pub const TRANSFER_FEE: u64 = 10_000;

/// Minimum transferable amount (must be greater than fee)
pub const MIN_TRANSFER_AMOUNT: u64 = TRANSFER_FEE + 1;

/// Create a simple account representation for the principal
fn get_account_string(principal: &Principal) -> String {
    hex::encode(principal.as_slice())
}

/// Transfer ICP from the caller to this canister
pub async fn transfer_from_caller(amount: u64, memo: u64) -> Result<u64> {
    let canister_id = ic_cdk::api::canister_self();
    let to_subaccount = DEFAULT_SUBACCOUNT;
    let transfer_args = ic_ledger_types::TransferArgs {
        memo: Memo(memo),
        amount: Tokens::from_e8s(amount),
        fee: Tokens::from_e8s(TRANSFER_FEE),
        from_subaccount: None,
        to: AccountIdentifier::new(&canister_id, &to_subaccount),
        created_at_time: None,
    };

    match ic_ledger_types::transfer(get_icp_ledger_canister_id(), &transfer_args).await {
        Ok(result) => result.map_err(|e| {
            ic_cdk::api::debug_print(format!("Canister call error: {:?}", e));
            EscrowError::CanisterCallSuccLedgerError
        }),
        Err(e) => {
            ic_cdk::api::debug_print(format!("Canister call error: {:?}", e));
            Err(EscrowError::CanisterCallError)
        },
    }
}

/// Transfer ICP from this canister to a recipient
pub async fn transfer_to(recipient: Principal, amount: u64, memo: u64) -> Result<u64> {
    let to_subaccount = DEFAULT_SUBACCOUNT;
    let transfer_args = ic_ledger_types::TransferArgs {
        memo: Memo(memo),
        amount: Tokens::from_e8s(amount),
        fee: Tokens::from_e8s(TRANSFER_FEE),
        from_subaccount: None,
        to: AccountIdentifier::new(&recipient, &to_subaccount),
        created_at_time: None,
    };

    match ic_ledger_types::transfer(get_icp_ledger_canister_id(), &transfer_args).await {
        Ok(result) => result.map_err(|e| {
            ic_cdk::api::debug_print(format!("Canister call error: {:?}", e));
            EscrowError::CanisterCallSuccLedgerError
        }),
        Err(e) => {
            ic_cdk::api::debug_print(format!("Canister call error: {:?}", e));
            Err(EscrowError::CanisterCallError)
        },
    }

}

/// Get ICP balance of this canister
pub async fn get_balance() -> Result<u64> {
    let canister_id = id();
    let account_string = get_account_string(&canister_id);

    let args = AccountBalanceArgs {
        account: account_string,
    };

    let result: std::result::Result<(Nat,), (ic_cdk::api::call::RejectionCode, String)> = call(
        get_icp_ledger_canister_id(),
        "account_balance",
        (args,)
    ).await;

    match result {
        Ok((balance,)) => {
            match balance.0.to_u64() {
                Some(bal) => Ok(bal),
                None => Err(EscrowError::TransferFailed),
            }
        }
        Err(_) => Err(EscrowError::TransferFailed),
    }
}

/// Get ICP balance of a specific principal
pub async fn get_balance_of(principal: Principal) -> Result<u64> {
    let account_string = get_account_string(&principal);

    let args = AccountBalanceArgs {
        account: account_string,
    };

    let result: std::result::Result<(Nat,), (ic_cdk::api::call::RejectionCode, String)> = call(
        get_icp_ledger_canister_id(),
        "account_balance",
        (args,)
    ).await;

    match result {
        Ok((balance,)) => {
            match balance.0.to_u64() {
                Some(bal) => Ok(bal),
                None => Err(EscrowError::TransferFailed),
            }
        }
        Err(_) => Err(EscrowError::TransferFailed),
    }
}

/// Transfer ICP between two external accounts (requires authorization)
pub async fn transfer_between(
    _from: Principal,
    to: Principal,
    amount: u64,
    memo: u64,
) -> Result<u64> {
    if amount < MIN_TRANSFER_AMOUNT {
        return Err(EscrowError::InvalidAmount);
    }

    let account_string = get_account_string(&to);

    let transfer_args = TransferArgsCanister {
        memo,
        amount: Nat::from(amount),
        fee: Nat::from(TRANSFER_FEE),
        from_subaccount: None,
        to: account_string,
        created_at_time: None,
    };

    // Note: This would require special authorization in a real implementation
    let result: std::result::Result<(std::result::Result<Nat, String>,), (ic_cdk::api::call::RejectionCode, String)> = call(
        get_icp_ledger_canister_id(),
        "transfer",
        (transfer_args,)
    ).await;

    match result {
        Ok((Ok(block_index),)) => {
            match block_index.0.to_u64() {
                Some(idx) => Ok(idx),
                None => Err(EscrowError::TransferFailed),
            }
        }
        Ok((Err(_),)) => Err(EscrowError::TransferFailed),
        Err(_) => Err(EscrowError::TransferFailed),
    }
}

/// Generate memo for escrow transfers
pub fn generate_transfer_memo(operation: TransferOperation, hashlock: &[u8]) -> u64 {
    // Use first 8 bytes of hashlock combined with operation type
    let operation_byte = match operation {
        TransferOperation::Deposit => 0x01,
        TransferOperation::Withdrawal => 0x02,
        TransferOperation::Cancellation => 0x03,
        TransferOperation::Rescue => 0x04,
        TransferOperation::Fee => 0x05,
    };

    let mut memo_bytes = [0u8; 8];
    memo_bytes[0] = operation_byte;
    
    // Use first 7 bytes of hashlock for uniqueness
    let copy_len = std::cmp::min(hashlock.len(), 7);
    memo_bytes[1..1+copy_len].copy_from_slice(&hashlock[..copy_len]);
    
    u64::from_be_bytes(memo_bytes)
}

/// Transfer operation types for memo generation
#[derive(CandidType, Clone, Copy, Debug)]
pub enum TransferOperation {
    Deposit,       // Initial deposit to escrow
    Withdrawal,    // Withdrawal on secret reveal
    Cancellation,  // Refund on cancellation
    Rescue,        // Emergency rescue
    Fee,           // Fee payment
}

/// Batch transfer for efficiency (when multiple transfers needed)
pub async fn batch_transfer(transfers: Vec<(Principal, u64, u64)>) -> Result<Vec<u64>> {
    let mut results = Vec::new();
    
    for (recipient, amount, memo) in transfers {
        match transfer_to(recipient, amount, memo).await {
            Ok(block_index) => results.push(block_index),
            Err(e) => return Err(e),
        }
    }
    
    Ok(results)
}

/// Verify transfer by checking block
pub async fn verify_transfer(_block_index: u64, _expected_amount: u64) -> Result<bool> {
    // In a real implementation, you would query the ledger for the specific block
    // and verify the transfer details
    // For now, we'll return true as a placeholder
    Ok(true)
}

/// Get transaction history for an account (limited)
pub async fn get_account_transactions(
    _principal: Principal,
    _start: Option<u64>,
    _length: u64,
) -> Result<Vec<u64>> {
    // This would query the ledger for transaction history
    // For now, return empty vector as placeholder
    Ok(Vec::new())
}

/// Calculate total fees for an escrow operation
pub fn calculate_total_fees(num_transfers: u32) -> u64 {
    TRANSFER_FEE * num_transfers as u64
}

/// Validate that an amount is sufficient for transfer including fees
pub fn validate_transfer_amount(amount: u64, num_transfers: u32) -> Result<()> {
    let total_fees = calculate_total_fees(num_transfers);
    let min_required = total_fees + MIN_TRANSFER_AMOUNT;
    
    if amount < min_required {
        return Err(EscrowError::InsufficientBalance);
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_transfer_memo() {
        let hashlock = vec![0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0];
        let memo = generate_transfer_memo(TransferOperation::Deposit, &hashlock);
        
        // Should start with operation byte (0x01)
        let memo_bytes = memo.to_be_bytes();
        assert_eq!(memo_bytes[0], 0x01);
        
        // Should contain hashlock bytes
        assert_eq!(memo_bytes[1], 0x12);
        assert_eq!(memo_bytes[2], 0x34);
    }

    #[test]
    fn test_calculate_total_fees() {
        assert_eq!(calculate_total_fees(1), TRANSFER_FEE);
        assert_eq!(calculate_total_fees(3), TRANSFER_FEE * 3);
    }

    #[test]
    fn test_validate_transfer_amount() {
        // Should fail for amounts too small
        assert!(validate_transfer_amount(TRANSFER_FEE, 1).is_err());
        
        // Should succeed for sufficient amounts
        assert!(validate_transfer_amount(MIN_TRANSFER_AMOUNT + TRANSFER_FEE, 1).is_ok());
    }
}
