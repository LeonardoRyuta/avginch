import { ethers } from 'ethers';
import { Actor, HttpAgent } from '@dfinity/agent';

// EVM Contract ABIs (simplified - you'll need the full ABIs)
const escrowSrcABI = [
    "function depositERC20(bytes32 hashlock, uint256 amount, address token, address taker, string memory icpAddress, uint32[4] memory timelocks) external",
    "function depositETH(bytes32 hashlock, address taker, string memory icpAddress, uint32[4] memory timelocks) external payable",
    "function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint32[4] timelocks) immutables) external",
    "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint32[4] timelocks) immutables) external"
];

const escrowDstABI = [
    "function depositERC20(bytes32 hashlock, uint256 amount, address token, address maker, uint32[4] memory timelocks) external",
    "function depositETH(bytes32 hashlock, address maker, uint32[4] memory timelocks) external payable",
    "function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint32[4] timelocks) immutables) external",
    "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint32[4] timelocks) immutables) external"
];

const erc20ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

export class EVMContractManager {
    constructor(provider, wallet, escrowSrcAddress, escrowDstAddress) {
        this.provider = provider;
        this.wallet = wallet;
        this.escrowSrcAddress = escrowSrcAddress;
        this.escrowDstAddress = escrowDstAddress;
        
        this.escrowSrcContract = new ethers.Contract(escrowSrcAddress, escrowSrcABI, wallet);
        this.escrowDstContract = new ethers.Contract(escrowDstAddress, escrowDstABI, wallet);
    }
    
    async createEVMSourceEscrow(orderData) {
        const { orderHash, hashlock, maker, taker, srcToken, srcAmount, timelocks } = orderData;
        
        const timelocksArray = [
            timelocks.withdrawal,
            timelocks.publicWithdrawal,
            timelocks.cancellation,
            0 // deployed_at will be set by contract
        ];
        
        let tx;
        
        if (srcToken === '0x0000000000000000000000000000000000000000') {
            // ETH deposit
            tx = await this.escrowSrcContract.depositETH(
                hashlock,
                taker,
                '', // ICP address - will be set later
                timelocksArray,
                { value: srcAmount }
            );
        } else {
            // ERC20 deposit
            const tokenContract = new ethers.Contract(srcToken, erc20ABI, this.wallet);
            
            // Check allowance and approve if needed
            const allowance = await tokenContract.allowance(this.wallet.address, this.escrowSrcAddress);
            if (allowance < srcAmount) {
                const approveTx = await tokenContract.approve(this.escrowSrcAddress, srcAmount);
                await approveTx.wait();
            }
            
            tx = await this.escrowSrcContract.depositERC20(
                hashlock,
                srcAmount,
                srcToken,
                taker,
                '', // ICP address - will be set later
                timelocksArray
            );
        }
        
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    async createEVMDestinationEscrow(orderData) {
        const { orderHash, hashlock, maker, taker, dstToken, dstAmount, timelocks } = orderData;
        
        const timelocksArray = [
            timelocks.withdrawal,
            timelocks.publicWithdrawal,
            timelocks.cancellation,
            0 // deployed_at will be set by contract
        ];
        
        let tx;
        
        if (dstToken === '0x0000000000000000000000000000000000000000') {
            // ETH deposit
            tx = await this.escrowDstContract.depositETH(
                hashlock,
                maker,
                timelocksArray,
                { value: dstAmount }
            );
        } else {
            // ERC20 deposit
            const tokenContract = new ethers.Contract(dstToken, erc20ABI, this.wallet);
            
            // Check allowance and approve if needed
            const allowance = await tokenContract.allowance(this.wallet.address, this.escrowDstAddress);
            if (allowance < dstAmount) {
                const approveTx = await tokenContract.approve(this.escrowDstAddress, dstAmount);
                await approveTx.wait();
            }
            
            tx = await this.escrowDstContract.depositERC20(
                hashlock,
                dstAmount,
                dstToken,
                maker,
                timelocksArray
            );
        }
        
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    async withdrawFromEVMSource(orderData) {
        const immutables = this.formatImmutables(orderData);
        const secret = `0x${orderData.secretHex}`;
        
        const tx = await this.escrowSrcContract.withdraw(secret, immutables);
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    async withdrawFromEVMDestination(orderData) {
        const immutables = this.formatImmutables(orderData);
        const secret = `0x${orderData.secretHex}`;
        
        const tx = await this.escrowDstContract.withdraw(secret, immutables);
        const receipt = await tx.wait();
        return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }
    
    formatImmutables(orderData) {
        return {
            orderHash: orderData.orderHash,
            hashlock: `0x${orderData.hashlockHex}`,
            maker: orderData.maker,
            taker: orderData.taker,
            token: orderData.srcToken,
            amount: orderData.srcAmount,
            safetyDeposit: orderData.safetyDeposit,
            timelocks: [
                orderData.timelocks.withdrawal,
                orderData.timelocks.publicWithdrawal,
                orderData.timelocks.cancellation,
                0 // deployed_at
            ]
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
    return Math.floor(BigInt(amount) * BigInt(15) / BigInt(100)).toString();
}
