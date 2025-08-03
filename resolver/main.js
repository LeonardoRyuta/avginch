import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createHash, randomBytes } from 'crypto';
import { ethers } from 'ethers';
import winston from 'winston';
import Joi from 'joi';
import cron from 'node-cron';
import { EVMContractManager, ICPContractManager, calculateRequiredLiquidity, calculateSafetyDeposit } from './contracts.js';

// Helper function to safely normalize Ethereum addresses
function normalizeEVMAddress(address) {
    if (!address) return address;
    
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

// Load environment variables
dotenv.config();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));

// Configuration
const config = {
    icp: {
        canisterId: process.env.ICP_CANISTER_ID || 'uzt4z-lp777-77774-qaabq-cai',
        host: process.env.ICP_HOST || 'http://127.0.0.1:8080',
        isLocal: process.env.ICP_ENV === 'local'
    },
    evm: {
        rpcUrl: process.env.EVM_RPC_URL || 'http://127.0.0.1:8545',
        privateKey: process.env.EVM_PRIVATE_KEY,
        icpEscrowFactoryAddress: process.env.EVM_ICP_ESCROW_FACTORY_ADDRESS,
        accessTokenAddress: process.env.EVM_ACCESS_TOKEN_ADDRESS,
        gasLimit: process.env.EVM_GAS_LIMIT || '500000'
    },
    resolver: {
        feePercent: parseFloat(process.env.RESOLVER_FEE_PERCENT || '0.1'),
        maxOrderSize: process.env.MAX_ORDER_SIZE || '1000000000000000000', // 10,000 ICP in e8s
        supportedTokens: (process.env.SUPPORTED_TOKENS || '').split(',').filter(Boolean).map(token => {
            // Normalize EVM addresses to prevent checksum issues
            if (token.startsWith('0x')) {
                try {
                    return normalizeEVMAddress(token);
                } catch (e) {
                    logger.warn(`Invalid token address in SUPPORTED_TOKENS: ${token} - ${e.message}`);
                    return token; // Return as-is if normalization fails
                }
            }
            return token;
        }),
        // Resolver's own addresses for participating in escrows
        icpAddress: process.env.RESOLVER_ICP_ADDRESS || 'rdmx6-jaaaa-aaaaa-aaadq-cai',
        evmAddress: process.env.RESOLVER_EVM_ADDRESS || '0x742d35cc6e5a69e6d89b134b1234567890123456'
    }
};

// Helper function to determine address types based on clean mapping strategy
function getAddressTypes(order) {
    const isEVMToICP = order.srcChain !== 'icp' && order.dstChain === 'icp';
    const isICPToEVM = order.srcChain === 'icp' && order.dstChain !== 'icp';
    
    if (isEVMToICP) {
        // EVM → ICP: Use provided dual addresses
        return {
            makerAddressType: 'dual',
            takerAddressType: 'dual',
            makerICPAddress: order.makerICPAddress, // Where maker receives ICP
            makerEVMAddress: order.makerEVMAddress, // Maker's EVM address for escrow
            takerICPAddress: order.takerICPAddress, // Taker's ICP address (optional)
            takerEVMAddress: order.takerEVMAddress // Taker's EVM address for escrow
        };
    } else if (isICPToEVM) {
        // ICP → EVM: Use provided dual addresses  
        return {
            makerAddressType: 'dual',
            takerAddressType: 'dual',
            makerICPAddress: order.makerICPAddress, // Maker's ICP address for escrow
            makerEVMAddress: order.makerEVMAddress, // Where maker receives EVM tokens
            takerICPAddress: order.takerICPAddress, // Taker's ICP address for escrow
            takerEVMAddress: order.takerEVMAddress // Taker's EVM address (optional)
        };
    }
    
    throw new Error('Unsupported chain combination');
}

// Validation helper for address format
function validateAddressFormat(address, expectedType) {
    if (expectedType === 'evm') {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    } else if (expectedType === 'icp') {
        // ICP principal format: base32 with hyphens, ending in -cai or similar
        return /^[a-z0-9-]+$/.test(address) && address.includes('-');
    }
    return false;
}

