mod types;
mod utils;
mod storage;
mod ledger;

use candid::Principal;
use ic_cdk::{caller, export_candid, id, init, post_upgrade, pre_upgrade, query, update};
use serde_bytes::ByteBuf;

use types::{
    EscrowConfig, EscrowError, EscrowEvent, EscrowImmutables, EscrowState, EscrowType, ICPEscrow,
    Result,
};
use utils::{current_time, validate_secret};

/// Convert caller principal to candid principal
fn caller_principal() -> Principal {
    Principal::from_text(&caller().to_text()).unwrap()
}

/// Initialize the canister
#[init]
fn init() {
    storage::init_storage();
}

/// Pre-upgrade hook
#[pre_upgrade]
fn pre_upgrade_hook() {
    storage::pre_upgrade();
}

/// Post-upgrade hook  
#[post_upgrade]
fn post_upgrade_hook() {
    storage::post_upgrade();
}

/// Check if caller is authorized for public operations
#[query]
fn is_authorized() -> bool {
    let caller = caller_principal();
    let config = storage::get_config();
    
    // Treasury is always authorized
    if caller == config.treasury {
        return true;
    }
    
    // Check if caller is in authorized list
    storage::is_authorized_principal(&caller)
}

/// Check if caller is maker or taker for an escrow
fn is_maker_or_taker(escrow: &ICPEscrow, caller_str: &str) -> bool {
    caller_str == escrow.immutables.maker || caller_str == escrow.immutables.taker
}

/// Validate timing constraints for an escrow operation
fn check_timing(
    escrow: &ICPEscrow,
    operation: TimingCheck,
) -> Result<()> {
    let current_time = current_time();
    let timelocks = &escrow.immutables.timelocks;
    
    match operation {
        TimingCheck::PrivateWithdrawal => {
            let start = timelocks.withdrawal_start();
            let end = timelocks.cancellation_start();
            if current_time < start || current_time >= end {
                return Err(EscrowError::InvalidTime);
            }
        }
        TimingCheck::PublicWithdrawal => {
            let start = timelocks.public_withdrawal_start();
            let end = timelocks.cancellation_start();
            if current_time < start || current_time >= end {
                return Err(EscrowError::InvalidTime);
            }
        }
        TimingCheck::Cancellation => {
            let start = timelocks.cancellation_start();
            if current_time < start {
                return Err(EscrowError::InvalidTime);
            }
        }
        TimingCheck::Rescue => {
            let config = storage::get_config();
            let start = timelocks.rescue_start(config.rescue_delay);
            if current_time < start {
                return Err(EscrowError::InvalidTime);
            }
        }
    }
    
    Ok(())
}

enum TimingCheck {
    PrivateWithdrawal,
    PublicWithdrawal,
    Cancellation,
    Rescue,
}

// =============================================================================
// ESCROW CREATION FUNCTIONS
// =============================================================================

