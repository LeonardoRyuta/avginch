use candid::{CandidType, Deserialize, Principal};
use std::collections::HashMap;

use crate::types::{ICPEscrow, EscrowConfig, EscrowEvent, EscrowError, Result};

/// Storage for escrows indexed by hashlock
static mut ESCROWS: Option<HashMap<Vec<u8>, ICPEscrow>> = None;

/// Storage for configuration
static mut CONFIG: Option<EscrowConfig> = None;

/// Storage for authorized principals (who can perform public operations)
static mut AUTHORIZED_PRINCIPALS: Option<Vec<Principal>> = None;

/// Storage for events log
static mut EVENTS: Option<Vec<EscrowEvent>> = None;

/// Storage for metrics
static mut METRICS: Option<EscrowMetrics> = None;

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct EscrowMetrics {
    pub total_escrows_created: u64,
    pub total_escrows_completed: u64,
    pub total_escrows_cancelled: u64,
    pub total_volume_icp: u64,           // Total ICP volume processed
    pub total_fees_collected: u64,       // Total fees collected
    pub active_escrows_count: u64,       // Currently active escrows
}

impl Default for EscrowMetrics {
    fn default() -> Self {
        Self {
            total_escrows_created: 0,
            total_escrows_completed: 0,
            total_escrows_cancelled: 0,
            total_volume_icp: 0,
            total_fees_collected: 0,
            active_escrows_count: 0,
        }
    }
}

/// Initialize storage
pub fn init_storage() {
    unsafe {
        if ESCROWS.is_none() {
            ESCROWS = Some(HashMap::new());
        }
        if CONFIG.is_none() {
            CONFIG = Some(EscrowConfig::default());
        }
        if AUTHORIZED_PRINCIPALS.is_none() {
            AUTHORIZED_PRINCIPALS = Some(Vec::new());
        }
        if EVENTS.is_none() {
            EVENTS = Some(Vec::new());
        }
        if METRICS.is_none() {
            METRICS = Some(EscrowMetrics::default());
        }
    }
}

/// Escrow storage operations
pub fn get_escrow(hashlock: &[u8]) -> Option<ICPEscrow> {
    unsafe {
        ESCROWS.as_ref()?.get(hashlock).cloned()
    }
}

pub fn insert_escrow(hashlock: Vec<u8>, escrow: ICPEscrow) -> Result<()> {
    unsafe {
        if let Some(escrows) = ESCROWS.as_mut() {
            if escrows.contains_key(&hashlock) {
                return Err(EscrowError::DuplicateEscrow);
            }
            escrows.insert(hashlock, escrow);
            
            // Update metrics
            if let Some(metrics) = METRICS.as_mut() {
                metrics.total_escrows_created += 1;
                metrics.active_escrows_count += 1;
            }
            
            Ok(())
        } else {
            Err(EscrowError::ConfigError)
        }
    }
}

pub fn update_escrow<F>(hashlock: &[u8], updater: F) -> Result<()>
where
    F: FnOnce(&mut ICPEscrow),
{
    unsafe {
        if let Some(escrows) = ESCROWS.as_mut() {
            if let Some(escrow) = escrows.get_mut(hashlock) {
                updater(escrow);
                Ok(())
            } else {
                Err(EscrowError::EscrowNotFound)
            }
        } else {
            Err(EscrowError::ConfigError)
        }
    }
}

