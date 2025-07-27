use candid::Principal;
use ic_cdk::api::time;
use sha2::{Digest, Sha256};

use crate::types::{EscrowError, Result};

/// Compute SHA256 hash of input data
pub fn sha256(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// Validate that the secret matches the hashlock
pub fn validate_secret(secret: &[u8], hashlock: &[u8]) -> bool {
    if secret.is_empty() || hashlock.len() != 32 {
        return false;
    }
    
    let computed_hash = sha256(secret);
    computed_hash == hashlock
}

/// Get current time in nanoseconds
pub fn current_time() -> u64 {
    time()
}

/// Convert nanoseconds to seconds
pub fn nanoseconds_to_seconds(nanoseconds: u64) -> u64 {
    nanoseconds / 1_000_000_000
}

/// Convert seconds to nanoseconds
pub fn seconds_to_nanoseconds(seconds: u64) -> u64 {
    seconds * 1_000_000_000
}

/// Validate EVM address format (basic check)
pub fn validate_evm_address(address: &str) -> bool {
    // Basic validation: should start with 0x and be 42 characters long
    address.len() == 42 && address.starts_with("0x") && address[2..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Validate ICP Principal format
pub fn validate_principal(principal_str: &str) -> Result<Principal> {
    Principal::from_text(principal_str).map_err(|_| EscrowError::InvalidAddress)
}

/// Check if a timestamp is in the future
pub fn is_future_time(timestamp: u64) -> bool {
    timestamp > current_time()
}

/// Check if a timestamp is in the past
pub fn is_past_time(timestamp: u64) -> bool {
    timestamp <= current_time()
}

/// Calculate time remaining until a timestamp
pub fn time_remaining(target_time: u64) -> u64 {
    let current = current_time();
    if target_time > current {
        target_time - current
    } else {
        0
    }
}

/// Validate hex string format
pub fn validate_hex_string(hex_str: &str) -> bool {
    if hex_str.len() % 2 != 0 {
        return false;
    }
    
    hex_str.chars().all(|c| c.is_ascii_hexdigit())
}

/// Convert hex string to bytes
pub fn hex_to_bytes(hex_str: &str) -> Result<Vec<u8>> {
    if !validate_hex_string(hex_str) {
        return Err(EscrowError::InvalidHashlock);
    }
    
    hex::decode(hex_str).map_err(|_| EscrowError::InvalidHashlock)
}

/// Convert bytes to hex string
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    hex::encode(bytes)
}

/// Generate a deterministic ID from immutables (similar to EVM's keccak256)
pub fn generate_escrow_id(order_hash: &[u8], hashlock: &[u8], maker: &str, taker: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(order_hash);
    hasher.update(hashlock);
    hasher.update(maker.as_bytes());
    hasher.update(taker.as_bytes());
    hasher.finalize().to_vec()
}

/// Truncate string for logging purposes
pub fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

/// Format amount in ICP with proper decimals
pub fn format_icp_amount(e8s: u64) -> String {
    let icp = e8s as f64 / 100_000_000.0;
    format!("{:.8} ICP", icp)
}

/// Parse ICP amount string to e8s
pub fn parse_icp_amount(amount_str: &str) -> Result<u64> {
    let amount: f64 = amount_str.parse().map_err(|_| EscrowError::InvalidAmount)?;
    if amount < 0.0 {
        return Err(EscrowError::InvalidAmount);
    }
    Ok((amount * 100_000_000.0) as u64)
}

/// Constants for time periods
pub mod time_constants {
    pub const MINUTE: u64 = 60 * 1_000_000_000;           // 1 minute in nanoseconds
    pub const HOUR: u64 = 60 * MINUTE;                     // 1 hour in nanoseconds
    pub const DAY: u64 = 24 * HOUR;                        // 1 day in nanoseconds
    pub const WEEK: u64 = 7 * DAY;                         // 1 week in nanoseconds
}

/// Constants for ICP amounts
pub mod amount_constants {
    pub const ICP_E8S: u64 = 100_000_000;                  // 1 ICP in e8s
    pub const TRANSFER_FEE: u64 = 10_000;                  // Standard transfer fee (0.0001 ICP)
    pub const MIN_TRANSFER: u64 = TRANSFER_FEE;            // Minimum transferable amount
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256() {
        let data = b"hello world";
        let hash = sha256(data);
        assert_eq!(hash.len(), 32);
    }

    #[test]
    fn test_validate_secret() {
        let secret = b"test_secret";
        let hash = sha256(secret);
        assert!(validate_secret(secret, &hash));
        assert!(!validate_secret(b"wrong_secret", &hash));
    }

    #[test]
    fn test_validate_evm_address() {
        assert!(validate_evm_address("0x742d35Cc6E5A69e6d89B134b1234567890123456"));
        assert!(!validate_evm_address("742d35Cc6E5A69e6d89B134b1234567890123456")); // Missing 0x
        assert!(!validate_evm_address("0x742d35Cc6E5A69e6d89B134b123456789012345")); // Too short
        assert!(!validate_evm_address("0x742d35Cc6E5A69e6d89B134b12345678901234567")); // Too long
    }

    #[test]
    fn test_hex_conversion() {
        let bytes = vec![0x12, 0x34, 0x56, 0x78];
        let hex = bytes_to_hex(&bytes);
        assert_eq!(hex, "12345678");
        
        let back_to_bytes = hex_to_bytes(&hex).unwrap();
        assert_eq!(bytes, back_to_bytes);
    }

    #[test]
    fn test_format_icp_amount() {
        assert_eq!(format_icp_amount(100_000_000), "1.00000000 ICP");
        assert_eq!(format_icp_amount(50_000_000), "0.50000000 ICP");
        assert_eq!(format_icp_amount(1), "0.00000001 ICP");
    }
}
