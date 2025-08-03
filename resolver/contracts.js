import { ethers } from 'ethers';
import { Actor, HttpAgent } from '@dfinity/agent';

// Helper function to safely normalize and validate Ethereum addresses
function safeGetAddress(address) {
    // Remove any whitespace and ensure it starts with 0x
    const cleaned = address.trim();
    
    // Check if it's a valid hex address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(cleaned)) {
        throw new Error(`Invalid Ethereum address format: ${address}`);
    }
    
    try {
        // Use ethers.getAddress to get the checksummed version
        return ethers.getAddress(cleaned);
    } catch (error) {
        throw new Error(`Invalid Ethereum address: ${address}. ${error.message}`);
    }
}

// Helper function to convert Ethereum address to uint256 (Address type)
function addressToUint256(address) {
    const checksummedAddress = safeGetAddress(address);
    return BigInt(checksummedAddress);
}

// Helper function to pack timelocks into a single uint256 value (matching contracts)
// CRITICAL: Include deployedAt timestamp like the working EVM-to-BTC implementation
function packTimelocks(withdrawal, publicWithdrawal, cancellation, deployedAt) {
    // Pack timelocks according to contract format exactly like EVM-to-BTC script
    // The contract will overwrite deployedAt with block.timestamp, but we need to include it
    return (BigInt(deployedAt) << 224n) |
           (BigInt(cancellation) << 64n) |
           (BigInt(publicWithdrawal) << 32n) |
           BigInt(withdrawal);
}

// Create a simple logger for this module
const logger = {
    info: (message) => console.log(`[INFO] ${message}`),
    warn: (message) => console.warn(`[WARN] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`)
};

// ICP Escrow Factory ABI - corrected to match actual Address type (uint256) expectations
const icpEscrowFactoryABI = [
    "function createSrcEscrow(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external payable",
    "function createDstEscrow(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external payable",
    "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
    "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
    "function creationFee() external view returns (uint256)",
    "function ICP_ESCROW_SRC_IMPLEMENTATION() external view returns (address)",
    "function ICP_ESCROW_DST_IMPLEMENTATION() external view returns (address)",
    "event SrcEscrowCreated(address escrow, bytes32 hashlock, uint256 maker, address indexed creator)",
    "event DstEscrowCreated(address escrow, bytes32 hashlock, uint256 taker, address indexed creator)"
];

// Individual Escrow ABI for withdraw/cancel operations
const icpEscrowABI = [
    "function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
    "function publicWithdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
    "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external"
];

const erc20ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function mint(address to, uint256 amount) external"
];

export class EVMContractManager {
    constructor(provider, wallet, icpEscrowFactoryAddress, accessTokenAddress) {
        this.provider = provider;
        this.wallet = wallet;
        this.icpEscrowFactoryAddress = icpEscrowFactoryAddress;
        this.accessTokenAddress = accessTokenAddress;

        this.orderList = {}; // Store orders by ID for easy access
        
        this.icpEscrowFactory = new ethers.Contract(icpEscrowFactoryAddress, icpEscrowFactoryABI, wallet);
        
        // Add access token contract if provided
        if (accessTokenAddress && accessTokenAddress !== '0x0000000000000000000000000000000000000000') {
            this.accessTokenContract = new ethers.Contract(accessTokenAddress, erc20ABI, wallet);
        }
    }
    
