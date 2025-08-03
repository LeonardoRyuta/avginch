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

// Create a simple logger for this module
const logger = {
    info: (message) => console.log(`[INFO] ${message}`),
    warn: (message) => console.warn(`[WARN] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`)
};

// ICP Escrow Factory ABI - based on ICPEscrowFactory.sol
const icpEscrowFactoryABI = [
    "function createSrcEscrow(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 deployedAt) timelocks) immutables) external payable",
    "function createDstEscrow(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 deployedAt) timelocks) immutables) external payable",
    "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 deployedAt) timelocks) immutables) external view returns (address)",
    "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 deployedAt) timelocks) immutables) external view returns (address)",
    "function creationFee() external view returns (uint256)",
    "function ICP_ESCROW_SRC_IMPLEMENTATION() external view returns (address)",
    "function ICP_ESCROW_DST_IMPLEMENTATION() external view returns (address)",
    "event SrcEscrowCreated(address escrow, bytes32 hashlock, address maker, address indexed creator)",
    "event DstEscrowCreated(address escrow, bytes32 hashlock, address taker, address indexed creator)"
];

// Individual Escrow ABI for withdraw/cancel operations
const icpEscrowABI = [
    "function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 deployedAt) timelocks) immutables) external",
    "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 deployedAt) timelocks) immutables) external",
    "function getImmutables() external view returns (tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, tuple(uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 deployedAt) timelocks))"
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
        // Ensure we have access tokens
        await this.ensureAccessToken();
        
        const { orderHash, hashlockHex, srcToken, srcAmount, safetyDeposit, timelocks } = orderData;
        
        // For EVM source escrow, use the address mapping
        // In EVM->ICP: maker is ICP address, taker is EVM address
        // But for the EVM contract, we need the EVM addresses for authentication
        const maker = orderData.takerEVMAddress || orderData.taker; // EVM address that can authenticate
        const taker = orderData.makerICPAddress || orderData.maker; // Will be stored as ICP address string
        
        // Prepare immutables struct
        const immutables = {
            orderHash: orderHash,
            hashlock: `0x${hashlockHex}`,
            maker: maker, // EVM address for authentication
            taker: taker, // This will be stored but ICP address goes in a separate field
            token: srcToken,
            amount: srcAmount,
            safetyDeposit: safetyDeposit,
            timelocks: {
                withdrawal: timelocks.withdrawal,
                publicWithdrawal: timelocks.publicWithdrawal,
                cancellation: timelocks.cancellation,
                deployedAt: 0 // Will be set by the factory
            }
        };
        
        // Get creation fee from factory
        const creationFee = await this.icpEscrowFactory.creationFee();
        
        let totalEthRequired = BigInt(safetyDeposit) + BigInt(creationFee);
        let tx;
        
        if (srcToken === '0x0000000000000000000000000000000000000000') {
            // ETH escrow - include the ETH amount in the transaction value
            totalEthRequired += BigInt(srcAmount);
            
            tx = await this.icpEscrowFactory.createSrcEscrow(immutables, {
                value: totalEthRequired,
                gasLimit: 500000
            });
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
            
            tx = await this.icpEscrowFactory.createSrcEscrow(immutables, {
                value: totalEthRequired, // ETH for safety deposit + creation fee
                gasLimit: 500000
            });
        }
        
        const receipt = await tx.wait();
        
        // Get the escrow address from the event
        const event = receipt.logs.find(log => {
            try {
                const parsed = this.icpEscrowFactory.interface.parseLog(log);
                return parsed.name === 'SrcEscrowCreated';
            } catch {
                return false;
            }
        });
        
        let escrowAddress = null;
        if (event) {
            const parsed = this.icpEscrowFactory.interface.parseLog(event);
            escrowAddress = parsed.args.escrow;
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
        
        const { orderHash, hashlock, maker, taker, dstToken, dstAmount, safetyDeposit, timelocks } = orderData;
        
        // Prepare immutables struct
        const immutables = {
            orderHash: orderHash,
            hashlock: `0x${orderData.hashlockHex}`,
            maker: maker,
            taker: taker,
            token: dstToken,
            amount: dstAmount,
            safetyDeposit: safetyDeposit,
            timelocks: {
                withdrawal: timelocks.withdrawal,
                publicWithdrawal: timelocks.publicWithdrawal,
                cancellation: timelocks.cancellation,
                deployedAt: 0 // Will be set by the factory
            }
        };
        
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
                return parsed.name === 'DstEscrowCreated';
            } catch {
                return false;
            }
        });
        
        let escrowAddress = null;
        if (event) {
            const parsed = this.icpEscrowFactory.interface.parseLog(event);
            escrowAddress = parsed.args.escrow;
        }
        
        return { 
            transactionHash: receipt.hash, 
            blockNumber: receipt.blockNumber,
            escrowAddress 
        };
    }
    
    async withdrawFromEVMSource(orderData) {
        // Get the escrow address first
        const immutables = this.formatImmutables(orderData);
        const escrowAddress = await this.icpEscrowFactory.addressOfEscrowSrc(immutables);
        
        // Create escrow contract instance
        const escrowContract = new ethers.Contract(escrowAddress, icpEscrowABI, this.wallet);
        
        const secret = `0x${orderData.secretHex}`;
        
        const tx = await escrowContract.withdraw(secret, immutables);
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    async withdrawFromEVMDestination(orderData) {
        // Get the escrow address first
        const immutables = this.formatImmutables(orderData);
        const escrowAddress = await this.icpEscrowFactory.addressOfEscrowDst(immutables);
        
        // Create escrow contract instance
        const escrowContract = new ethers.Contract(escrowAddress, icpEscrowABI, this.wallet);
        
        const secret = `0x${orderData.secretHex}`;
        
        const tx = await escrowContract.withdraw(secret, immutables);
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    async cancelEVMEscrow(orderData, isSource = true) {
        // Get the escrow address first
        const immutables = this.formatImmutables(orderData);
        const escrowAddress = isSource 
            ? await this.icpEscrowFactory.addressOfEscrowSrc(immutables)
            : await this.icpEscrowFactory.addressOfEscrowDst(immutables);
        
        // Create escrow contract instance
        const escrowContract = new ethers.Contract(escrowAddress, icpEscrowABI, this.wallet);
        
        const tx = await escrowContract.cancel(immutables);
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    formatImmutables(orderData) {
        return {
            orderHash: orderData.orderHash,
            hashlock: `0x${orderData.hashlockHex}`,
            maker: orderData.maker,
            taker: orderData.taker,
            token: orderData.srcToken || orderData.dstToken, // Use appropriate token
            amount: orderData.srcAmount || orderData.dstAmount, // Use appropriate amount
            safetyDeposit: orderData.safetyDeposit,
            timelocks: {
                withdrawal: orderData.timelocks.withdrawal,
                publicWithdrawal: orderData.timelocks.publicWithdrawal,
                cancellation: orderData.timelocks.cancellation,
                deployedAt: 0 // This should be the actual deployment timestamp
            }
        };
    }
}

export class ICPContractManager {
    constructor(canisterId, host, isLocal = false) {
        this.canisterId = canisterId;
        this.host = host;
        this.isLocal = isLocal;
        this.actor = null;
    }
    
    async initialize() {
        const agent = new HttpAgent({ host: this.host });
        
        if (this.isLocal) {
            await agent.fetchRootKey();
        }
        
        // You'll need to import your canister's IDL factory here
        // this.actor = Actor.createActor(idlFactory, {
        //     agent,
        //     canisterId: this.canisterId,
        // });
        
        // For now, use a mock actor
        this.actor = {
            create_src_escrow: async (params) => ({ Ok: Array.from(Buffer.from('mock_hashlock'.padEnd(32, '0'))) }),
            create_dst_escrow: async (params) => ({ Ok: Array.from(Buffer.from('mock_hashlock'.padEnd(32, '0'))) }),
            withdraw_src: async (secret, hashlock) => ({ Ok: null }),
            withdraw_dst: async (secret, hashlock) => ({ Ok: null }),
            get_escrow: async (hashlock) => ({ 
                Ok: {
                    immutables: params,
                    state: { Active: null },
                    icp_tx_hash: null,
                    evm_address: null,
                    created_at: BigInt(Date.now() * 1000000),
                    completed_at: null,
                    secret_hash: null
                }
            })
        };
    }
    
    async createICPSourceEscrow(orderData) {
        if (!this.actor) await this.initialize();
        
        const params = {
            order_hash: Array.from(Buffer.from(orderData.orderHash.slice(2), 'hex')),
            hashlock: orderData.hashlock,
            maker: orderData.maker,
            taker: orderData.taker,
            token: orderData.srcToken,
            amount: BigInt(orderData.srcAmount),
            safety_deposit: BigInt(orderData.safetyDeposit),
            timelocks: {
                withdrawal: BigInt(orderData.timelocks.withdrawal),
                public_withdrawal: BigInt(orderData.timelocks.publicWithdrawal),
                cancellation: BigInt(orderData.timelocks.cancellation),
                deployed_at: 0n
            }
        };
        
        const result = await this.actor.create_src_escrow(params);
        
        if ('Ok' in result) {
            return { hashlock: result.Ok };
        } else {
            throw new Error(`ICP source escrow creation failed: ${JSON.stringify(result.Err)}`);
        }
    }
    
    async createICPDestinationEscrow(orderData) {
        if (!this.actor) await this.initialize();
        
        const params = {
            order_hash: Array.from(Buffer.from(orderData.orderHash.slice(2), 'hex')),
            hashlock: orderData.hashlock,
            maker: orderData.taker, // Note: reversed for destination
            taker: orderData.maker,
            token: orderData.dstToken,
            amount: BigInt(orderData.dstAmount),
            safety_deposit: BigInt(orderData.safetyDeposit),
            timelocks: {
                withdrawal: BigInt(orderData.timelocks.withdrawal),
                public_withdrawal: BigInt(orderData.timelocks.publicWithdrawal),
                cancellation: BigInt(orderData.timelocks.cancellation),
                deployed_at: 0n
            }
        };
        
        const result = await this.actor.create_dst_escrow(params);
        
        if ('Ok' in result) {
            return { hashlock: result.Ok };
        } else {
            throw new Error(`ICP destination escrow creation failed: ${JSON.stringify(result.Err)}`);
        }
    }
    
    async withdrawFromICPSource(orderData) {
        if (!this.actor) await this.initialize();
        
        const result = await this.actor.withdraw_src(
            orderData.secret,
            orderData.hashlock
        );
        
        if ('Ok' in result) {
            return { success: true };
        } else {
            throw new Error(`ICP source withdrawal failed: ${JSON.stringify(result.Err)}`);
        }
    }
    
    async withdrawFromICPDestination(orderData) {
        if (!this.actor) await this.initialize();
        
        const result = await this.actor.withdraw_dst(
            orderData.secret,
            orderData.hashlock
        );
        
        if ('Ok' in result) {
            return { success: true };
        } else {
            throw new Error(`ICP destination withdrawal failed: ${JSON.stringify(result.Err)}`);
        }
    }
    
    async getEscrowStatus(hashlock) {
        if (!this.actor) await this.initialize();
        
        const result = await this.actor.get_escrow(hashlock);
        
        if ('Ok' in result) {
            return result.Ok;
        } else {
            return null;
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