// Order validation schema with smart address validation
const orderSchema = Joi.object({
    orderHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
    srcChain: Joi.string().valid('icp', 'ethereum', 'base').required(),
    dstChain: Joi.string().valid('icp', 'ethereum', 'base').required(),
    srcToken: Joi.string().required(),
    dstToken: Joi.string().required(),
    srcAmount: Joi.string().pattern(/^[0-9]+$/).required(),
    dstAmount: Joi.string().pattern(/^[0-9]+$/).required(),
    
    // Enhanced dual addressing system
    makerEVMAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
    makerICPAddress: Joi.string().min(10).optional(),
    takerEVMAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
    takerICPAddress: Joi.string().min(10).optional(),
    
    // Legacy fields (for backward compatibility - will be deprecated)
    maker: Joi.string().optional(),
    taker: Joi.string().optional(),
    
    deadline: Joi.number().integer().min(Math.floor(Date.now() / 1000)).required(),
    timelocks: Joi.object({
        withdrawal: Joi.number().integer().min(10).max(86400).required(), // 10 sec to 24 hours
        publicWithdrawal: Joi.number().integer().min(30).max(172800).required(), // 30 sec to 48 hours (reduced for faster testing)
        cancellation: Joi.number().integer().min(3600).max(604800).required() // 1 hour to 7 days
    }).required()
}).custom((order, helpers) => {
    const isEVMToICP = order.srcChain !== 'icp' && order.dstChain === 'icp';
    const isICPToEVM = order.srcChain === 'icp' && order.dstChain !== 'icp';
    
    // Validate dual addressing requirements
    if (isEVMToICP) {
        // EVM→ICP: need maker's ICP address + both parties' EVM addresses
        if (!order.makerICPAddress || !order.makerEVMAddress || !order.takerEVMAddress) {
            return helpers.error('any.invalid', {
                message: 'EVM→ICP swaps require makerICPAddress, makerEVMAddress, and takerEVMAddress'
            });
        }
    } else if (isICPToEVM) {
        // ICP→EVM: need maker's EVM address + both parties' ICP addresses
        if (!order.makerEVMAddress || !order.makerICPAddress || !order.takerICPAddress) {
            return helpers.error('any.invalid', {
                message: 'ICP→EVM swaps require makerEVMAddress, makerICPAddress, and takerICPAddress'
            });
        }
    } else {
        return helpers.error('any.invalid', {
            message: 'Currently only ICP↔EVM swaps are supported'
        });
    }
    
    // Validate address formats
    const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;
    // Accept both short and long ICP principal formats (with hyphens, lowercase, ending in -cai or -bae etc.)
    const icpAddressPattern = /^[a-z0-9-]{10,64}$/;
    
    if (order.makerEVMAddress && !evmAddressPattern.test(order.makerEVMAddress)) {
        return helpers.error('any.invalid', { message: 'Invalid maker EVM address format' });
    }
    if (order.takerEVMAddress && !evmAddressPattern.test(order.takerEVMAddress)) {
        return helpers.error('any.invalid', { message: 'Invalid taker EVM address format' });
    }
    if (order.makerICPAddress && !icpAddressPattern.test(order.makerICPAddress)) {
        return helpers.error('any.invalid', { message: 'Invalid maker ICP address format' });
    }
    if (order.takerICPAddress && !icpAddressPattern.test(order.takerICPAddress)) {
        return helpers.error('any.invalid', { message: 'Invalid taker ICP address format' });
    }
    
    return order;
});

// Contract managers
let icpManager;
let evmManager;

// Initialize contract managers
async function initializeManagers() {
    try {
        // Initialize ICP manager
        icpManager = new ICPContractManager(
            config.icp.canisterId,
            config.icp.host,
            config.icp.isLocal
        );
        await icpManager.initialize();
        logger.info('ICP contract manager initialized');
        
        // Initialize EVM manager
        if (config.evm.privateKey && config.evm.icpEscrowFactoryAddress && config.evm.accessTokenAddress) {
            const provider = new ethers.JsonRpcProvider(config.evm.rpcUrl);
            const wallet = new ethers.Wallet(config.evm.privateKey, provider);

            evmManager = new EVMContractManager(
                provider,
                wallet,
                config.evm.icpEscrowFactoryAddress,
                config.evm.accessTokenAddress
            );
            logger.info('EVM contract manager initialized');
        } else {
            logger.warn('EVM configuration incomplete - EVM functionality disabled');
        }
        
    } catch (error) {
        logger.error('Failed to initialize contract managers:', error);
        throw error;
    }
}