    async ensureAccessToken() {
        if (!this.accessTokenContract) return;
        
        try {
            const balance = await this.accessTokenContract.balanceOf(this.wallet.address);
            if (balance === 0n) {
                // Try to mint 1 access token if we don't have any
                const tx = await this.accessTokenContract.mint(this.wallet.address, ethers.parseEther("1"));
                await tx.wait();
                logger.info("Minted access token for resolver");
            }
        } catch (error) {
            logger.warn("Could not ensure access token:", error.message);
        }
    }
    

    
    async createEVMSourceEscrow(orderData) {
        console.log('Creating EVM source escrow...');
        // Ensure we have access tokens
        await this.ensureAccessToken();
        console.log('Ensured access token is available');
        
        const { orderHash, hashlockHex, srcToken, srcAmount, safetyDeposit, timelocks } = orderData;
        
        // For EVM source escrow (EVM->ICP), we need EVM addresses for the contract
        // The EVM contract can only work with EVM addresses for authentication
        // NEVER fall back to potentially ICP addresses - this causes ENS resolution errors
        if (!orderData.takerEVMAddress || !orderData.makerEVMAddress) {
            throw new Error('Missing required EVM addresses for EVM source escrow. Both takerEVMAddress and makerEVMAddress must be provided.');
        }
        
        const maker = orderData.takerEVMAddress; // EVM address that can authenticate
        const taker = orderData.makerEVMAddress; // Other EVM address
        
        // Validate that we have valid EVM addresses
        const checksummedMaker = safeGetAddress(maker);
        const checksummedTaker = safeGetAddress(taker);
        const checksummedToken = safeGetAddress(srcToken);
        
        console.log(`EVM Source Escrow addresses - Maker: ${checksummedMaker}, Taker: ${checksummedTaker}, Token: ${checksummedToken}`);
        
        // CRITICAL: Use the same immutables struct for both prediction and deployment
        // Call addressOfEscrowSrc immediately before deployment in same transaction block
        const immutables = this.formatImmutables(orderData);
        
        // DEBUGGING: Get predicted address before deployment
        let predictedAddress;
        try {
            predictedAddress = await this.icpEscrowFactory.addressOfEscrowSrc(immutables);
            console.log("Predicted escrow address:", predictedAddress);
        } catch (error) {
            console.log("Failed to predict address:", error.message);
        }
        
        // Get creation fee from factory
        const creationFee = await this.icpEscrowFactory.creationFee();
        console.log(`Creation fee for EVM source escrow: ${creationFee}`);
        
        let totalEthRequired = BigInt(safetyDeposit) + BigInt(creationFee);
        let tx;
        
        if (srcToken === '0x0000000000000000000000000000000000000000') {
            console.log('Creating ETH source escrow - no token involved');
            // ETH escrow - include the ETH amount in the transaction value
            totalEthRequired += BigInt(srcAmount);
            
            tx = await this.icpEscrowFactory.createSrcEscrow(immutables, {
                value: totalEthRequired,
                gasLimit: 500000
            });
            console.log('Created ETH source escrow transaction:', tx.hash);
        } else {
            // ERC20 escrow - approve and transfer tokens
            const checksummedToken = safeGetAddress(srcToken);
            const tokenContract = new ethers.Contract(checksummedToken, erc20ABI, this.wallet);
            
            // Check allowance and approve if needed
            const allowance = await tokenContract.allowance(this.wallet.address, this.icpEscrowFactoryAddress);
            if (allowance < BigInt(srcAmount)) {
                const approveTx = await tokenContract.approve(this.icpEscrowFactoryAddress, srcAmount);
                await approveTx.wait();
            }
            
            console.log('Creating ERC20 source escrow - token involved');
            
            tx = await this.icpEscrowFactory.createSrcEscrow(immutables, {
                value: totalEthRequired, // ETH for safety deposit + creation fee
                gasLimit: 500000
            });
        }
        
        const receipt = await tx.wait();
        console.log("Transaction receipt received, logs count:", receipt.logs.length);
        
        // Get the escrow address from the event - fix event parsing
        const event = receipt.logs.find(log => {
            try {
                const parsed = this.icpEscrowFactory.interface.parseLog(log);
                console.log("Parsed event:", parsed.name, parsed.args);
                return parsed.name === 'SrcEscrowCreated';
            } catch (error) {
                console.log("Failed to parse log:", error.message);
                return false;
            }
        });
        
        let escrowAddress = null;
        if (event) {
            const parsed = this.icpEscrowFactory.interface.parseLog(event);
            escrowAddress = parsed.args.escrow;
            console.log("Actual deployed escrow address:", escrowAddress);
            
            // Compare predicted vs actual address - they WILL be different due to timestamp mismatch
            if (predictedAddress) {
                if (predictedAddress.toLowerCase() === escrowAddress.toLowerCase()) {
                    console.log("✅ Predicted and actual addresses MATCH!");
                } else {
                    console.log("❌ Address MISMATCH (expected due to different block.timestamp):");
                    console.log("  Predicted:", predictedAddress);
                    console.log("  Actual:   ", escrowAddress);
                    console.log("  Using ACTUAL address for operations");
                }
            }
            
            // Store the ACTUAL escrow address AND the deployment block timestamp for later use
            if (!this.orderList) this.orderList = {};
            this.orderList[orderData.orderHash] = {
                orderHash: orderData.orderHash,
                hashlock: `0x${orderData.hashlockHex}`,
                maker: checksummedMaker,
                taker: checksummedTaker,
                token: checksummedToken,
                amount: srcAmount,
                safetyDeposit,
                timelocks: immutables.timelocks.toString(),
                actualEscrowAddress: escrowAddress, // Store the REAL address from event
                deploymentImmutables: immutables, // Store the immutables used for deployment
                deploymentBlockNumber: receipt.blockNumber, // Store deployment block for timestamp lookup
                deploymentTransactionHash: receipt.hash // Store tx hash for timestamp lookup
            };
        } else {
            console.log("No SrcEscrowCreated event found in transaction logs");
            // Let's also log all events to see what we got
            receipt.logs.forEach((log, index) => {
                try {
                    const parsed = this.icpEscrowFactory.interface.parseLog(log);
                    console.log(`Event ${index}:`, parsed.name, parsed.args);
                } catch (error) {
                    console.log(`Log ${index}: Could not parse with factory interface`);
                }
            });
        }
        
        return { 
            transactionHash: receipt.hash, 
            blockNumber: receipt.blockNumber,
            escrowAddress 
        };
    }
    