pub fn get_all_escrows() -> Vec<(Vec<u8>, ICPEscrow)> {
    unsafe {
        ESCROWS.as_ref()
            .map(|escrows| escrows.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default()
    }
}

/// Get escrows for a specific principal (as maker or taker)
pub fn get_escrows_for_principal(principal_str: &str) -> Vec<(Vec<u8>, ICPEscrow)> {
    unsafe {
        ESCROWS.as_ref()
            .map(|escrows| {
                escrows.iter()
                    .filter(|(_, escrow)| {
                        escrow.immutables.maker == principal_str || 
                        escrow.immutables.taker == principal_str
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }
}

/// Configuration operations
pub fn get_config() -> EscrowConfig {
    unsafe {
        CONFIG.as_ref().cloned().unwrap_or_default()
    }
}

pub fn set_config(config: EscrowConfig) -> Result<()> {
    unsafe {
        CONFIG = Some(config);
        Ok(())
    }
}

/// Authorized principals operations
pub fn is_authorized_principal(principal: &Principal) -> bool {
    unsafe {
        AUTHORIZED_PRINCIPALS.as_ref()
            .map(|auths| auths.contains(principal))
            .unwrap_or(false)
    }
}

pub fn add_authorized_principal(principal: Principal) -> Result<()> {
    unsafe {
        if let Some(auths) = AUTHORIZED_PRINCIPALS.as_mut() {
            if !auths.contains(&principal) {
                auths.push(principal);
            }
            Ok(())
        } else {
            Err(EscrowError::ConfigError)
        }
    }
}

pub fn remove_authorized_principal(principal: &Principal) -> Result<()> {
    unsafe {
        if let Some(auths) = AUTHORIZED_PRINCIPALS.as_mut() {
            auths.retain(|p| p != principal);
            Ok(())
        } else {
            Err(EscrowError::ConfigError)
        }
    }
}

pub fn get_authorized_principals() -> Vec<Principal> {
    unsafe {
        AUTHORIZED_PRINCIPALS.as_ref().cloned().unwrap_or_default()
    }
}

/// Event logging operations
pub fn add_event(event: EscrowEvent) {
    unsafe {
        if let Some(events) = EVENTS.as_mut() {
            events.push(event);
            
            // Keep only last 1000 events to prevent unbounded growth
            if events.len() > 1000 {
                events.remove(0);
            }
        }
    }
}

pub fn get_recent_events(limit: usize) -> Vec<EscrowEvent> {
    unsafe {
        EVENTS.as_ref()
            .map(|events| {
                events.iter()
                    .rev()
                    .take(limit)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
}

pub fn get_events_for_hashlock(hashlock: &[u8]) -> Vec<EscrowEvent> {
    unsafe {
        EVENTS.as_ref()
            .map(|events| {
                events.iter()
                    .filter(|event| {
                        match event {
                            EscrowEvent::EscrowCreated { hashlock: h, .. } |
                            EscrowEvent::EscrowWithdrawal { hashlock: h, .. } |
                            EscrowEvent::EscrowCancelled { hashlock: h, .. } |
                            EscrowEvent::FundsRescued { hashlock: h, .. } |
                            EscrowEvent::ICPTxRecorded { hashlock: h, .. } |
                            EscrowEvent::EVMAddressRecorded { hashlock: h, .. } => h == hashlock,
                        }
                    })
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
}

/// Metrics operations
pub fn get_metrics() -> EscrowMetrics {
    unsafe {
        METRICS.as_ref().cloned().unwrap_or_default()
    }
}

pub fn update_metrics<F>(updater: F)
where
    F: FnOnce(&mut EscrowMetrics),
{
    unsafe {
        if let Some(metrics) = METRICS.as_mut() {
            updater(metrics);
        }
    }
}

/// Utility functions for storage management

/// Get storage statistics
pub fn get_storage_stats() -> StorageStats {
    unsafe {
        StorageStats {
            escrows_count: ESCROWS.as_ref().map(|e| e.len()).unwrap_or(0),
            events_count: EVENTS.as_ref().map(|e| e.len()).unwrap_or(0),
            authorized_principals_count: AUTHORIZED_PRINCIPALS.as_ref().map(|a| a.len()).unwrap_or(0),
        }
    }
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct StorageStats {
    pub escrows_count: usize,
    pub events_count: usize,
    pub authorized_principals_count: usize,
}

/// Clear all storage (use with caution - only for testing)
#[cfg(test)]
pub fn clear_all_storage() {
    unsafe {
        ESCROWS = Some(HashMap::new());
        CONFIG = Some(EscrowConfig::default());
        AUTHORIZED_PRINCIPALS = Some(Vec::new());
        EVENTS = Some(Vec::new());
        METRICS = Some(EscrowMetrics::default());
    }
}

/// Pre/post upgrade hooks for stable storage
pub fn pre_upgrade() {
    // TODO: Implement stable storage serialization
    // For now, this is a placeholder
}

pub fn post_upgrade() {
    // TODO: Implement stable storage deserialization
    // For now, reinitialize
    init_storage();
}