// In-memory storage for active orders (in production, use a database)
const activeOrders = new Map();
const completedOrders = new Map();

// Utility functions
function generateSecret() {
    const secret = randomBytes(32);
    const hashlock = createHash('sha256').update(secret).digest();
    return {
        secret: Array.from(secret),
        hashlock: Array.from(hashlock),
        secretHex: secret.toString('hex'),
        hashlockHex: hashlock.toString('hex')
    };
}

// Order processing functions
async function processOrder(order) {
    logger.info(`Processing order: ${order.orderHash}`);
    
    try {
        const { secret, hashlock, secretHex, hashlockHex } = generateSecret();
        console.log("Generated secret and hashlock");
        const safetyDeposit = calculateSafetyDeposit(order.srcAmount);
        console.log(`Safety deposit calculated: ${safetyDeposit}`);
        const addressTypes = getAddressTypes(order);
        console.log(`Address types determined: ${JSON.stringify(addressTypes)}`);
        
        // Check liquidity requirements
        const liquidityCheck = await checkLiquidityRequirements(order, safetyDeposit);
        if (!liquidityCheck.sufficient) {
            throw new Error(`Insufficient liquidity: ${liquidityCheck.message}`);
        }
        console.log(`Liquidity check passed: ${JSON.stringify(liquidityCheck.balances)}`);
        
        // Store order with generated secret and clean address mapping
        const orderData = {
            ...order,
            ...addressTypes, // Include makerICPAddress, takerEVMAddress, etc.
            secret,
            hashlock,
            secretHex,
            hashlockHex,
            safetyDeposit,
            status: 'processing',
            createdAt: new Date().toISOString(),
            steps: []
        };
        
        activeOrders.set(order.orderHash, orderData);
        
        logger.info(`Order ${order.orderHash} address mapping:`, {
            maker: `${order.maker} (${addressTypes.makerAddressType})`,
            taker: `${order.taker} (${addressTypes.takerAddressType})`,
            flow: `${order.srcChain} → ${order.dstChain}`
        });
        
        // Step 1: Create source escrow
        await createSourceEscrow(orderData);
        
        // Step 2: Create destination escrow
        await createDestinationEscrow(orderData);
        
        // Step 3: Monitor and execute withdrawal when conditions are met
        scheduleWithdrawal(orderData);
        
        return {
            success: true,
            orderHash: order.orderHash,
            hashlockHex,
            status: 'processing',
            addressMapping: {
                makerReceives: `${order.dstToken} on ${order.dstChain} at ${order.maker}`,
                takerReceives: `${order.srcToken} on ${order.srcChain} at ${order.taker}`
            },
            estimatedCompletionTime: new Date(Date.now() + (orderData.timelocks.publicWithdrawal + 30) * 1000).toISOString()
        };
        
    } catch (error) {
        logger.error(`Error processing order ${order.orderHash}:`, error);
        
        // Update order status
        if (activeOrders.has(order.orderHash)) {
            const orderData = activeOrders.get(order.orderHash);
            orderData.status = 'failed';
            orderData.error = error.message;
        }
        
        throw error;
    }
}