    async createEVMDestinationEscrow(orderData) {
        // Ensure we have access tokens
        await this.ensureAccessToken();
        
        const { orderHash, hashlockHex, dstToken, dstAmount, safetyDeposit, timelocks } = orderData;
        
        // For EVM destination escrow (ICP->EVM), we need EVM addresses for the contract
        // NEVER fall back to potentially ICP addresses - this causes ENS resolution errors
        if (!orderData.makerEVMAddress || !orderData.takerEVMAddress) {
            throw new Error('Missing required EVM addresses for EVM destination escrow. Both makerEVMAddress and takerEVMAddress must be provided.');
        }
        
        const maker = orderData.makerEVMAddress; // EVM address that can authenticate
        const taker = orderData.takerEVMAddress; // Other EVM address
        
        // Ensure all are valid EVM addresses
        const checksummedMaker = safeGetAddress(maker);
        const checksummedTaker = safeGetAddress(taker);
        const checksummedToken = safeGetAddress(dstToken);
        
        console.log(`EVM Dest Escrow addresses - Maker: ${checksummedMaker}, Taker: ${checksummedTaker}, Token: ${checksummedToken}`);
        
        // CRITICAL: Use the same immutables struct for both prediction and deployment
        // The contract will handle block.timestamp automatically
        const immutables = this.formatImmutables(orderData);
        
        // Get creation fee from factory
        const creationFee = await this.icpEscrowFactory.creationFee();
        
        let totalEthRequired = BigInt(safetyDeposit) + BigInt(creationFee);
        let tx;
        
        if (dstToken === '0x0000000000000000000000000000000000000000') {
            // ETH escrow - include the ETH amount in the transaction value
            totalEthRequired += BigInt(dstAmount);
            
            tx = await this.icpEscrowFactory.createDstEscrow(immutables, {
                value: totalEthRequired,
                gasLimit: 500000
            });
        } else {
            // ERC20 escrow - approve and transfer tokens
            const tokenContract = new ethers.Contract(dstToken, erc20ABI, this.wallet);
            
            // Check allowance and approve if needed
            const allowance = await tokenContract.allowance(this.wallet.address, this.icpEscrowFactoryAddress);
            if (allowance < BigInt(dstAmount)) {
                const approveTx = await tokenContract.approve(this.icpEscrowFactoryAddress, dstAmount);
                await approveTx.wait();
            }
            
            tx = await this.icpEscrowFactory.createDstEscrow(immutables, {
                value: totalEthRequired, // ETH for safety deposit + creation fee
                gasLimit: 500000
            });
        }
        
        const receipt = await tx.wait();
        
        // Get the escrow address from the event
        const event = receipt.logs.find(log => {
            try {
                const parsed = this.icpEscrowFactory.interface.parseLog(log);
                console.log("Parsed destination event:", parsed.name, parsed.args);
                return parsed.name === 'DstEscrowCreated';
            } catch (error) {
                console.log("Failed to parse destination log:", error.message);
                return false;
            }
        });
        
        let escrowAddress = null;
        if (event) {
            const parsed = this.icpEscrowFactory.interface.parseLog(event);
            escrowAddress = parsed.args.escrow;
            console.log("Actual deployed destination escrow address:", escrowAddress);
            
            // Store the ACTUAL escrow address AND the deployment block timestamp for later use
            if (!this.orderList) this.orderList = {};
            this.orderList[orderData.orderHash] = {
                orderHash: orderData.orderHash,
                hashlock: `0x${orderData.hashlockHex}`,
                maker: orderData.makerEVMAddress,
                taker: orderData.takerEVMAddress,
                token: dstToken,
                amount: dstAmount,
                safetyDeposit,
                timelocks: immutables.timelocks.toString(),
                actualEscrowAddress: escrowAddress, // Store the REAL address from event
                deploymentImmutables: immutables, // Store the immutables used for deployment
                deploymentBlockNumber: receipt.blockNumber, // Store deployment block for timestamp lookup
                deploymentTransactionHash: receipt.hash // Store tx hash for timestamp lookup
            };
        } else {
            console.log("No DstEscrowCreated event found in transaction logs");
        }
        
        return { 
            transactionHash: receipt.hash, 
            blockNumber: receipt.blockNumber,
            escrowAddress 
        };
    }
    
    /**
     * Reconstruct the correct immutables that were actually used during deployment
     * This includes the real block.timestamp that was set during deployment
     */
    async getActualDeploymentImmutables(orderData) {
        const orderInfo = this.orderList?.[orderData.orderHash];
        if (!orderInfo || !orderInfo.deploymentBlockNumber) {
            throw new Error(`No deployment info found for order ${orderData.orderHash}`);
        }
        
        // Get the block where the escrow was deployed to get the timestamp
        const block = await this.provider.getBlock(orderInfo.deploymentBlockNumber);
        const deploymentTimestamp = block.timestamp;
        
        console.log(`Reconstructing immutables with actual deployment timestamp: ${deploymentTimestamp}`);
        console.log(`Deployment block number: ${orderInfo.deploymentBlockNumber}`);
        console.log(`Deployment block time: ${new Date(deploymentTimestamp * 1000)}`);
        
        // Recreate the timelocks with the actual deployment timestamp
        const actualTimelocks = packTimelocks(
            orderData.timelocks.withdrawal,
            orderData.timelocks.publicWithdrawal,
            orderData.timelocks.cancellation,
            deploymentTimestamp
        );
        
        console.log(`Original stored timelocks: ${orderInfo.deploymentImmutables.timelocks}`);
        console.log(`Recreated timelocks: ${actualTimelocks}`);
        
        // Analyze timing
        const now = Math.floor(Date.now() / 1000);
        const withdrawalStart = deploymentTimestamp + orderData.timelocks.withdrawal;
        const cancellationStart = deploymentTimestamp + orderData.timelocks.cancellation;
        
        console.log(`Current time: ${now} (${new Date(now * 1000)})`);
        console.log(`Withdrawal window: ${withdrawalStart} - ${cancellationStart}`);
        console.log(`  Starts: ${new Date(withdrawalStart * 1000)}`);
        console.log(`  Ends: ${new Date(cancellationStart * 1000)}`);
        console.log(`Can withdraw now? ${now >= withdrawalStart && now < cancellationStart}`);
        
        // Reconstruct the immutables with the actual deployment timestamp
        return {
            orderHash: orderInfo.deploymentImmutables.orderHash,
            hashlock: orderInfo.deploymentImmutables.hashlock,
            maker: orderInfo.deploymentImmutables.maker,
            taker: orderInfo.deploymentImmutables.taker,
            token: orderInfo.deploymentImmutables.token,
            amount: orderInfo.deploymentImmutables.amount,
            safetyDeposit: orderInfo.deploymentImmutables.safetyDeposit,
            timelocks: actualTimelocks // Use the ACTUAL timelocks with real timestamp
        };
    }