/// Create a source escrow for ICP→EVM swaps
#[update]
async fn create_src_escrow(immutables: EscrowImmutables) -> Result<Vec<u8>> {
    let _caller = caller_principal();
    let current_time = current_time();
    let config = storage::get_config();
    
    // Validate immutables
    immutables.validate(&config)?;
    
    // Check if escrow already exists
    if storage::get_escrow(&immutables.hashlock).is_some() {
        return Err(EscrowError::DuplicateEscrow);
    }
    
    // Create escrow with deployment timestamp
    let mut escrow_immutables = immutables.clone();
    escrow_immutables.timelocks.deployed_at = current_time;
    
    let escrow = ICPEscrow {
        immutables: escrow_immutables,
        state: EscrowState::Active,
        icp_tx_hash: None,
        evm_address: None,
        created_at: current_time,
        completed_at: None,
        secret_hash: None,
    };
    
    // Collect creation fee if configured
    if config.creation_fee > 0 {
        let memo = ledger::generate_transfer_memo(
            ledger::TransferOperation::Fee,
            &immutables.hashlock,
        );
        ledger::transfer_to(config.treasury, config.creation_fee + 100, memo).await?;
        
        storage::update_metrics(|metrics| {
            metrics.total_fees_collected += config.creation_fee;
        });
    }

    //Transfer ICP to escrow (safety deposit and amount)
    let transfer_amount = immutables.amount + immutables.safety_deposit;
    let deposit_memo = ledger::generate_transfer_memo(
        ledger::TransferOperation::Deposit,
        &immutables.hashlock,
    );
    ledger::transfer_from_caller(transfer_amount, deposit_memo).await?;
    
    // Store escrow
    let hashlock = immutables.hashlock.clone();
    storage::insert_escrow(hashlock.clone(), escrow)?;
    
    // Log event
    let event = EscrowEvent::EscrowCreated {
        hashlock: hashlock.clone(),
        escrow_type: EscrowType::Source,
        maker: immutables.maker.clone(),
        taker: immutables.taker.clone(),
        amount: immutables.amount,
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(hashlock)
}

/// Create a destination escrow for EVM→ICP swaps
#[update]
async fn create_dst_escrow(immutables: EscrowImmutables) -> Result<Vec<u8>> {
    let _caller = caller_principal();
    let current_time = current_time();
    let config = storage::get_config();
    
    // Validate immutables
    immutables.validate(&config)?;
    
    // Check if escrow already exists
    if storage::get_escrow(&immutables.hashlock).is_some() {
        return Err(EscrowError::DuplicateEscrow);
    }
    
    // Calculate total amount needed (amount + safety deposit + fees)
    let transfer_amount = immutables.amount + immutables.safety_deposit;
    let _fees = ledger::calculate_total_fees(2); // One for deposit, one for fee
    ledger::validate_transfer_amount(transfer_amount, 2)?;
    
    // Transfer ICP to escrow (deposit)
    let deposit_memo = ledger::generate_transfer_memo(
        ledger::TransferOperation::Deposit,
        &immutables.hashlock,
    );
    ledger::transfer_from_caller(transfer_amount, deposit_memo).await?;
    
    // Create escrow with deployment timestamp
    let mut escrow_immutables = immutables.clone();
    escrow_immutables.timelocks.deployed_at = current_time;
    
    let escrow = ICPEscrow {
        immutables: escrow_immutables,
        state: EscrowState::Active,
        icp_tx_hash: None,
        evm_address: None,
        created_at: current_time,
        completed_at: None,
        secret_hash: None,
    };
    
    // Collect creation fee if configured
    if config.creation_fee > 0 {
        let fee_memo = ledger::generate_transfer_memo(
            ledger::TransferOperation::Fee,
            &immutables.hashlock,
        );
        ledger::transfer_from_caller(config.creation_fee, fee_memo).await?;
        
        storage::update_metrics(|metrics| {
            metrics.total_fees_collected += config.creation_fee;
        });
    }
    
    // Store escrow
    let hashlock = immutables.hashlock.clone();
    storage::insert_escrow(hashlock.clone(), escrow)?;
    
    // Update metrics
    storage::update_metrics(|metrics| {
        metrics.total_volume_icp += immutables.amount;
    });
    
    // Log event
    let event = EscrowEvent::EscrowCreated {
        hashlock: hashlock.clone(),
        escrow_type: EscrowType::Destination,
        maker: immutables.maker.clone(),
        taker: immutables.taker.clone(),
        amount: immutables.amount,
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(hashlock)
}

// =============================================================================
// WITHDRAWAL FUNCTIONS
// =============================================================================

/// Private withdrawal for source escrow (ICP→EVM)
#[update]
async fn withdraw_src(secret: ByteBuf, hashlock: ByteBuf) -> Result<()> {
    let caller = caller_principal();
    let caller_str = caller.to_text();
    let current_time = current_time();
    
    let escrow = storage::get_escrow(&hashlock).ok_or(EscrowError::EscrowNotFound)?;
    
    // Validate secret
    if !validate_secret(&secret, &escrow.immutables.hashlock) {
        return Err(EscrowError::InvalidSecret);
    }
    
    // Check state
    if !matches!(escrow.state, EscrowState::Active) {
        return Err(EscrowError::InvalidState);
    }
    
    // Check timing
    // check_timing(&escrow, TimingCheck::PrivateWithdrawal)?;
    
    // Check authorization (maker or taker)
    if !is_maker_or_taker(&escrow, &caller_str) {
        return Err(EscrowError::InvalidCaller);
    }
    
    // Transfer ICP to taker
    let taker_principal = utils::validate_principal(&escrow.immutables.taker)?;
    let withdrawal_memo = ledger::generate_transfer_memo(
        ledger::TransferOperation::Withdrawal,
        &hashlock,
    );
    ledger::transfer_to(taker_principal, escrow.immutables.amount, withdrawal_memo).await?;
    
    // Return safety deposit to maker
    let maker_principal = utils::validate_principal(&escrow.immutables.maker)?;
    let refund_memo = ledger::generate_transfer_memo(
        ledger::TransferOperation::Cancellation,
        &hashlock,
    );
    ledger::transfer_to(maker_principal, escrow.immutables.safety_deposit, refund_memo).await?;
    
    // Update escrow state
    storage::update_escrow(&hashlock, |escrow| {
        escrow.state = EscrowState::Completed;
        escrow.completed_at = Some(current_time);
        escrow.secret_hash = Some(secret.to_vec());
    })?;
    
    // Update metrics
    storage::update_metrics(|metrics| {
        metrics.total_escrows_completed += 1;
        metrics.active_escrows_count = metrics.active_escrows_count.saturating_sub(1);
    });
    
    // Log event
    let event = EscrowEvent::EscrowWithdrawal {
        hashlock: hashlock.to_vec(),
        withdrawer: caller,
        secret: secret.to_vec(),
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(())
}

/// Private withdrawal for destination escrow (EVM→ICP)
#[update]
async fn withdraw_dst(secret: ByteBuf, hashlock: ByteBuf) -> Result<()> {
    let caller = caller_principal();
    let caller_str = caller.to_text();
    let current_time = current_time();
    
    let escrow = storage::get_escrow(&hashlock).ok_or(EscrowError::EscrowNotFound)?;
    
    // Validate secret
    if !validate_secret(&secret, &escrow.immutables.hashlock) {
        return Err(EscrowError::InvalidSecret);
    }
    
    // Check state
    if !matches!(escrow.state, EscrowState::Active) {
        return Err(EscrowError::InvalidState);
    }
    
    // Check timing
    check_timing(&escrow, TimingCheck::PrivateWithdrawal)?;
    
    // Check authorization (maker or taker)
    if !is_maker_or_taker(&escrow, &caller_str) {
        return Err(EscrowError::InvalidCaller);
    }
    
    // Transfer ICP to maker
    let maker_principal = utils::validate_principal(&escrow.immutables.maker)?;
    let withdrawal_memo = ledger::generate_transfer_memo(
        ledger::TransferOperation::Withdrawal,
        &hashlock,
    );
    ledger::transfer_to(maker_principal, escrow.immutables.amount, withdrawal_memo).await?;
    
    // Return safety deposit to taker
    let taker_principal = utils::validate_principal(&escrow.immutables.taker)?;
    let refund_memo = ledger::generate_transfer_memo(
        ledger::TransferOperation::Cancellation,
        &hashlock,
    );
    ledger::transfer_to(taker_principal, escrow.immutables.safety_deposit, refund_memo).await?;
    
    // Update escrow state
    storage::update_escrow(&hashlock, |escrow| {
        escrow.state = EscrowState::Completed;
        escrow.completed_at = Some(current_time);
        escrow.secret_hash = Some(secret.to_vec());
    })?;
    
    // Update metrics
    storage::update_metrics(|metrics| {
        metrics.total_escrows_completed += 1;
        metrics.active_escrows_count = metrics.active_escrows_count.saturating_sub(1);
    });
    
    // Log event
    let event = EscrowEvent::EscrowWithdrawal {
        hashlock: hashlock.to_vec(),
        withdrawer: caller,
        secret: secret.to_vec(),
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(())
}

/// Public withdrawal by authorized principals
#[update]
async fn public_withdraw(secret: ByteBuf, hashlock: ByteBuf, escrow_type: EscrowType) -> Result<()> {
    let caller = caller_principal();
    let current_time = current_time();
    
    // Check authorization
    if !is_authorized() {
        return Err(EscrowError::Unauthorized);
    }
    
    let escrow = storage::get_escrow(&hashlock).ok_or(EscrowError::EscrowNotFound)?;
    
    // Validate secret
    if !validate_secret(&secret, &escrow.immutables.hashlock) {
        return Err(EscrowError::InvalidSecret);
    }
    
    // Check state
    if !matches!(escrow.state, EscrowState::Active) {
        return Err(EscrowError::InvalidState);
    }
    
    // Check timing
    check_timing(&escrow, TimingCheck::PublicWithdrawal)?;
    
    // Execute withdrawal based on escrow type
    match escrow_type {
        EscrowType::Source => {
            // Transfer ICP to taker
            let taker_principal = utils::validate_principal(&escrow.immutables.taker)?;
            let withdrawal_memo = ledger::generate_transfer_memo(
                ledger::TransferOperation::Withdrawal,
                &hashlock,
            );
            ledger::transfer_to(taker_principal, escrow.immutables.amount, withdrawal_memo).await?;
            
            // Return safety deposit to maker
            let maker_principal = utils::validate_principal(&escrow.immutables.maker)?;
            let refund_memo = ledger::generate_transfer_memo(
                ledger::TransferOperation::Cancellation,
                &hashlock,
            );
            ledger::transfer_to(maker_principal, escrow.immutables.safety_deposit, refund_memo).await?;
        }
        EscrowType::Destination => {
            // Transfer ICP to maker
            let maker_principal = utils::validate_principal(&escrow.immutables.maker)?;
            let withdrawal_memo = ledger::generate_transfer_memo(
                ledger::TransferOperation::Withdrawal,
                &hashlock,
            );
            ledger::transfer_to(maker_principal, escrow.immutables.amount, withdrawal_memo).await?;
            
            // Return safety deposit to taker
            let taker_principal = utils::validate_principal(&escrow.immutables.taker)?;
            let refund_memo = ledger::generate_transfer_memo(
                ledger::TransferOperation::Cancellation,
                &hashlock,
            );
            ledger::transfer_to(taker_principal, escrow.immutables.safety_deposit, refund_memo).await?;
        }
    }
    
    // Update escrow state
    storage::update_escrow(&hashlock, |escrow| {
        escrow.state = EscrowState::Completed;
        escrow.completed_at = Some(current_time);
        escrow.secret_hash = Some(secret.to_vec());
    })?;
    
    // Update metrics
    storage::update_metrics(|metrics| {
        metrics.total_escrows_completed += 1;
        metrics.active_escrows_count = metrics.active_escrows_count.saturating_sub(1);
    });
    
    // Log event
    let event = EscrowEvent::EscrowWithdrawal {
        hashlock: hashlock.to_vec(),
        withdrawer: caller,
        secret: secret.to_vec(),
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(())
}

// =============================================================================
// CANCELLATION AND RESCUE FUNCTIONS
// =============================================================================

/// Cancel an escrow and return funds
#[update]
async fn cancel_escrow(hashlock: ByteBuf, escrow_type: EscrowType) -> Result<()> {
    let caller = caller_principal();
    let caller_str = caller.to_text();
    let current_time = current_time();
    
    let escrow = storage::get_escrow(&hashlock).ok_or(EscrowError::EscrowNotFound)?;
    
    // Check state
    if !matches!(escrow.state, EscrowState::Active) {
        return Err(EscrowError::InvalidState);
    }
    
    // Check timing
    check_timing(&escrow, TimingCheck::Cancellation)?;
    
    // Check authorization and execute based on escrow type
    match escrow_type {
        EscrowType::Source => {
            // Only maker can cancel source escrow
            if caller_str != escrow.immutables.maker {
                return Err(EscrowError::InvalidCaller);
            }
            
            // Return all funds to maker
            let maker_principal = utils::validate_principal(&escrow.immutables.maker)?;
            let total_amount = escrow.immutables.amount + escrow.immutables.safety_deposit;
            let cancel_memo = ledger::generate_transfer_memo(
                ledger::TransferOperation::Cancellation,
                &hashlock,
            );
            ledger::transfer_to(maker_principal, total_amount, cancel_memo).await?;
        }
        EscrowType::Destination => {
            // Only taker can cancel destination escrow
            if caller_str != escrow.immutables.taker {
                return Err(EscrowError::InvalidCaller);
            }
            
            // Return all funds to taker
            let taker_principal = utils::validate_principal(&escrow.immutables.taker)?;
            let total_amount = escrow.immutables.amount + escrow.immutables.safety_deposit;
            let cancel_memo = ledger::generate_transfer_memo(
                ledger::TransferOperation::Cancellation,
                &hashlock,
            );
            ledger::transfer_to(taker_principal, total_amount, cancel_memo).await?;
        }
    }
    
    // Update escrow state
    storage::update_escrow(&hashlock, |escrow| {
        escrow.state = EscrowState::Cancelled;
        escrow.completed_at = Some(current_time);
    })?;
    
    // Update metrics
    storage::update_metrics(|metrics| {
        metrics.total_escrows_cancelled += 1;
        metrics.active_escrows_count = metrics.active_escrows_count.saturating_sub(1);
    });
    
    // Log event
    let event = EscrowEvent::EscrowCancelled {
        hashlock: hashlock.to_vec(),
        canceller: caller,
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(())
}

/// Emergency rescue of funds (by taker after delay)
#[update]
async fn rescue_funds(hashlock: ByteBuf, amount: u64) -> Result<()> {
    let caller = caller_principal();
    let caller_str = caller.to_text();
    let current_time = current_time();
    
    let escrow = storage::get_escrow(&hashlock).ok_or(EscrowError::EscrowNotFound)?;
    
    // Only taker can rescue funds
    if caller_str != escrow.immutables.taker {
        return Err(EscrowError::InvalidCaller);
    }
    
    // Check rescue timing
    check_timing(&escrow, TimingCheck::Rescue)?;
    
    // Validate amount
    let canister_balance = ledger::get_balance().await?;
    if amount > canister_balance {
        return Err(EscrowError::InsufficientBalance);
    }
    
    // Transfer requested amount to caller
    let rescue_memo = ledger::generate_transfer_memo(
        ledger::TransferOperation::Rescue,
        &hashlock,
    );
    ledger::transfer_to(caller, amount, rescue_memo).await?;
    
    // Update escrow state if not already terminal
    if matches!(escrow.state, EscrowState::Active) {
        storage::update_escrow(&hashlock, |escrow| {
            escrow.state = EscrowState::Rescued;
            escrow.completed_at = Some(current_time);
        })?;
        
        storage::update_metrics(|metrics| {
            metrics.active_escrows_count = metrics.active_escrows_count.saturating_sub(1);
        });
    }
    
    // Log event
    let event = EscrowEvent::FundsRescued {
        hashlock: hashlock.to_vec(),
        rescuer: caller,
        amount,
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(())
}

// =============================================================================
// RECORD KEEPING FUNCTIONS
// =============================================================================

/// Record ICP transaction hash for verification
#[update]
fn record_icp_tx_hash(hashlock: ByteBuf, tx_hash: String) -> Result<()> {
    let caller = caller_principal();
    let caller_str = caller.to_text();
    let current_time = current_time();
    
    let escrow = storage::get_escrow(&hashlock).ok_or(EscrowError::EscrowNotFound)?;
    
    // Only maker or taker can record tx hash
    if !is_maker_or_taker(&escrow, &caller_str) {
        return Err(EscrowError::InvalidCaller);
    }
    
    // Update escrow
    storage::update_escrow(&hashlock, |escrow| {
        escrow.icp_tx_hash = Some(tx_hash.clone());
    })?;
    
    // Log event
    let event = EscrowEvent::ICPTxRecorded {
        hashlock: hashlock.to_vec(),
        tx_hash,
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(())
}

/// Record EVM address for verification
#[update]
fn record_evm_address(hashlock: ByteBuf, evm_address: String) -> Result<()> {
    let caller = caller_principal();
    let caller_str = caller.to_text();
    let current_time = current_time();
    
    let escrow = storage::get_escrow(&hashlock).ok_or(EscrowError::EscrowNotFound)?;
    
    // Only maker can record EVM address
    if caller_str != escrow.immutables.maker {
        return Err(EscrowError::InvalidCaller);
    }
    
    // Validate EVM address format
    if !utils::validate_evm_address(&evm_address) {
        return Err(EscrowError::InvalidAddress);
    }
    
    // Update escrow
    storage::update_escrow(&hashlock, |escrow| {
        escrow.evm_address = Some(evm_address.clone());
    })?;
    
    // Log event
    let event = EscrowEvent::EVMAddressRecorded {
        hashlock: hashlock.to_vec(),
        address: evm_address,
        timestamp: current_time,
    };
    storage::add_event(event);
    
    Ok(())
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

/// Get escrow details
#[query]
fn get_escrow(hashlock: ByteBuf) -> Option<ICPEscrow> {
    storage::get_escrow(&hashlock)
}

/// Get ICP transaction hash for an escrow
#[query]
fn get_icp_tx_hash(hashlock: ByteBuf) -> Option<String> {
    storage::get_escrow(&hashlock)
        .and_then(|escrow| escrow.icp_tx_hash)
}

/// Get EVM address for an escrow
#[query]
fn get_evm_address(hashlock: ByteBuf) -> Option<String> {
    storage::get_escrow(&hashlock)
        .and_then(|escrow| escrow.evm_address)
}

/// Get current configuration
#[query]
fn get_config() -> EscrowConfig {
    storage::get_config()
}

/// Get escrows for a principal
#[query]
fn get_escrows_for_principal(principal_str: String) -> Vec<(Vec<u8>, ICPEscrow)> {
    storage::get_escrows_for_principal(&principal_str)
}

/// Get recent events
#[query]
fn get_recent_events(limit: u32) -> Vec<EscrowEvent> {
    storage::get_recent_events(limit as usize)
}

/// Get events for a specific escrow
#[query]
fn get_events_for_hashlock(hashlock: ByteBuf) -> Vec<EscrowEvent> {
    storage::get_events_for_hashlock(&hashlock)
}

/// Get metrics
#[query]
fn get_metrics() -> storage::EscrowMetrics {
    storage::get_metrics()
}

/// Get canister balance
#[query]
async fn get_balance() -> Result<u64> {
    ledger::get_balance().await
}

/// Get storage statistics
#[query]
fn get_storage_stats() -> storage::StorageStats {
    storage::get_storage_stats()
}

// =============================================================================
// ADMIN FUNCTIONS
// =============================================================================

/// Update configuration (treasury only)
#[update]
fn set_config(new_config: EscrowConfig) -> Result<()> {
    let caller = caller_principal();
    let current_config = storage::get_config();
    
    // Only treasury can update config
    if caller != current_config.treasury {
        return Err(EscrowError::Unauthorized);
    }
    
    storage::set_config(new_config)
}

/// Add authorized principal (treasury only)
#[update]
fn add_authorized_principal(principal: Principal) -> Result<()> {
    let caller = caller_principal();
    let config = storage::get_config();
    
    // Only treasury can add authorized principals
    if caller != config.treasury {
        return Err(EscrowError::Unauthorized);
    }
    
    storage::add_authorized_principal(principal)
}

/// Remove authorized principal (treasury only)
#[update]
fn remove_authorized_principal(principal: Principal) -> Result<()> {
    let caller = caller_principal();
    let config = storage::get_config();
    
    // Only treasury can remove authorized principals
    if caller != config.treasury {
        return Err(EscrowError::Unauthorized);
    }
    
    storage::remove_authorized_principal(&principal)
}

/// Get authorized principals list (treasury only)
#[query]
fn get_authorized_principals() -> Result<Vec<Principal>> {
    let caller = caller_principal();
    let config = storage::get_config();
    
    // Only treasury can view authorized list
    if caller != config.treasury {
        return Err(EscrowError::Unauthorized);
    }
    
    Ok(storage::get_authorized_principals())
}

// =============================================================================
// TEST/UTILITY FUNCTIONS
// =============================================================================

/// Test greeting function
#[query]
fn greet(name: String) -> String {
    format!("Hello, {}! ICP Fusion+ Escrow is ready for cross-chain atomic swaps.", name)
}

/// Get canister info
#[query]
fn get_canister_info() -> String {
    format!(
        "ICP Fusion+ Escrow Canister\nCanister ID: {}\nVersion: 1.0.0",
        id().to_text()
    )
}

export_candid!();
