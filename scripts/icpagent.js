import { createHash, randomBytes } from 'crypto';
import { Actor, HttpAgent } from '@dfinity/agent';

/**
 * Generate a cryptographic secret and its SHA256 hash
 * @returns {Object} Object containing secret and hashlock
 */
function generateSecret() {
    // Generate 32 bytes of random data for the secret
    const secret = randomBytes(32);
    
    // Create SHA256 hash of the secret (hashlock)
    const hashlock = createHash('sha256').update(secret).digest();
    
    return {
        secret: Array.from(secret), // Convert to array for Candid
        hashlock: Array.from(hashlock) // Convert to array for Candid
    };
}

/**
 * Create source escrow for ICP→EVM swaps
 * @param {Object} params - Escrow parameters
 * @param {string} params.orderHash - 32-byte order hash from EVM (hex string)
 * @param {string} params.maker - EVM address of maker (initiator)
 * @param {string} params.taker - EVM address of taker (counterparty)
 * @param {string} params.token - EVM token address (0x0000...0000 for ETH)
 * @param {bigint} params.amount - Amount in smallest unit (wei for ETH)
 * @param {bigint} params.safetyDeposit - Safety deposit in ICP e8s
 * @param {Object} params.timelocks - Timelock configuration
 * @param {bigint} params.timelocks.withdrawal - Private withdrawal delay (seconds)
 * @param {bigint} params.timelocks.publicWithdrawal - Public withdrawal delay (seconds)
 * @param {bigint} params.timelocks.cancellation - Cancellation delay (seconds)
 * @param {Object} agent - Initialized IC agent
 * @param {Object} actor - IC actor for the escrow canister
 * @returns {Promise<Object>} Result containing hashlock and secret
 */
async function createSourceEscrow(params, agent, actor) {
    try {
        // Generate secret and hashlock
        const { secret, hashlock } = generateSecret();
        
        // Convert order hash from hex string to byte array
        const orderHashBytes = params.orderHash.startsWith('0x') 
            ? Array.from(Buffer.from(params.orderHash.slice(2), 'hex'))
            : Array.from(Buffer.from(params.orderHash, 'hex'));
        
        // Validate order hash length
        if (orderHashBytes.length !== 32) {
            throw new Error('Order hash must be 32 bytes');
        }
        
        // Prepare escrow immutables for the canister call
        const escrowImmutables = {
            order_hash: orderHashBytes,
            hashlock: hashlock,
            maker: params.maker,
            taker: params.taker,
            token: params.token,
            amount: params.amount,
            safety_deposit: params.safetyDeposit,
            timelocks: {
                withdrawal: params.timelocks.withdrawal,
                public_withdrawal: params.timelocks.publicWithdrawal,
                cancellation: params.timelocks.cancellation,
                deployed_at: 0n // Will be set by the canister
            }
        };
        
        console.log('Creating source escrow with params:', {
            ...escrowImmutables,
            hashlock: Buffer.from(hashlock).toString('hex'),
            order_hash: Buffer.from(orderHashBytes).toString('hex')
        });
        
        // Call the create_src_escrow function
        const result = await actor.create_src_escrow(escrowImmutables);
        
        // Handle the Result type response
        if ('Ok' in result) {
            const returnedHashlock = result.Ok;
            
            return {
                success: true,
                hashlock: Array.from(returnedHashlock),
                hashlockHex: Buffer.from(returnedHashlock).toString('hex'),
                secret: secret,
                secretHex: Buffer.from(secret).toString('hex'),
                escrowImmutables
            };
        } else {
            // Handle error case
            const error = result.Err;
            throw new Error(`Escrow creation failed: ${JSON.stringify(error)}`);
        }
        
    } catch (error) {
        console.error('Error creating source escrow:', error);
        return {
            success: false,
            error: error.message || 'Unknown error occurred'
        };
    }
}

/**
 * Initialize IC connection and create escrow
 * @param {string} canisterId - Your escrow canister ID
 * @param {Object} escrowParams - Escrow parameters (same as createSourceEscrow)
 * @param {string} host - IC host (optional, defaults to local)
 * @returns {Promise<Object>} Escrow creation result
 */
async function initAndCreateEscrow(canisterId, escrowParams, host = 'http://127.0.0.1:4943') {
    try {
        // Initialize agent
        const agent = new HttpAgent({ host });
        
        // Fetch root key for local development (remove for mainnet)
        if (host.includes('127.0.0.1') || host.includes('localhost')) {
            await agent.fetchRootKey();
        }
        
        // Create actor (you'll need to import your canister's IDL)
        // Replace 'idlFactory' with your actual IDL factory
        const actor = Actor.createActor(idlFactory, {
            agent,
            canisterId,
        });
        
        // Create the escrow
        return await createSourceEscrow(escrowParams, agent, actor);
        
    } catch (error) {
        console.error('Error initializing and creating escrow:', error);
        return {
            success: false,
            error: error.message || 'Failed to initialize connection'
        };
    }
}

// Example usage:
async function exampleUsage() {
    const escrowParams = {
        orderHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // 32 bytes
        maker: '0x742d35Cc6E5A69e6d89B134b1234567890123456',
        taker: '0x853F2A1C45c6543B8DA94B891234567890123456',
        token: '0x0000000000000000000000000000000000000000', // ETH
        amount: 1000000000000000000n, // 1 ETH in wei
        safetyDeposit: 100000000n, // 1 ICP in e8s
        timelocks: {
            withdrawal: 3600n, // 1 hour
            publicWithdrawal: 7200n, // 2 hours
            cancellation: 86400n // 24 hours
        }
    };
    
    const result = await initAndCreateEscrow('your-canister-id', escrowParams);
    
    if (result.success) {
        console.log('Escrow created successfully!');
        console.log('Hashlock:', result.hashlockHex);
        console.log('Secret (keep safe!):', result.secretHex);
    } else {
        console.error('Failed to create escrow:', result.error);
    }
}

export { generateSecret, createSourceEscrow, initAndCreateEscrow };