    async withdrawFromEVMSource(orderData) {
        // Get the ACTUAL escrow address from when we created it
        const orderInfo = this.orderList?.[orderData.orderHash];
        if (!orderInfo || !orderInfo.actualEscrowAddress) {
            throw new Error(`No escrow address found for order ${orderData.orderHash}. Make sure the escrow was created successfully.`);
        }
        
        const escrowAddress = orderInfo.actualEscrowAddress;
        
        // CRITICAL: Get the actual deployment immutables with correct timestamp
        const actualImmutables = await this.getActualDeploymentImmutables(orderData);
        
        console.log("Using actual deployed escrow address:", escrowAddress);
        console.log("Using actual immutables with deployment timestamp");
        
        // Create escrow contract instance
        const escrowContract = new ethers.Contract(escrowAddress, icpEscrowABI, this.wallet);
        
        const secret = `0x${orderData.secretHex}`;

        console.log(" Secret and hashlock for withdrawal:", secret, orderData.hashlockHex);
        
        // For SOURCE escrows, determine which withdrawal function to use based on timing
        const now = Math.floor(Date.now() / 1000);
        const deploymentTimestamp = Number((actualImmutables.timelocks >> 224n) & 0xffffffffn);
        const publicWithdrawalStart = deploymentTimestamp + orderData.timelocks.publicWithdrawal;
        const cancellationStart = deploymentTimestamp + orderData.timelocks.cancellation;
        
        console.log(`Current time: ${now}, Public withdrawal starts: ${publicWithdrawalStart}, Cancellation starts: ${cancellationStart}`);
        
        let tx;
        if (now >= publicWithdrawalStart && now < cancellationStart) {
            console.log("Using publicWithdraw() - we are in public withdrawal period");
            tx = await escrowContract.publicWithdraw(secret, actualImmutables);
        } else {
            console.log("Using private withdraw() - we are in private withdrawal period");
            tx = await escrowContract.withdraw(secret, actualImmutables);
        }
        
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    async withdrawFromEVMDestination(orderData) {
        // Get the ACTUAL escrow address from when we created it
        const orderInfo = this.orderList?.[orderData.orderHash];
        if (!orderInfo || !orderInfo.actualEscrowAddress) {
            throw new Error(`No escrow address found for order ${orderData.orderHash}. Make sure the escrow was created successfully.`);
        }
        
        const escrowAddress = orderInfo.actualEscrowAddress;
        
        // CRITICAL: Get the actual deployment immutables with correct timestamp
        const actualImmutables = await this.getActualDeploymentImmutables(orderData);
        
        console.log("Using actual deployed escrow address:", escrowAddress);
        console.log("Using actual immutables with deployment timestamp");
        
        // Create escrow contract instance
        const escrowContract = new ethers.Contract(escrowAddress, icpEscrowABI, this.wallet);
        
        const secret = `0x${orderData.secretHex}`;
        
        // Use the ACTUAL immutables that match the deployed contract
        const tx = await escrowContract.withdraw(secret, actualImmutables);
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    async cancelEVMEscrow(orderData, isSource = true) {
        // Get the ACTUAL escrow address from when we created it
        const orderInfo = this.orderList?.[orderData.orderHash];
        if (!orderInfo || !orderInfo.actualEscrowAddress) {
            throw new Error(`No escrow address found for order ${orderData.orderHash}. Make sure the escrow was created successfully.`);
        }
        
        const escrowAddress = orderInfo.actualEscrowAddress;
        
        // CRITICAL: Get the actual deployment immutables with correct timestamp
        const actualImmutables = await this.getActualDeploymentImmutables(orderData);
        
        console.log("Using actual deployed escrow address:", escrowAddress);
        console.log("Using actual immutables with deployment timestamp");
        
        // Create escrow contract instance
        const escrowContract = new ethers.Contract(escrowAddress, icpEscrowABI, this.wallet);
        
        // Use the ACTUAL immutables that match the deployed contract
        const tx = await escrowContract.cancel(actualImmutables);
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    formatImmutables(orderData) {
        // Use the appropriate EVM addresses and convert to uint256
        const makerAddress = orderData.makerEVMAddress || orderData.maker;
        const takerAddress = orderData.takerEVMAddress || orderData.taker;
        const tokenAddress = orderData.srcToken || orderData.dstToken;
        
        // CRITICAL: Don't try to predict deployedAt timestamp - let contract handle it
        // The contract will call setDeployedAt(block.timestamp) during deployment
        const packedTimelocks = packTimelocks(
            orderData.timelocks.withdrawal,
            orderData.timelocks.publicWithdrawal,
            orderData.timelocks.cancellation,
            0 // Placeholder - contract sets this to block.timestamp
        );
        
        return {
            orderHash: orderData.orderHash,
            hashlock: `0x${orderData.hashlockHex}`,
            maker: addressToUint256(safeGetAddress(makerAddress)), // Convert to uint256
            taker: addressToUint256(safeGetAddress(takerAddress)), // Convert to uint256
            token: addressToUint256(safeGetAddress(tokenAddress)), // Convert to uint256
            amount: orderData.srcAmount || orderData.dstAmount, // Use appropriate amount
            safetyDeposit: orderData.safetyDeposit,
            timelocks: packedTimelocks // Single uint256 value
        };
    }
}

export class ICPContractManager {
    constructor(canisterId, host, isLocal = false) {
        this.canisterId = canisterId;
        this.host = host;
        this.isLocal = isLocal;
        this.actor = null;
        this.agent = null;
        // Simplified: Using public withdrawal only, no identity management needed
    }

    async initialize() {
        const { HttpAgent, Actor } = await import('@dfinity/agent');
        
        // Create agent without identity (public withdrawal doesn't need identity)
        const agentOptions = { host: this.host };
        
        this.agent = new HttpAgent(agentOptions);
        
        if (this.isLocal) {
            // Only fetch root key for local development
            await this.agent.fetchRootKey();
        }
        
        // IDL factory for the ICP backend canister
        const idlFactory = ({ IDL }) => {
            const EscrowError = IDL.Variant({
                'InvalidCaller' : IDL.Null,
                'InvalidSecret' : IDL.Null,
                'InvalidTime' : IDL.Null,
                'InvalidAmount' : IDL.Null,
                'InvalidState' : IDL.Null,
                'EscrowNotFound' : IDL.Null,
                'TransferFailed' : IDL.Null,
                'Unauthorized' : IDL.Null,
                'InvalidHashlock' : IDL.Null,
                'InsufficientBalance' : IDL.Null,
                'InvalidAddress' : IDL.Null,
                'DuplicateEscrow' : IDL.Null,
                'ConfigError' : IDL.Null,
                'CanisterCallSuccLedgerError' : IDL.Null,
                'CanisterCallError' : IDL.Null,
                'CanisterCallAndLedgerSuccConversionError' : IDL.Null,
            });
            
            const Result = IDL.Variant({
                'Ok' : IDL.Vec(IDL.Nat8),
                'Err' : EscrowError,
            });
            
            const ResultVoid = IDL.Variant({
                'Ok' : IDL.Null,
                'Err' : EscrowError,
            });
            
            const Timelocks = IDL.Record({
                'withdrawal' : IDL.Nat64,
                'public_withdrawal' : IDL.Nat64,
                'cancellation' : IDL.Nat64,
                'deployed_at' : IDL.Nat64,
            });
            
            const EscrowImmutables = IDL.Record({
                'order_hash' : IDL.Vec(IDL.Nat8),
                'hashlock' : IDL.Vec(IDL.Nat8),
                'maker' : IDL.Text,
                'taker' : IDL.Text,
                'token' : IDL.Text,
                'amount' : IDL.Nat64,
                'safety_deposit' : IDL.Nat64,
                'timelocks' : Timelocks,
            });
            
            const EscrowType = IDL.Variant({
                'Source' : IDL.Null,
                'Destination' : IDL.Null,
            });
            
            return IDL.Service({
                'create_src_escrow' : IDL.Func([EscrowImmutables], [Result], []),
                'create_dst_escrow' : IDL.Func([EscrowImmutables], [Result], []),
                'withdraw_src' : IDL.Func([IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Nat8)], [ResultVoid], []),
                'withdraw_dst' : IDL.Func([IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Nat8)], [ResultVoid], []),
                'public_withdraw' : IDL.Func([IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Nat8), EscrowType], [ResultVoid], []),
                'cancel_escrow' : IDL.Func([IDL.Vec(IDL.Nat8), EscrowType], [ResultVoid], []),
                'get_escrow' : IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Opt(IDL.Record({
                    'immutables': EscrowImmutables,
                    'state': IDL.Variant({
                        'Active': IDL.Null,
                        'Completed': IDL.Null,
                        'Cancelled': IDL.Null,
                        'Rescued': IDL.Null,
                    }),
                    'icp_tx_hash': IDL.Opt(IDL.Text),
                    'evm_address': IDL.Opt(IDL.Text),
                    'created_at': IDL.Nat64,
                    'completed_at': IDL.Opt(IDL.Nat64),
                    'secret_hash': IDL.Opt(IDL.Vec(IDL.Nat8)),
                }))], ['query']),
            });
        };
        
        this.actor = Actor.createActor(idlFactory, {
            agent: this.agent,
            canisterId: this.canisterId,
        });
        
        console.log('ICP actor initialized with canister ID:', this.canisterId);
    }
    
    etherToICPAmount(etherAmount) {
        // Convert from ETH wei (18 decimals) to ICP e8s (8 decimals)
        // ETH: 1 ETH = 10^18 wei
        // ICP: 1 ICP = 10^8 e8s
        // So we need to divide by 10^10 to convert from wei to e8s
        return BigInt(etherAmount) / BigInt(10**10);
    }

    async createICPSourceEscrow(orderData) {
        if (!this.actor) await this.initialize();
        
        console.log('Creating ICP source escrow...');
        
        // Validate required ICP addresses
        if (!orderData.makerICPAddress || !orderData.takerICPAddress) {
            throw new Error('Missing required ICP addresses for ICP source escrow. Both makerICPAddress and takerICPAddress must be provided.');
        }
        
        // Convert hashlock from hex string to byte array
        let hashlockBytes;
        if (typeof orderData.hashlockHex === 'string') {
            hashlockBytes = Array.from(Buffer.from(orderData.hashlockHex, 'hex'));
        } else if (Array.isArray(orderData.hashlock)) {
            hashlockBytes = orderData.hashlock;
        } else {
            throw new Error('Invalid hashlock format');
        }
        
        const params = {
            order_hash: Array.from(Buffer.from(orderData.orderHash.slice(2), 'hex')),
            hashlock: hashlockBytes,
            maker: orderData.makerICPAddress, // Use ICP address for maker
            taker: orderData.takerICPAddress, // Use ICP address for taker
            token: orderData.srcToken || 'ICP', // Default to ICP if no token specified
            amount: Number(this.etherToICPAmount(orderData.srcAmount)), // Convert to Number for Nat64
            safety_deposit: Number(this.etherToICPAmount(orderData.safetyDeposit)), // Convert to Number for Nat64
            timelocks: {
                withdrawal: Number(orderData.timelocks.withdrawal), // Convert to Number for Nat64
                public_withdrawal: Number(orderData.timelocks.publicWithdrawal), // Convert to Number for Nat64
                cancellation: Number(orderData.timelocks.cancellation), // Convert to Number for Nat64
                deployed_at: 0 // Will be set by the canister
            }
        };
        
        console.log('ICP Source Escrow params:', {
            ...params,
            order_hash: `0x${Buffer.from(params.order_hash).toString('hex')}`,
            hashlock: `0x${Buffer.from(params.hashlock).toString('hex')}`,
            amount: params.amount.toString(),
            safety_deposit: params.safety_deposit.toString()
        });
        
        try {
            const result = await this.actor.create_src_escrow(params);
            console.log('ICP Source Escrow creation result:', result);
            
            if ('Ok' in result) {
                return { hashlock: result.Ok };
            } else {
                throw new Error(`ICP source escrow creation failed: ${JSON.stringify(result.Err)}`);
            }
        } catch (error) {
            console.error('Error creating ICP source escrow:', error);
            throw error;
        }
    }
    
    async createICPDestinationEscrow(orderData) {
        if (!this.actor) await this.initialize();
        
        console.log('Creating ICP destination escrow...');
        
        // Validate required ICP addresses
        if (!orderData.makerICPAddress || !orderData.takerICPAddress) {
            throw new Error('Missing required ICP addresses for ICP destination escrow. Both makerICPAddress and takerICPAddress must be provided.');
        }
        
        // Convert hashlock from hex string to byte array
        let hashlockBytes;
        if (typeof orderData.hashlockHex === 'string') {
            hashlockBytes = Array.from(Buffer.from(orderData.hashlockHex, 'hex'));
        } else if (Array.isArray(orderData.hashlock)) {
            hashlockBytes = orderData.hashlock;
        } else {
            throw new Error('Invalid hashlock format');
        }
        
        const params = {
            order_hash: Array.from(Buffer.from(orderData.orderHash.slice(2), 'hex')),
            hashlock: hashlockBytes,
            maker: orderData.takerICPAddress, // Note: reversed for destination
            taker: orderData.makerICPAddress,
            token: orderData.dstToken || 'ICP', // Default to ICP if no token specified
            amount: Number(this.etherToICPAmount(orderData.dstAmount)), // Convert to Number for Nat64
            safety_deposit: Number(this.etherToICPAmount(orderData.safetyDeposit)), // Convert to Number for Nat64
            timelocks: {
                withdrawal: Number(orderData.timelocks.withdrawal), // Convert to Number for Nat64
                public_withdrawal: Number(orderData.timelocks.publicWithdrawal), // Convert to Number for Nat64
                cancellation: Number(orderData.timelocks.cancellation), // Convert to Number for Nat64
                deployed_at: 0 // Will be set by the canister
            }
        };
        
        console.log('ICP Destination Escrow params:', {
            ...params,
            order_hash: `0x${Buffer.from(params.order_hash).toString('hex')}`,
            hashlock: `0x${Buffer.from(params.hashlock).toString('hex')}`,
            amount: params.amount.toString(),
            safety_deposit: params.safety_deposit.toString()
        });
        
        try {
            const result = await this.actor.create_dst_escrow(params);
            console.log('ICP Destination Escrow creation result:', result);
            
            if ('Ok' in result) {
                return { hashlock: result.Ok };
            } else {
                throw new Error(`ICP destination escrow creation failed: ${JSON.stringify(result.Err)}`);
            }
        } catch (error) {
            console.error('Error creating ICP destination escrow:', error);
            throw error;
        }
    }
    
    async withdrawFromICPSource(orderData) {
        console.log('Withdrawing from ICP source escrow using public withdrawal...');
        
        // First, check the escrow status to debug timing issues
        try {
            console.log('Checking ICP source escrow status before withdrawal...');
            const escrowStatus = await this.getEscrowStatus(orderData.orderHash);
            console.log('ICP source escrow status:', escrowStatus);
        } catch (statusError) {
            console.warn('Could not check escrow status:', statusError.message);
        }
        
        // Convert secret from hex string to byte array
        let secretBytes;
        if (typeof orderData.secret === 'string') {
            // Remove 0x prefix if present
            const secretHex = orderData.secret.startsWith('0x') ? orderData.secret.slice(2) : orderData.secret;
            secretBytes = Array.from(Buffer.from(secretHex, 'hex'));
        } else if (typeof orderData.secretHex === 'string') {
            // Handle secretHex field as well
            secretBytes = Array.from(Buffer.from(orderData.secretHex, 'hex'));
        } else if (Array.isArray(orderData.secret)) {
            secretBytes = orderData.secret;
        } else {
            throw new Error('Invalid secret format - must be hex string or byte array');
        }
        
        // Convert hashlock from hex string to byte array
        let hashlockBytes;
        if (typeof orderData.hashlockHex === 'string') {
            hashlockBytes = Array.from(Buffer.from(orderData.hashlockHex, 'hex'));
        } else if (Array.isArray(orderData.hashlock)) {
            hashlockBytes = orderData.hashlock;
        } else {
            throw new Error('Invalid hashlock format');
        }
        
        console.log('ICP Source public withdrawal params:', {
            secret: `0x${Buffer.from(secretBytes).toString('hex')}`,
            hashlock: `0x${Buffer.from(hashlockBytes).toString('hex')}`,
            orderCreatedAt: orderData.createdAt,
            currentTime: new Date().toISOString(),
            publicWithdrawalTimelock: orderData.timelocks.publicWithdrawal
        });
        
        try {
            // Use public_withdraw directly for faster execution
            const escrowType = { Source: null };
            const result = await this.actor.public_withdraw(secretBytes, hashlockBytes, escrowType);
            console.log('ICP Source public withdrawal result:', result);
            
            if ('Ok' in result) {
                return { success: true };
            } else {
                console.error('ICP source public withdrawal error details:', JSON.stringify(result.Err, null, 2));
                throw new Error(`ICP source public withdrawal failed: ${JSON.stringify(result.Err)}`);
            }
        } catch (error) {
            console.error('Error with ICP source public withdrawal:', error);
            throw error;
        }
    }
    
    async withdrawFromICPDestination(orderData) {
        console.log('Withdrawing from ICP destination escrow using public withdrawal...');
        
        // First, check the escrow status to debug timing issues
        try {
            console.log('Checking ICP destination escrow status before withdrawal...');
            const escrowStatus = await this.getEscrowStatus(orderData.orderHash);
            console.log('ICP destination escrow status:', escrowStatus);
        } catch (statusError) {
            console.warn('Could not check escrow status:', statusError.message);
        }
        
        // Convert secret from hex string to byte array
        let secretBytes;
        if (typeof orderData.secret === 'string') {
            // Remove 0x prefix if present
            const secretHex = orderData.secret.startsWith('0x') ? orderData.secret.slice(2) : orderData.secret;
            secretBytes = Array.from(Buffer.from(secretHex, 'hex'));
        } else if (typeof orderData.secretHex === 'string') {
            // Handle secretHex field as well
            secretBytes = Array.from(Buffer.from(orderData.secretHex, 'hex'));
        } else if (Array.isArray(orderData.secret)) {
            secretBytes = orderData.secret;
        } else {
            throw new Error('Invalid secret format - must be hex string or byte array');
        }
        
        // Convert hashlock from hex string to byte array
        let hashlockBytes;
        if (typeof orderData.hashlockHex === 'string') {
            hashlockBytes = Array.from(Buffer.from(orderData.hashlockHex, 'hex'));
        } else if (Array.isArray(orderData.hashlock)) {
            hashlockBytes = orderData.hashlock;
        } else {
            throw new Error('Invalid hashlock format');
        }
        
        console.log('ICP Destination public withdrawal params:', {
            secret: `0x${Buffer.from(secretBytes).toString('hex')}`,
            hashlock: `0x${Buffer.from(hashlockBytes).toString('hex')}`,
            orderCreatedAt: orderData.createdAt,
            currentTime: new Date().toISOString(),
            publicWithdrawalTimelock: orderData.timelocks.publicWithdrawal
        });
        
        try {
            // Use public_withdraw directly for faster execution
            const escrowType = { Destination: null };
            const result = await this.actor.public_withdraw(secretBytes, hashlockBytes, escrowType);
            console.log('ICP Destination public withdrawal result:', result);
            
            if ('Ok' in result) {
                return { success: true };
            } else {
                console.error('ICP destination public withdrawal error details:', JSON.stringify(result.Err, null, 2));
                throw new Error(`ICP destination public withdrawal failed: ${JSON.stringify(result.Err)}`);
            }
        } catch (error) {
            console.error('Error with ICP destination public withdrawal:', error);
            throw error;
        }
    }
    
    async getEscrowStatus(orderHash) {
        if (!this.actor) await this.initialize();
        
        // Convert order hash to bytes if it's a hex string
        let orderHashBytes;
        if (typeof orderHash === 'string') {
            const hashHex = orderHash.startsWith('0x') ? orderHash.slice(2) : orderHash;
            orderHashBytes = Array.from(Buffer.from(hashHex, 'hex'));
        } else {
            orderHashBytes = orderHash;
        }
        
        try {
            const result = await this.actor.get_escrow(orderHashBytes);
            console.log('ICP Escrow status result:', result);
            return result;
        } catch (error) {
            console.error('Error getting ICP escrow status:', error);
            return null;
        }
    }
    
    async publicWithdrawFromICP(orderData, isSource = true) {
        if (!this.actor) await this.initialize();
        
        console.log(`Public withdrawing from ICP ${isSource ? 'source' : 'destination'} escrow...`);
        
        // Convert secret from hex string to byte array
        let secretBytes;
        if (typeof orderData.secret === 'string') {
            const secretHex = orderData.secret.startsWith('0x') ? orderData.secret.slice(2) : orderData.secret;
            secretBytes = Array.from(Buffer.from(secretHex, 'hex'));
        } else if (Array.isArray(orderData.secret)) {
            secretBytes = orderData.secret;
        } else {
            throw new Error('Invalid secret format');
        }
        
        // Convert hashlock from hex string to byte array
        let hashlockBytes;
        if (typeof orderData.hashlockHex === 'string') {
            hashlockBytes = Array.from(Buffer.from(orderData.hashlockHex, 'hex'));
        } else if (Array.isArray(orderData.hashlock)) {
            hashlockBytes = orderData.hashlock;
        } else {
            throw new Error('Invalid hashlock format');
        }
        
        const escrowType = isSource ? { Source: null } : { Destination: null };
        
        console.log('ICP Public withdrawal params:', {
            secret: `0x${Buffer.from(secretBytes).toString('hex')}`,
            hashlock: `0x${Buffer.from(hashlockBytes).toString('hex')}`,
            escrowType
        });
        
        try {
            const result = await this.actor.public_withdraw(secretBytes, hashlockBytes, escrowType);
            console.log('ICP Public withdrawal result:', result);
            
            if ('Ok' in result) {
                return { success: true };
            } else {
                throw new Error(`ICP public withdrawal failed: ${JSON.stringify(result.Err)}`);
            }
        } catch (error) {
            console.error('Error with ICP public withdrawal:', error);
            throw error;
        }
    }
    
    async cancelICPEscrow(orderData, isSource = true) {
        if (!this.actor) await this.initialize();
        
        console.log(`Cancelling ICP ${isSource ? 'source' : 'destination'} escrow...`);
        
        // Convert hashlock from hex string to byte array
        let hashlockBytes;
        if (typeof orderData.hashlockHex === 'string') {
            hashlockBytes = Array.from(Buffer.from(orderData.hashlockHex, 'hex'));
        } else if (Array.isArray(orderData.hashlock)) {
            hashlockBytes = orderData.hashlock;
        } else {
            throw new Error('Invalid hashlock format');
        }
        
        const escrowType = isSource ? { Source: null } : { Destination: null };
        
        console.log('ICP Cancellation params:', {
            hashlock: `0x${Buffer.from(hashlockBytes).toString('hex')}`,
            escrowType
        });
        
        try {
            const result = await this.actor.cancel_escrow(hashlockBytes, escrowType);
            console.log('ICP Cancellation result:', result);
            
            if ('Ok' in result) {
                return { success: true };
            } else {
                throw new Error(`ICP escrow cancellation failed: ${JSON.stringify(result.Err)}`);
            }
        } catch (error) {
            console.error('Error cancelling ICP escrow:', error);
            throw error;
        }
    }
}

export function calculateRequiredLiquidity(orderData) {
    const srcAmount = BigInt(orderData.srcAmount);
    const dstAmount = BigInt(orderData.dstAmount);
    const srcSafetyDeposit = BigInt(orderData.safetyDeposit);
    const dstSafetyDeposit = BigInt(calculateSafetyDeposit(orderData.dstAmount));
    
    return {
        srcChain: srcAmount + srcSafetyDeposit,
        dstChain: dstAmount + dstSafetyDeposit,
        total: srcAmount + dstAmount + srcSafetyDeposit + dstSafetyDeposit
    };
}

export function calculateSafetyDeposit(amount) {
    // Safety deposit is 15% of the amount
    // Convert to BigInt for calculation, then back to string
    const amountBigInt = BigInt(amount);
    const safetyDepositBigInt = (amountBigInt * BigInt(15)) / BigInt(100);
    return safetyDepositBigInt.toString();
}
