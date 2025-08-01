import express from 'express';
import dotenv from 'dotenv';
import winston from 'winston';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import Joi from 'joi';
import { ethers } from 'ethers';
import { randomBytes, createHash } from 'crypto';
import cron from 'node-cron';
import { ICPContractManager, EVMContractManager, calculateRequiredLiquidity, calculateSafetyDeposit } from './contracts.js';
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
        canisterId: process.env.ICP_CANISTER_ID || 'rdmx6-jaaaa-aaaaa-aaadq-cai',
        host: process.env.ICP_HOST || 'http://127.0.0.1:4943',
        isLocal: process.env.ICP_ENV === 'local'
    },
    evm: {
        rpcUrl: process.env.EVM_RPC_URL || 'http://127.0.0.1:8545',
        privateKey: process.env.EVM_PRIVATE_KEY,
        escrowSrcAddress: process.env.EVM_ESCROW_SRC_ADDRESS,
        escrowDstAddress: process.env.EVM_ESCROW_DST_ADDRESS,
        gasLimit: process.env.EVM_GAS_LIMIT || '500000'
    },
    resolver: {
        feePercent: parseFloat(process.env.RESOLVER_FEE_PERCENT || '0.1'),
        maxOrderSize: process.env.MAX_ORDER_SIZE || '1000000000000', // 10,000 ICP in e8s
        supportedTokens: (process.env.SUPPORTED_TOKENS || '').split(',').filter(Boolean)
    }
};

// Order validation schema
const orderSchema = Joi.object({
    orderHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
    srcChain: Joi.string().valid('icp', 'ethereum', 'polygon', 'arbitrum').required(),
    dstChain: Joi.string().valid('icp', 'ethereum', 'polygon', 'arbitrum').required(),
    srcToken: Joi.string().required(),
    dstToken: Joi.string().required(),
    srcAmount: Joi.string().pattern(/^[0-9]+$/).required(),
    dstAmount: Joi.string().pattern(/^[0-9]+$/).required(),
    maker: Joi.string().required(),
    taker: Joi.string().required(),
    deadline: Joi.number().integer().min(Math.floor(Date.now() / 1000)).required(),
    timelocks: Joi.object({
        withdrawal: Joi.number().integer().min(300).max(86400).required(), // 5 min to 24 hours
        publicWithdrawal: Joi.number().integer().min(600).max(172800).required(), // 10 min to 48 hours
        cancellation: Joi.number().integer().min(3600).max(604800).required() // 1 hour to 7 days
    }).required()
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
        if (config.evm.privateKey && config.evm.escrowSrcAddress && config.evm.escrowDstAddress) {
            const provider = new ethers.JsonRpcProvider(config.evm.rpcUrl);
            const wallet = new ethers.Wallet(config.evm.privateKey, provider);
            
            evmManager = new EVMContractManager(
                provider,
                wallet,
                config.evm.escrowSrcAddress,
                config.evm.escrowDstAddress
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
        const safetyDeposit = calculateSafetyDeposit(order.srcAmount);
        
        // Check liquidity requirements
        const liquidityCheck = await checkLiquidityRequirements(order, safetyDeposit);
        if (!liquidityCheck.sufficient) {
            throw new Error(`Insufficient liquidity: ${liquidityCheck.message}`);
        }
        
        // Store order with generated secret
        const orderData = {
            ...order,
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
            estimatedCompletionTime: new Date(Date.now() + orderData.timelocks.withdrawal * 1000).toISOString()
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
            srcBalance = BigInt("1000000000000"); // Mock: 10,000 ICP in e8s
        } else {
            // Check EVM balance
            if (evmManager) {
                if (order.srcToken === '0x0000000000000000000000000000000000000000') {
                    srcBalance = await evmManager.provider.getBalance(evmManager.wallet.address);
                } else {
                    const tokenContract = new ethers.Contract(order.srcToken, [
                        "function balanceOf(address account) external view returns (uint256)"
                    ], evmManager.provider);
                    srcBalance = await tokenContract.balanceOf(evmManager.wallet.address);
                }
            }
        }
        
        // Check destination chain liquidity
        let dstBalance = 0n;
        if (order.dstChain === 'icp') {
            // Check ICP balance
            dstBalance = BigInt("1000000000000"); // Mock: 10,000 ICP in e8s
        } else {
            // Check EVM balance
            if (evmManager) {
                if (order.dstToken === '0x0000000000000000000000000000000000000000') {
                    dstBalance = await evmManager.provider.getBalance(evmManager.wallet.address);
                } else {
                    const tokenContract = new ethers.Contract(order.dstToken, [
                        "function balanceOf(address account) external view returns (uint256)"
                    ], evmManager.provider);
                    dstBalance = await tokenContract.balanceOf(evmManager.wallet.address);
                }
            }
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
        // First withdraw from source to get the funds
        if (orderData.srcChain === 'icp') {
            const result = await icpManager.withdrawFromICPSource(orderData);
            logger.info(`ICP source withdrawal completed for order ${orderData.orderHash}`);
        } else {
            if (!evmManager) {
                throw new Error('EVM manager not initialized');
            }
            const result = await evmManager.withdrawFromEVMSource(orderData);
            logger.info(`EVM source withdrawal completed for order ${orderData.orderHash}, tx: ${result.transactionHash}`);
        }
        
        // Then withdraw from destination to complete the swap
        if (orderData.dstChain === 'icp') {
            const result = await icpManager.withdrawFromICPDestination(orderData);
            logger.info(`ICP destination withdrawal completed for order ${orderData.orderHash}`);
        } else {
            if (!evmManager) {
                throw new Error('EVM manager not initialized');
            }
            const result = await evmManager.withdrawFromEVMDestination(orderData);
            logger.info(`EVM destination withdrawal completed for order ${orderData.orderHash}, tx: ${result.transactionHash}`);
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
        throw error;
    }
}

function scheduleWithdrawal(orderData) {
    // Schedule withdrawal after the withdrawal timelock period
    const withdrawalDelay = orderData.timelocks.withdrawal * 1000; // Convert to milliseconds
    
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
            
            await executeWithdrawal(orderData);
        } catch (error) {
            logger.error(`Scheduled withdrawal failed for order ${orderData.orderHash}:`, error);
        }
    }, withdrawalDelay);
    
    logger.info(`Scheduled withdrawal for order ${orderData.orderHash} in ${withdrawalDelay}ms`);
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
        // Validate request body
        const { error, value } = orderSchema.validate(req.body);
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
        const supportedChains = ['icp', 'ethereum', 'polygon', 'arbitrum'];
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
