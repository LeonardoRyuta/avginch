use candid::{CandidType, Deserialize, Principal};

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct ICPAddress {
    pub address: String,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct Timelocks {
    pub withdrawal: u64,           // Private withdrawal period start (seconds from deployment)
    pub public_withdrawal: u64,    // Public withdrawal period start (seconds from deployment)
    pub cancellation: u64,         // Cancellation period start (seconds from deployment)
    pub deployed_at: u64,          // Deployment timestamp (nanoseconds)
}

impl Timelocks {
    pub fn withdrawal_start(&self) -> u64 {
        self.deployed_at + (self.withdrawal * 1_000_000_000) // Convert seconds to nanoseconds
    }

    pub fn public_withdrawal_start(&self) -> u64 {
        self.deployed_at + (self.public_withdrawal * 1_000_000_000)
    }

    pub fn cancellation_start(&self) -> u64 {
        self.deployed_at + (self.cancellation * 1_000_000_000)
    }

    pub fn rescue_start(&self, rescue_delay: u64) -> u64 {
        self.deployed_at + rescue_delay
    }
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct EscrowImmutables {
    pub order_hash: Vec<u8>,       // 32 bytes - Order hash from EVM
    pub hashlock: Vec<u8>,         // 32 bytes - SHA256 hash of the secret
    pub maker: String,             // EVM address as string (the initiator)
    pub taker: String,             // EVM address as string (the counterparty)
    pub token: String,             // EVM token address (0x0000...0000 for ETH)
    pub amount: u64,               // Amount in smallest unit (wei for ETH, token units)
    pub safety_deposit: u64,       // Safety deposit in ICP e8s (to prevent griefing)
    pub timelocks: Timelocks,
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct ICPEscrow {
    pub immutables: EscrowImmutables,
    pub state: EscrowState,
    pub icp_tx_hash: Option<String>,    // ICP transaction hash for verification
    pub evm_address: Option<String>,    // EVM address for cross-chain verification
    pub created_at: u64,                // Creation timestamp
    pub completed_at: Option<u64>,      // Completion timestamp
    pub secret_hash: Option<Vec<u8>>,   // Store secret hash after withdrawal
}

#[derive(CandidType, Deserialize, Clone, Debug, PartialEq)]
pub enum EscrowState {
    Active,      // Escrow is active and waiting for action
    Completed,   // Escrow completed successfully (secret revealed)
    Cancelled,   // Escrow was cancelled (timeout reached)
    Rescued,     // Funds were rescued after delay
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum EscrowType {
    Source,      // ICP→EVM (ICP locked on ICP, released when EVM secret revealed)
    Destination, // EVM→ICP (ICP released when secret from EVM is provided)
}

#[derive(CandidType, Deserialize, Clone, Debug)]
pub struct EscrowConfig {
    pub rescue_delay: u64,         // Rescue delay in nanoseconds (default: 7 days)
    pub min_amount: u64,           // Minimum ICP amount in e8s
    pub max_amount: u64,           // Maximum ICP amount in e8s  
    pub creation_fee: u64,         // Creation fee in ICP e8s
    pub treasury: Principal,       // Treasury principal for fee collection
    pub min_safety_deposit: u64,   // Minimum safety deposit required
}

impl Default for EscrowConfig {
    fn default() -> Self {
        Self {
            rescue_delay: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
            min_amount: 1_000,                               // 0.00001 ICP
            max_amount: 100_000_000_000,                    // 1000 ICP
            creation_fee: 10_000,                           // 0.0001 ICP
            treasury: Principal::anonymous(),
            min_safety_deposit: 100_000,                    // 0.001 ICP
        }
    }
}

// Error types
#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum EscrowError {
    InvalidCaller,
    InvalidSecret,
    InvalidTime,
    InvalidAmount,
    InvalidState,
    EscrowNotFound,
    TransferFailed,
    Unauthorized,
    InvalidHashlock,
    InsufficientBalance,
    InvalidAddress,
    DuplicateEscrow,
    ConfigError,
}

pub type Result<T> = std::result::Result<T, EscrowError>;

// Event types for logging
#[derive(CandidType, Deserialize, Clone, Debug)]
pub enum EscrowEvent {
    EscrowCreated {
        hashlock: Vec<u8>,
        escrow_type: EscrowType,
        maker: String,
        taker: String,
        amount: u64,
        timestamp: u64,
    },
    EscrowWithdrawal {
        hashlock: Vec<u8>,
        withdrawer: Principal,
        secret: Vec<u8>,
        timestamp: u64,
    },
    EscrowCancelled {
        hashlock: Vec<u8>,
        canceller: Principal,
        timestamp: u64,
    },
    FundsRescued {
        hashlock: Vec<u8>,
        rescuer: Principal,
        amount: u64,
        timestamp: u64,
    },
    ICPTxRecorded {
        hashlock: Vec<u8>,
        tx_hash: String,
        timestamp: u64,
    },
    EVMAddressRecorded {
        hashlock: Vec<u8>,
        address: String,
        timestamp: u64,
    },
}

// Validation helpers
impl EscrowImmutables {
    pub fn validate(&self, config: &EscrowConfig) -> Result<()> {
        // Validate hashlock length (should be 32 bytes for SHA256)
        if self.hashlock.len() != 32 {
            return Err(EscrowError::InvalidHashlock);
        }

        // Validate order hash length (should be 32 bytes)
        if self.order_hash.len() != 32 {
            return Err(EscrowError::InvalidHashlock);
        }

        // Validate amounts
        if self.amount < config.min_amount || self.amount > config.max_amount {
            return Err(EscrowError::InvalidAmount);
        }

        if self.safety_deposit < config.min_safety_deposit {
            return Err(EscrowError::InvalidAmount);
        }

        // Validate addresses (basic check for non-empty)
        if self.maker.is_empty() || self.taker.is_empty() {
            return Err(EscrowError::InvalidAddress);
        }

        // Validate maker != taker
        if self.maker == self.taker {
            return Err(EscrowError::InvalidAddress);
        }

        // Validate timelock ordering
        if self.timelocks.withdrawal >= self.timelocks.public_withdrawal ||
           self.timelocks.public_withdrawal >= self.timelocks.cancellation {
            return Err(EscrowError::InvalidTime);
        }

        Ok(())
    }
}