// Liquidity check function
async function checkLiquidityRequirements(order, safetyDeposit) {
    try {
        const requiredLiquidity = calculateRequiredLiquidity({
            ...order,
            safetyDeposit
        });
        
        // Check source chain liquidity
        let srcBalance = 0n;
        if (order.srcChain === 'icp') {
            // Check ICP balance (implementation depends on your ICP setup)
            srcBalance = BigInt("10000000000000000000000"); // Mock: 10,000 ICP in e8s
        } else {
            // Check EVM balance
            // if (evmManager) {
            //     if (order.srcToken === '0x0000000000000000000000000000000000000000') {
            //         srcBalance = await evmManager.provider.getBalance(evmManager.wallet.address);
            //     } else {
            //         const tokenContract = new ethers.Contract(order.srcToken, [
            //             "function balanceOf(address account) external view returns (uint256)"
            //         ], evmManager.provider);
            //         srcBalance = await tokenContract.balanceOf(evmManager.wallet.address);
            //     }
            // }
            srcBalance = BigInt("10000000000000000000000"); // Mock: 1 ETH in wei
        }
        
        // Check destination chain liquidity
        let dstBalance = 0n;
        if (order.dstChain === 'icp') {
            // Check ICP balance
            dstBalance = BigInt("10000000000000000000000"); // Mock: 10,000 ICP in e8s
        } else {
            // Check EVM balance
            // if (evmManager) {
            //     if (order.dstToken === '0x0000000000000000000000000000000000000000') {
            //         dstBalance = await evmManager.provider.getBalance(evmManager.wallet.address);
            //     } else {
            //         const tokenContract = new ethers.Contract(order.dstToken, [
            //             "function balanceOf(address account) external view returns (uint256)"
            //         ], evmManager.provider);
            //         dstBalance = await tokenContract.balanceOf(evmManager.wallet.address);
            //     }
            // }
            dstBalance = BigInt("10000000000000000000000"); // Mock: 1 ETH in wei
        }
        
        const srcSufficient = srcBalance >= requiredLiquidity.srcChain;
        const dstSufficient = dstBalance >= requiredLiquidity.dstChain;
        
        return {
            sufficient: srcSufficient && dstSufficient,
            message: !srcSufficient ? `Insufficient ${order.srcChain} balance` : 
                    !dstSufficient ? `Insufficient ${order.dstChain} balance` : 'Sufficient',
            balances: {
                srcRequired: requiredLiquidity.srcChain.toString(),
                srcAvailable: srcBalance.toString(),
                dstRequired: requiredLiquidity.dstChain.toString(),
                dstAvailable: dstBalance.toString()
            }
        };
        
    } catch (error) {
        logger.error('Error checking liquidity:', error);
        return {
            sufficient: false,
            message: 'Error checking liquidity',
            error: error.message
        };
    }
}

async function createSourceEscrow(orderData) {
    console.log('Creating source escrow...');
    const step = { name: 'create_source_escrow', status: 'pending', startedAt: new Date().toISOString() };
    orderData.steps.push(step);
    
    try {
        if (orderData.srcChain === 'icp') {
            // Create ICP source escrow
            const result = await icpManager.createICPSourceEscrow(orderData);
            step.status = 'completed';
            step.completedAt = new Date().toISOString();
            step.result = result;
            logger.info(`ICP source escrow created for order ${orderData.orderHash}`);
            
        } else {
            // Create EVM source escrow
            if (!evmManager) {
                throw new Error('EVM manager not initialized');
            }
            
            const result = await evmManager.createEVMSourceEscrow(orderData);
            step.status = 'completed';
            step.completedAt = new Date().toISOString();
            step.result = result;
            logger.info(`EVM source escrow created for ${orderData.srcChain}, tx: ${result.transactionHash}`);
        }
        
    } catch (error) {
        step.status = 'failed';
        step.error = error.message;
        step.failedAt = new Date().toISOString();
        throw error;
    }
}

async function createDestinationEscrow(orderData) {
    const step = { name: 'create_destination_escrow', status: 'pending', startedAt: new Date().toISOString() };
    orderData.steps.push(step);
    
    try {
        if (orderData.dstChain === 'icp') {
            // Create ICP destination escrow
            const result = await icpManager.createICPDestinationEscrow(orderData);
            step.status = 'completed';
            step.completedAt = new Date().toISOString();
            step.result = result;
            logger.info(`ICP destination escrow created for order ${orderData.orderHash}`);
            
        } else {
            // Create EVM destination escrow
            if (!evmManager) {
                throw new Error('EVM manager not initialized');
            }
            
            const result = await evmManager.createEVMDestinationEscrow(orderData);
            step.status = 'completed';
            step.completedAt = new Date().toISOString();
            step.result = result;
            logger.info(`EVM destination escrow created for ${orderData.dstChain}, tx: ${result.transactionHash}`);
        }
        
    } catch (error) {
        step.status = 'failed';
        step.error = error.message;
        step.failedAt = new Date().toISOString();
        throw error;
    }
}

async function executeWithdrawal(orderData) {
    const step = { name: 'execute_withdrawal', status: 'pending', startedAt: new Date().toISOString() };
    orderData.steps.push(step);
    
    try {
        logger.info(`Executing public withdrawal for order ${orderData.orderHash}`);
        logger.info(`Order timelocks: withdrawal=${orderData.timelocks.withdrawal}s, publicWithdrawal=${orderData.timelocks.publicWithdrawal}s`);
        
        // Determine withdrawal strategy based on swap direction
        const isEVMToICP = orderData.srcChain !== 'icp' && orderData.dstChain === 'icp';
        const isICPToEVM = orderData.srcChain === 'icp' && orderData.dstChain !== 'icp';
        
        if (isEVMToICP) {
            // EVM → ICP: First withdraw from EVM source, then ICP destination
            logger.info(`EVM→ICP swap: Starting EVM source withdrawal first`);
            
            // Step 1: Withdraw from EVM source
            if (!evmManager) {
                throw new Error('EVM manager not initialized');
            }
            logger.info(`Attempting EVM source withdrawal for order ${orderData.orderHash}`);
            const evmResult = await evmManager.withdrawFromEVMSource(orderData);
            logger.info(`EVM source withdrawal completed for order ${orderData.orderHash}, tx: ${evmResult.transactionHash}`);
            
            logger.info(`Attempting ICP destination public withdrawal for order ${orderData.orderHash}`);
            // const icpResult = await icpManager.withdrawFromICPDestination(orderData);
            logger.info(`ICP destination withdrawal completed for order ${orderData.orderHash}`);
            
        } else if (isICPToEVM) {
            // ICP → EVM: First withdraw from ICP source, then EVM destination
            logger.info(`ICP→EVM swap: Starting ICP source withdrawal first`);
            
            // Step 1: Withdraw from ICP source
            logger.info(`Attempting ICP source public withdrawal for order ${orderData.orderHash}`);
            const icpResult = await icpManager.withdrawFromICPSource(orderData);
            logger.info(`ICP source withdrawal completed for order ${orderData.orderHash}`);
            
            // Step 2: Wait a bit then withdraw from EVM destination
            logger.info(`Waiting 10 seconds before EVM destination withdrawal...`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
            
            if (!evmManager) {
                throw new Error('EVM manager not initialized');
            }
            logger.info(`Attempting EVM destination withdrawal for order ${orderData.orderHash}`);
            const evmResult = await evmManager.withdrawFromEVMDestination(orderData);
            logger.info(`EVM destination withdrawal completed for order ${orderData.orderHash}, tx: ${evmResult.transactionHash}`);
            
        } else {
            throw new Error(`Unsupported swap direction: ${orderData.srcChain} → ${orderData.dstChain}`);
        }
        
        step.status = 'completed';
        step.completedAt = new Date().toISOString();
        
        // Mark order as completed
        orderData.status = 'completed';
        orderData.completedAt = new Date().toISOString();
        
        // Move to completed orders
        completedOrders.set(orderData.orderHash, orderData);
        activeOrders.delete(orderData.orderHash);
        
        logger.info(`Order ${orderData.orderHash} completed successfully`);
        
    } catch (error) {
        step.status = 'failed';
        step.error = error.message;
        step.failedAt = new Date().toISOString();
        
        orderData.status = 'failed';
        orderData.error = error.message;
        
        logger.error(`Failed to execute withdrawal for order ${orderData.orderHash}:`, error);
        
        // Log specific error details based on error type
        if (error.message.includes('Unauthorized')) {
            logger.error(`ICP Authorization Error: The resolver may not have permission to withdraw yet. This could be due to timing constraints on the ICP canister.`);
        } else if (error.message.includes('execution reverted')) {
            logger.error(`EVM Contract Error: The withdrawal transaction was reverted. This could be due to insufficient balance, timing constraints, or contract state issues.`);
        } else if (error.message.includes('unknown custom error')) {
            logger.error(`EVM Custom Error: The contract returned a custom error code. Check the contract state and parameters.`);
        }
        
        logger.error(`Error details: ${JSON.stringify(error.message)}`);
        throw error;
    }
}

function scheduleWithdrawal(orderData) {
    // For public withdrawal (resolver-initiated), we need to wait for the publicWithdrawal timelock
    // Since we're using public withdrawal only, wait for the longer timelock
    const publicWithdrawalDelay = orderData.timelocks.withdrawal * 1000; // Convert to milliseconds
    
    // Add extra buffer time for ICP canister to process properly (30 extra seconds)
    // const bufferTime = 30000; // 30 seconds buffer
    const totalDelay = publicWithdrawalDelay;
    
    setTimeout(async () => {
        try {
            // Check if order is still valid before executing withdrawal
            if (!activeOrders.has(orderData.orderHash)) {
                logger.warn(`Order ${orderData.orderHash} no longer active, skipping withdrawal`);
                return;
            }
            
            const currentOrder = activeOrders.get(orderData.orderHash);
            if (currentOrder.status !== 'processing') {
                logger.warn(`Order ${orderData.orderHash} status is ${currentOrder.status}, skipping withdrawal`);
                return;
            }
            
            logger.info(`Starting public withdrawal for order ${orderData.orderHash} after ${totalDelay}ms delay (${orderData.timelocks.publicWithdrawal}s + 30s buffer)`);
            await executeWithdrawal(orderData);
        } catch (error) {
            logger.error(`Scheduled withdrawal failed for order ${orderData.orderHash}:`, error);
            
            // If withdrawal fails, schedule a retry in 60 seconds (longer for ICP)
            setTimeout(async () => {
                try {
                    if (activeOrders.has(orderData.orderHash)) {
                        logger.info(`Retrying withdrawal for order ${orderData.orderHash} after 60s delay`);
                        await executeWithdrawal(orderData);
                    }
                } catch (retryError) {
                    logger.error(`Retry withdrawal also failed for order ${orderData.orderHash}:`, retryError);
                    
                    // Final retry after another 60 seconds
                    setTimeout(async () => {
                        try {
                            if (activeOrders.has(orderData.orderHash)) {
                                logger.info(`Final retry withdrawal for order ${orderData.orderHash}`);
                                await executeWithdrawal(orderData);
                            }
                        } catch (finalError) {
                            logger.error(`Final retry also failed for order ${orderData.orderHash}:`, finalError);
                            // Mark order as failed
                            if (activeOrders.has(orderData.orderHash)) {
                                const order = activeOrders.get(orderData.orderHash);
                                order.status = 'failed';
                                order.error = `All withdrawal attempts failed: ${finalError.message}`;
                            }
                        }
                    }, 60000); // Final retry after 60 seconds
                }
            }, 60000); // First retry after 60 seconds
        }
    }, totalDelay);
    
    logger.info(`Scheduled public withdrawal for order ${orderData.orderHash} in ${totalDelay}ms (${orderData.timelocks.publicWithdrawal}s + 30s buffer)`);
}

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Get resolver info
app.get('/info', (req, res) => {
    res.json({
        name: 'ICP Fusion+ Resolver',
        version: '1.0.0',
        supportedChains: ['icp', 'ethereum', 'polygon', 'arbitrum'],
        supportedTokens: config.resolver.supportedTokens,
        feePercent: config.resolver.feePercent,
        maxOrderSize: config.resolver.maxOrderSize
    });
});

// Submit order for filling
app.post('/orders', async (req, res) => {
    try {
        // Normalize EVM addresses before validation to handle checksum issues
        const orderData = { ...req.body };
        
        try {
            if (orderData.makerEVMAddress) {
                orderData.makerEVMAddress = normalizeEVMAddress(orderData.makerEVMAddress);
            }
            if (orderData.takerEVMAddress) {
                orderData.takerEVMAddress = normalizeEVMAddress(orderData.takerEVMAddress);
            }
        } catch (addressError) {
            return res.status(400).json({
                success: false,
                error: 'Invalid address format',
                details: addressError.message
            });
        }
        
        // Validate request body
        const { error, value } = orderSchema.validate(orderData);
        if (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid order format',
                details: error.details
            });
        }
        
        const order = value;
        
        // Check if order already exists
        if (activeOrders.has(order.orderHash) || completedOrders.has(order.orderHash)) {
            return res.status(409).json({
                success: false,
                error: 'Order already exists'
            });
        }
        
        // Check if order amount is within limits
        if (BigInt(order.srcAmount) > BigInt(config.resolver.maxOrderSize)) {
            return res.status(400).json({
                success: false,
                error: 'Order amount exceeds maximum limit'
            });
        }
        
        // Validate that src and dst chains are different
        if (order.srcChain === order.dstChain) {
            return res.status(400).json({
                success: false,
                error: 'Source and destination chains must be different'
            });
        }
        
        // Validate chain support
        const supportedChains = ['icp', 'ethereum', 'polygon', 'arbitrum', 'base'];
        if (!supportedChains.includes(order.srcChain) || !supportedChains.includes(order.dstChain)) {
            return res.status(400).json({
                success: false,
                error: 'Unsupported chain specified'
            });
        }
        
        // Check deadline
        if (order.deadline < Math.floor(Date.now() / 1000) + 300) { // At least 5 minutes from now
            return res.status(400).json({
                success: false,
                error: 'Order deadline is too soon'
            });
        }
        
        // Validate timelock constraints
        if (order.timelocks.withdrawal >= order.timelocks.publicWithdrawal) {
            return res.status(400).json({
                success: false,
                error: 'Public withdrawal timelock must be greater than withdrawal timelock'
            });
        }
        
        if (order.timelocks.publicWithdrawal >= order.timelocks.cancellation) {
            return res.status(400).json({
                success: false,
                error: 'Cancellation timelock must be greater than public withdrawal timelock'
            });
        }
        
        // Process the order
        const result = await processOrder(order);
        
        res.status(201).json(result);
        
    } catch (error) {
        logger.error('Error processing order submission:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get order status
app.get('/orders/:orderHash', (req, res) => {
    const { orderHash } = req.params;
    
    // Check active orders
    if (activeOrders.has(orderHash)) {
        const order = activeOrders.get(orderHash);
        return res.json({
            success: true,
            order: {
                orderHash: order.orderHash,
                status: order.status,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
                steps: order.steps,
                error: order.error
            }
        });
    }
    
    // Check completed orders
    if (completedOrders.has(orderHash)) {
        const order = completedOrders.get(orderHash);
        return res.json({
            success: true,
            order: {
                orderHash: order.orderHash,
                status: order.status,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
                steps: order.steps
            }
        });
    }
    
    res.status(404).json({
        success: false,
        error: 'Order not found'
    });
});

// Get all orders (with pagination)
app.get('/orders', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const status = req.query.status;
    
    let orders = [];
    
    if (!status || status === 'active') {
        orders.push(...Array.from(activeOrders.values()));
    }
    
    if (!status || status === 'completed') {
        orders.push(...Array.from(completedOrders.values()));
    }
    
    // Sort by creation time (newest first)
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = orders.slice(startIndex, endIndex);
    
    res.json({
        success: true,
        orders: paginatedOrders.map(order => ({
            orderHash: order.orderHash,
            status: order.status,
            srcChain: order.srcChain,
            dstChain: order.dstChain,
            srcAmount: order.srcAmount,
            dstAmount: order.dstAmount,
            createdAt: order.createdAt,
            completedAt: order.completedAt
        })),
        pagination: {
            page,
            limit,
            total: orders.length,
            pages: Math.ceil(orders.length / limit)
        }
    });
});

// Get resolver liquidity status
app.get('/liquidity', async (req, res) => {
    try {
        const liquidityStatus = {};
        
        // Check ICP liquidity
        liquidityStatus.icp = {
            available: "1000000000000", // Mock value - implement actual ICP balance check
            reserved: Array.from(activeOrders.values())
                .filter(order => order.srcChain === 'icp' || order.dstChain === 'icp')
                .reduce((sum, order) => {
                    const amount = BigInt(order.srcChain === 'icp' ? order.srcAmount : order.dstAmount);
                    const deposit = BigInt(calculateSafetyDeposit(order.srcChain === 'icp' ? order.srcAmount : order.dstAmount));
                    return sum + amount + deposit;
                }, BigInt(0)).toString()
        };
        
        // Check EVM liquidity
        if (evmManager) {
            try {
                const ethBalance = await evmManager.provider.getBalance(evmManager.wallet.address);
                liquidityStatus.ethereum = {
                    eth: {
                        available: ethBalance.toString(),
                        reserved: Array.from(activeOrders.values())
                            .filter(order => 
                                (order.srcChain === 'ethereum' && order.srcToken === '0x0000000000000000000000000000000000000000') ||
                                (order.dstChain === 'ethereum' && order.dstToken === '0x0000000000000000000000000000000000000000')
                            )
                            .reduce((sum, order) => {
                                const amount = BigInt(order.srcChain === 'ethereum' ? order.srcAmount : order.dstAmount);
                                const deposit = BigInt(calculateSafetyDeposit(order.srcChain === 'ethereum' ? order.srcAmount : order.dstAmount));
                                return sum + amount + deposit;
                            }, BigInt(0)).toString()
                    }
                };
            } catch (error) {
                logger.error('Error fetching EVM liquidity:', error);
                liquidityStatus.ethereum = { error: 'Unable to fetch balance' };
            }
        } else {
            liquidityStatus.ethereum = { error: 'EVM manager not initialized' };
        }
        
        res.json({
            success: true,
            liquidity: liquidityStatus,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Error fetching liquidity status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch liquidity status'
        });
    }
});

// Cancel order endpoint (for emergency situations)
app.post('/orders/:orderHash/cancel', async (req, res) => {
    try {
        const { orderHash } = req.params;
        
        if (!activeOrders.has(orderHash)) {
            return res.status(404).json({
                success: false,
                error: 'Order not found or already completed'
            });
        }
        
        const orderData = activeOrders.get(orderHash);
        
        if (orderData.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Cannot cancel completed order'
            });
        }
        
        // Update order status
        orderData.status = 'cancelling';
        orderData.cancelledAt = new Date().toISOString();
        
        // TODO: Implement actual cancellation logic here
        // This would involve calling cancel functions on the escrow contracts
        
        logger.info(`Order ${orderHash} marked for cancellation`);
        
        res.json({
            success: true,
            message: 'Order cancellation initiated',
            orderHash,
            status: 'cancelling'
        });
        
    } catch (error) {
        logger.error('Error cancelling order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel order'
        });
    }
});

// Get resolver stats endpoint
app.get('/stats', (req, res) => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const allOrders = [...Array.from(activeOrders.values()), ...Array.from(completedOrders.values())];
    const recent24h = allOrders.filter(order => new Date(order.createdAt) > last24h);
    
    const stats = {
        totalOrders: allOrders.length,
        activeOrders: activeOrders.size,
        completedOrders: completedOrders.size,
        last24h: {
            total: recent24h.length,
            completed: recent24h.filter(order => order.status === 'completed').length,
            failed: recent24h.filter(order => order.status === 'failed').length
        },
        uptime: process.uptime(),
        timestamp: now.toISOString()
    };
    
    res.json({
        success: true,
        stats
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Cleanup job - runs every hour to clean up old failed orders
cron.schedule('0 * * * *', () => {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    let cleanupCount = 0;
    for (const [orderHash, order] of activeOrders.entries()) {
        if (order.status === 'failed' && new Date(order.createdAt) < cutoffTime) {
            activeOrders.delete(orderHash);
            cleanupCount++;
        }
    }
    
    if (cleanupCount > 0) {
        logger.info(`Cleaned up ${cleanupCount} old failed orders`);
    }
});

// Start server
async function startServer() {
    try {
        // Initialize contract managers
        await initializeManagers();
        
        app.listen(PORT, () => {
            logger.info(`ICP Fusion+ Resolver server started on port ${PORT}`);
            logger.info('Environment:', {
                icpHost: config.icp.host,
                icpCanisterId: config.icp.canisterId,
                evmRpcUrl: config.evm.rpcUrl,
                resolverFee: config.resolver.feePercent + '%'
            });
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Remove old functions that are no longer needed
// createICPActor and createEVMProvider are now handled by contract managers

startServer();

export default app;
