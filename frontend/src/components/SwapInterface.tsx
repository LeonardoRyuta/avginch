import { useState } from 'react';
import type { Chain, Token, SwapQuote } from '../types';
import ChainSelector from './ChainSelector';
import TokenSelector from './TokenSelector';
import useAuthClient from '../hooks/useAuthClient';
import { useEVMContract } from '../web3/evm';
import { AccountIdentifier } from '@dfinity/ledger-icp';
import { Principal } from '@dfinity/principal';
import { formatEther, parseEther } from 'ethers';

export default function SwapInterface() {
    const [fromChain, setFromChain] = useState<Chain | null>({
        id: 'base',
        name: 'Base',
        symbol: 'ETH',
        icon: '🔷',
        rpcUrl: 'https://sepolia.base.org'
    });
    const [toChain, setToChain] = useState<Chain | null>({
        id: 'icp',
        name: 'Internet Computer',
        symbol: 'ICP',
        icon: '∞',
        rpcUrl: 'https://ic0.app',
    });
    const [fromToken, setFromToken] = useState<Token | null>({
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        icon: '🔷',
        chainId: 'base',
    });
    const [toToken, setToToken] = useState<Token | null>({
        address: 'rrkah-fqaaa-aaaaa-aaaaq-cai',
        symbol: 'ICP',
        name: 'Internet Computer',
        decimals: 8,
        icon: '∞',
        chainId: 'icp',
    });
    const [fromAmount, setFromAmount] = useState('0.01');
    const [toAmount, setToAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [quote, setQuote] = useState<SwapQuote | null>(null);
    const [escrowInfo, setEscrowInfo] = useState<{
        sourceAddress?: string;
        destinationAddress?: string;
        creationFee?: string;
    }>({});

    // Order tracking state
    const [activeOrder, setActiveOrder] = useState<{
        orderHash: string;
        status: string;
        steps: Array<{
            name: string;
            status: 'pending' | 'completed' | 'failed';
            details?: Record<string, unknown>;
            error?: string;
            startedAt?: string;
            completedAt?: string;
        }>;
        createdAt?: string;
        completedAt?: string;
        error?: string;
    } | null>(null);

    // New fields for dual addressing - updated with correct format for testing
    // Test data with proper ICP address format (xxxxx-xxxxx-xxxxx-xxxxx-xxx) matching resolver validation
    const [makerEVMAddress, setMakerEVMAddress] = useState('0xBd37AfeE5e9f60ee092DC2471dB260BC623Cf836');
    const [makerICPAddress, setMakerICPAddress] = useState('qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae'); // Fixed format: 5-5-5-5-3
    const [takerEVMAddress, setTakerEVMAddress] = useState('0x7D8FcE4Eb0648f6aa98a5a2d33A8CE865C938A6e');
    const [takerICPAddress, setTakerICPAddress] = useState('f5hu5-c5eqs-4m2bm-fxb27-5mnk2-lpbva-l3tb5-7xv5p-w65wt-a3uyd-lqe'); // Fixed format: 5-5-5-5-3

    const { webapp, ledgerCanister } = useAuthClient();
    const { helper: evmHelper, account: evmAccount, isConnected: isEvmConnected, connect: connectEvm } = useEVMContract('base-sepolia');

    // Check resolver health
    const checkResolverHealth = async () => {
        const resolverUrl = import.meta.env.VITE_RESOLVER_URL || 'http://localhost:3000';
        try {
            const response = await fetch(`${resolverUrl}/health`);
            const health = await response.json();
            console.log('🔋 Resolver health check:', health);

            if (health.status === 'healthy') {
                alert(`✅ Resolver is healthy and ready!\n\nURL: ${resolverUrl}\nUptime: ${Math.floor(health.uptime / 60)} minutes`);
            } else {
                alert(`⚠️ Resolver responded but may have issues:\n${JSON.stringify(health, null, 2)}`);
            }
        } catch (error) {
            console.error('❌ Resolver health check failed:', error);
            alert(`❌ Cannot connect to resolver at ${resolverUrl}\n\nError: ${error}\n\nPlease ensure the resolver is running.`);
        }
    };

    // Enhanced order tracking function with better UX
    const trackOrderStatus = async (orderHash: string, resolverUrl: string) => {
        let pollCount = 0;
        const maxPollAttempts = 360; // 30 minutes at 5 second intervals

        const pollOrder = async () => {
            try {
                pollCount++;
                const response = await fetch(`${resolverUrl}/orders/${orderHash}`);
                const orderData = await response.json();

                if (orderData.success) {
                    const order = orderData.order;
                    setActiveOrder({
                        orderHash,
                        status: order.status,
                        steps: order.steps || [],
                        createdAt: order.createdAt,
                        completedAt: order.completedAt,
                        error: order.error
                    });

                    console.log(`[Poll ${pollCount}] Order ${orderHash.slice(0, 10)}... status:`, order.status);

                    // Show progress in steps with detailed logging
                    if (order.steps && order.steps.length > 0) {
                        console.log('🔄 Current steps:');
                        order.steps.forEach((step: { name: string; status: string; details?: Record<string, unknown>; startedAt?: string; completedAt?: string; error?: string }, index: number) => {
                            const statusIcon = step.status === 'completed' ? '✅' :
                                step.status === 'failed' ? '❌' :
                                    step.status === 'pending' ? '⏳' : '🔄';
                            console.log(`  ${statusIcon} ${index + 1}. ${step.name.replace(/_/g, ' ').toUpperCase()} - ${step.status}`);
                            if (step.error) console.log(`     ❌ Error: ${step.error}`);
                            if (step.details) console.log(`     📊 Details:`, step.details);
                        });
                    }

                    // Check if order is completed
                    if (order.status === 'completed') {
                        console.log('🎉 ORDER COMPLETED SUCCESSFULLY!');
                        // Show a more detailed success message
                        alert(`🎉 Swap Completed Successfully! 🎉\n\nOrder: ${orderHash.slice(0, 10)}...\nYour cross-chain swap has been executed.\n\nCheck your wallets for the received tokens.`);
                        setActiveOrder(null);
                        return; // Stop polling
                    } else if (order.status === 'failed') {
                        console.log('❌ ORDER FAILED!');
                        const errorMsg = order.error ? `\n\nError: ${order.error}` : '';
                        alert(`❌ Order Failed ❌\n\nOrder: ${orderHash.slice(0, 10)}...${errorMsg}\n\nPlease check the console for more details and try again.`);
                        setActiveOrder(null);
                        return; // Stop polling
                    }
                } else {
                    console.warn(`Poll ${pollCount}: Order data not found or invalid response`);
                }

                // Check if we should continue polling
                if (pollCount >= maxPollAttempts) {
                    console.warn('Max polling attempts reached. Stopping order tracking.');
                    alert('⚠️ Order tracking timeout. Please check the resolver or try refreshing the page.');
                    setActiveOrder(null);
                    return;
                }

                // Continue polling if order is still active
                setTimeout(pollOrder, 5000); // Poll every 5 seconds
            } catch (error) {
                console.error(`Failed to poll order status (attempt ${pollCount}):`, error);

                // If we've had too many failures, stop
                if (pollCount >= maxPollAttempts) {
                    alert('❌ Unable to track order status. Please check if the resolver is running.');
                    setActiveOrder(null);
                    return;
                }

                // Retry with exponential backoff for network errors
                const retryDelay = Math.min(10000 * Math.pow(1.5, Math.floor(pollCount / 10)), 30000);
                setTimeout(pollOrder, retryDelay);
            }
        };

        // Start polling immediately
        console.log(`🚀 Starting order tracking for ${orderHash.slice(0, 10)}...`);
        pollOrder();
    };

    const handleSwapDirection = () => {
        setFromChain(toChain);
        setToChain(fromChain);
        setFromToken(toToken);
        setToToken(fromToken);
        setFromAmount(toAmount);
        setToAmount(fromAmount);
    };

    const handleGetQuote = async () => {
        if (!fromChain || !toChain || !fromToken || !toToken || !fromAmount) {
            return;
        }

        setIsLoading(true);

        try {
            // Get escrow info for EVM chains
            if ((fromChain.id === 'ethereum' || fromChain.id === 'base') && evmHelper) {
                console.log("Getting EVM escrow info...")
                const orderHash = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)),
                    byte => byte.toString(16).padStart(2, '0')).join('');
                const hashlock = '0x' + '0'.repeat(64); // Mock hashlock for preview

                // For EVM contracts, we need EVM addresses for proper fund withdrawal
                // The EVM contract needs to know which EVM addresses can withdraw funds
                const evmImmutables = evmHelper.prepareEVMOrderImmutables({
                    orderHash,
                    hashlock,
                    makerEVMAddress: makerEVMAddress, // EVM address that can withdraw from maker's side
                    takerEVMAddress: takerEVMAddress, // EVM address that can withdraw from taker's side
                    tokenEVMAddress: fromToken.address || '0x0000000000000000000000000000000000000000',
                    amount: parseEther(fromAmount).toString(),
                    safetyDeposit: (parseEther(fromAmount) * BigInt(15) / BigInt(100)).toString(),
                    timelocks: {
                        withdrawal: 30,      // 30 seconds
                        publicWithdrawal: 60, // 60 seconds (for fast testing)
                        cancellation: 43200,   // 12 hours
                        deployedAt: 0
                    }
                });

                const [sourceAddress, destinationAddress, creationFee] = await Promise.all([
                    evmHelper.getEscrowSourceAddress(evmImmutables),
                    evmHelper.getEscrowDestinationAddress(evmImmutables),
                    evmHelper.getCreationFee()
                ]);

                setEscrowInfo({
                    sourceAddress,
                    destinationAddress,
                    creationFee: formatEther(creationFee)
                });
                console.log("EVM escrow info:", { sourceAddress, destinationAddress, creationFee: formatEther(creationFee) });
            }

            // Simulate API call - replace with actual Fusion+ integration
            const estimatedAmount = (parseFloat(fromAmount) * 0.998).toFixed(6);
            setToAmount(estimatedAmount);

            setQuote({
                fromAmount,
                toAmount: estimatedAmount,
                fromToken,
                toToken,
                fromChain,
                toChain,
                estimatedGas: '0.002',
                bridgeFee: '0.1',
                route: [fromChain.name, toChain.name],
            });
        } catch (error) {
            console.error('Failed to get quote:', error);
            // Fallback to basic quote without escrow info
            const estimatedAmount = (parseFloat(fromAmount) * 0.998).toFixed(6);
            setToAmount(estimatedAmount);

            setQuote({
                fromAmount,
                toAmount: estimatedAmount,
                fromToken,
                toToken,
                fromChain,
                toChain,
                estimatedGas: '0.002',
                bridgeFee: '0.1',
                route: [fromChain.name, toChain.name],
            });
        } finally {
            setIsLoading(false);
        }
    };

    const testWithdraw = async () => {
        const secret = [33, 196, 61, 119, 15, 62, 195, 118, 228, 181, 55, 195, 108, 152, 105, 50, 244, 251, 14, 131, 173, 80, 181, 101, 232, 7, 79, 112, 52, 27, 111, 7]

        const hashlock = [253, 127, 201, 127, 180, 15, 64, 246, 188, 16, 43, 118, 249, 252, 107, 120, 162, 193, 72, 123, 17, 190, 186, 158, 105, 232, 145, 51, 52, 104, 201, 102]

        await webapp?.withdraw_src(secret, hashlock).then((e) => {
            console.log('Withdraw successful:', e);
            alert('Withdraw successful!');
        }).catch((error) => {
            console.error('Withdraw failed:', error);
            alert('Withdraw failed. Check console for details.');
        });
    }

    const depositToCanister = async (amount: number) => {
        await ledgerCanister?.transfer({
            to: AccountIdentifier.fromPrincipal({ principal: Principal.fromText("uzt4z-lp777-77774-qaabq-cai") }),
            amount: BigInt(amount * 1000000), // Convert to smallest unit (ICP to satoshis)
        }).then((e) => {
            console.log('Deposit successful:', e);
            alert('Deposit successful!');
            return true;
        }).catch((error) => {
            console.error('Deposit failed:', error);
            alert('Deposit failed. Check console for details.');
            return false;
        })

        return true;
    }

    const handleSwap = async () => {
        if (!quote) return;

        setIsLoading(true);

        try {
            // Handle EVM to ICP swaps
            if ((fromChain?.id === 'ethereum' || fromChain?.id === 'base') && toChain?.id === 'icp') {
                if (!isEvmConnected) {
                    await connectEvm();
                    setIsLoading(false);
                    return;
                }

                if (evmHelper && escrowInfo.sourceAddress) {
                    // let txHash;

                    // if (fromToken?.address === '0x0000000000000000000000000000000000000000') {
                    //     // ETH deposit
                    //     txHash = await evmHelper.depositETHToEscrow(
                    //         escrowInfo.sourceAddress,
                    //         fromAmount
                    //     );
                    // } else {
                    //     // ERC20 deposit
                    //     txHash = await evmHelper.depositERC20ToEscrow(
                    //         fromToken?.address || '',
                    //         escrowInfo.sourceAddress,
                    //         parseEther(fromAmount).toString()
                    //     );
                    // }

                    // console.log('EVM deposit successful:', txHash);
                    // alert(`Deposit successful! TX: ${txHash.slice(0, 10)}...`);

                    // Submit order to resolver with dual addressing
                    const orderHash = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)),
                        byte => byte.toString(16).padStart(2, '0')).join('');

                    const order = {
                        orderHash,
                        srcChain: fromChain.id,
                        dstChain: toChain.id,
                        srcToken: fromToken?.address || '0x0000000000000000000000000000000000000000',
                        dstToken: toToken?.address || '0x0000000000000000000000000000000000000000',
                        srcAmount: parseEther(fromAmount).toString(),
                        dstAmount: parseEther(toAmount).toString(),

                        // EVM→ICP dual addressing (required by resolver)
                        makerICPAddress: makerICPAddress,     // Where maker receives ICP tokens
                        makerEVMAddress: evmAccount,          // Maker's EVM address (connected wallet)
                        takerEVMAddress: takerEVMAddress,     // Taker's EVM address for validation
                        takerICPAddress: takerICPAddress,     // Taker's ICP address (optional but good to have)

                        // Legacy fields for backward compatibility (will be deprecated)
                        maker: makerICPAddress, // ICP address that will receive the ICP tokens
                        taker: evmAccount, // EVM address that deposited and will complete the swap

                        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
                        timelocks: {
                            withdrawal: 30,      // 30 seconds
                            publicWithdrawal: 60, // 60 seconds (for fast testing)
                            cancellation: 43200    // 12 hours
                        }
                    };

                    // Submit order to resolver using environment variable
                    const resolverUrl = import.meta.env.VITE_RESOLVER_URL || 'http://localhost:3000';

                    console.log('� EVM→ICP Order Validation Debug:');
                    console.log('  📋 Complete Order Object:', JSON.stringify(order, null, 2));
                    console.log('  🏷️ Field-by-Field Validation:');
                    console.log('    orderHash:', order.orderHash, '✓ Format:', /^0x[a-fA-F0-9]{64}$/.test(order.orderHash));
                    console.log('    srcChain:', order.srcChain, '✓ Valid:', ['icp', 'ethereum', 'base'].includes(order.srcChain));
                    console.log('    dstChain:', order.dstChain, '✓ Valid:', ['icp', 'ethereum', 'base'].includes(order.dstChain));
                    console.log('    srcAmount:', order.srcAmount, '✓ Format:', /^[0-9]+$/.test(order.srcAmount));
                    console.log('    dstAmount:', order.dstAmount, '✓ Format:', /^[0-9]+$/.test(order.dstAmount));
                    console.log('    makerICPAddress:', order.makerICPAddress, '✓ Format:', /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{3}$/.test(order.makerICPAddress));
                    console.log('    makerEVMAddress:', order.makerEVMAddress, '✓ Format:', /^0x[a-fA-F0-9]{40}$/.test(order.makerEVMAddress));
                    console.log('    takerEVMAddress:', order.takerEVMAddress, '✓ Format:', /^0x[a-fA-F0-9]{40}$/.test(order.takerEVMAddress));
                    console.log('    takerICPAddress:', order.takerICPAddress, '✓ Format:', /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{3}$/.test(order.takerICPAddress));
                    console.log('    deadline:', order.deadline, '✓ Future:', order.deadline > Math.floor(Date.now() / 1000));
                    console.log('    timelocks:', order.timelocks);

                    // Frontend validation before sending to resolver
                    const validateOrder = () => {
                        const errors = [];

                        // Check required fields
                        if (!order.orderHash || !/^0x[a-fA-F0-9]{64}$/.test(order.orderHash)) {
                            errors.push('Invalid orderHash format');
                        }
                        if (!order.srcChain || !['icp', 'ethereum', 'base'].includes(order.srcChain)) {
                            errors.push('Invalid srcChain');
                        }
                        if (!order.dstChain || !['icp', 'ethereum', 'base'].includes(order.dstChain)) {
                            errors.push('Invalid dstChain');
                        }
                        if (!order.srcAmount || !/^[0-9]+$/.test(order.srcAmount)) {
                            errors.push('Invalid srcAmount format');
                        }
                        if (!order.dstAmount || !/^[0-9]+$/.test(order.dstAmount)) {
                            errors.push('Invalid dstAmount format');
                        }

                        return errors;
                    };

                    const validationErrors = validateOrder();
                    if (validationErrors.length > 0) {
                        console.error('❌ Order validation failed:', validationErrors);
                        alert(`❌ Order Validation Failed:\n\n${validationErrors.join('\n')}`);
                        return;
                    }

                    console.log('✅ Order validation passed');

                    try {
                        const response = await fetch(`${resolverUrl}/orders`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(order)
                        });

                        const resolverResult = await response.json();

                        if (resolverResult.success) {
                            console.log('✅ Order submitted to resolver successfully:', resolverResult);
                            alert(`🚀 Order Submitted Successfully! 🚀\n\nOrder Hash: ${orderHash.slice(0, 10)}...\nFlow: ${fromChain.name} → ${toChain.name}\nAmount: ${fromAmount} ${fromToken?.symbol} → ${toAmount} ${toToken?.symbol}\n\nThe resolver is now processing your cross-chain swap.\nYou can track progress below and in the console.`);

                            // Start tracking order status
                            trackOrderStatus(orderHash, resolverUrl);
                        } else {
                            console.error('❌ Resolver rejected order:', resolverResult);
                            alert(`❌ Order Submission Failed ❌\n\nReason: ${resolverResult.error || 'Unknown error'}\n\n${resolverResult.details ? `Details: ${JSON.stringify(resolverResult.details)}` : 'Please check the console for more details.'}`);
                        }
                    } catch (error) {
                        console.error('❌ Failed to submit order to resolver:', error);
                        alert(`❌ Connection Error ❌\n\nFailed to connect to the resolver at:\n${resolverUrl}\n\nPlease ensure:\n1. The resolver is running\n2. The URL is correct\n3. CORS is properly configured\n\nCheck the console for technical details.`);
                    }
                }
            }
            // Handle ICP to EVM swaps  
            else if (fromChain?.id === 'icp') {
                const depositSuccess = await depositToCanister(fromAmount ? parseFloat(fromAmount) : 0);
                if (!depositSuccess) {
                    setIsLoading(false);
                    return;
                }
                console.log('✅ ICP deposit successful');

                // Submit ICP→EVM order to resolver  
                const orderHash = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)),
                    byte => byte.toString(16).padStart(2, '0')).join('');

                const order = {
                    orderHash,
                    srcChain: fromChain.id,
                    dstChain: toChain?.id,
                    srcToken: fromToken?.address || 'ryjl3-tyaaa-aaaaa-aaaba-cai', // ICP ledger canister
                    dstToken: toToken?.address || '0x0000000000000000000000000000000000000000',
                    srcAmount: (parseFloat(fromAmount) * 100000000).toString(), // Convert ICP to e8s
                    dstAmount: parseEther(toAmount).toString(),

                    // ICP→EVM dual addressing (required by resolver)
                    makerEVMAddress: evmAccount,          // Where maker receives EVM tokens  
                    makerICPAddress: makerICPAddress,     // Maker's ICP address (who deposited)
                    takerICPAddress: takerICPAddress,     // Taker's ICP address for validation
                    takerEVMAddress: takerEVMAddress,     // Taker's EVM address (optional but good to have)

                    // Legacy fields for backward compatibility (will be deprecated)
                    maker: evmAccount, // EVM address that will receive tokens
                    taker: makerICPAddress, // ICP address that deposited

                    deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
                    timelocks: {
                        withdrawal: 30,        // 30 seconds (for fast testing)
                        publicWithdrawal: 60,  // 60 seconds (for fast testing)
                        cancellation: 43200    // 12 hours
                    }
                };

                const resolverUrl = import.meta.env.VITE_RESOLVER_URL || 'http://localhost:3000';

                console.log('� ICP→EVM Order Validation Debug:');
                console.log('  📋 Complete Order Object:', JSON.stringify(order, null, 2));
                console.log('  🏷️ Field-by-Field Validation:');
                console.log('    orderHash:', order.orderHash, '✓ Format:', /^0x[a-fA-F0-9]{64}$/.test(order.orderHash));
                console.log('    srcChain:', order.srcChain, '✓ Valid:', ['icp', 'ethereum', 'base'].includes(order.srcChain));
                console.log('    dstChain:', order.dstChain, '✓ Valid:', order.dstChain ? ['icp', 'ethereum', 'base'].includes(order.dstChain) : false);
                console.log('    srcAmount:', order.srcAmount, '✓ Format:', /^[0-9]+$/.test(order.srcAmount));
                console.log('    dstAmount:', order.dstAmount, '✓ Format:', /^[0-9]+$/.test(order.dstAmount));
                console.log('    makerEVMAddress:', order.makerEVMAddress, '✓ Format:', /^0x[a-fA-F0-9]{40}$/.test(order.makerEVMAddress));
                console.log('    makerICPAddress:', order.makerICPAddress, '✓ Format:', /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{3}$/.test(order.makerICPAddress));
                console.log('    takerICPAddress:', order.takerICPAddress, '✓ Format:', /^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{3}$/.test(order.takerICPAddress));
                console.log('    takerEVMAddress:', order.takerEVMAddress, '✓ Format:', order.takerEVMAddress ? /^0x[a-fA-F0-9]{40}$/.test(order.takerEVMAddress) : 'optional');
                console.log('    deadline:', order.deadline, '✓ Future:', order.deadline > Math.floor(Date.now() / 1000));
                console.log('    timelocks:', order.timelocks);

                // Frontend validation for ICP→EVM order
                const validateICPOrder = () => {
                    const errors = [];

                    // Check required fields
                    if (!order.orderHash || !/^0x[a-fA-F0-9]{64}$/.test(order.orderHash)) {
                        errors.push('Invalid orderHash format');
                    }
                    if (!order.srcAmount || !/^[0-9]+$/.test(order.srcAmount)) {
                        errors.push('Invalid srcAmount format');
                    }
                    if (!order.dstAmount || !/^[0-9]+$/.test(order.dstAmount)) {
                        errors.push('Invalid dstAmount format');
                    }

                    // ICP→EVM validation
                    if (!order.makerEVMAddress) errors.push('Missing makerEVMAddress for ICP→EVM');
                    if (!order.makerICPAddress) errors.push('Missing makerICPAddress for ICP→EVM');
                    if (!order.takerICPAddress) errors.push('Missing takerICPAddress for ICP→EVM');

                    return errors;
                };

                const validationErrors = validateICPOrder();
                if (validationErrors.length > 0) {
                    console.error('❌ ICP→EVM Order validation failed:', validationErrors);
                    alert(`❌ ICP→EVM Order Validation Failed:\n\n${validationErrors.join('\n')}`);
                    return;
                }

                console.log('✅ ICP→EVM Order validation passed');

                try {
                    const response = await fetch(`${resolverUrl}/orders`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(order)
                    });

                    const resolverResult = await response.json();

                    if (resolverResult.success) {
                        console.log('✅ ICP→EVM order submitted successfully:', resolverResult);
                        alert(`🚀 ICP→EVM Order Submitted! 🚀\n\nOrder Hash: ${orderHash.slice(0, 10)}...\nFlow: ${fromChain.name} → ${toChain?.name}\nAmount: ${fromAmount} ${fromToken?.symbol} → ${toAmount} ${toToken?.symbol}\n\nThe resolver is now processing your cross-chain swap.`);

                        // Start tracking order status
                        trackOrderStatus(orderHash, resolverUrl);
                    } else {
                        console.error('❌ Resolver rejected ICP→EVM order:', resolverResult);
                        alert(`❌ ICP→EVM Order Failed ❌\n\nReason: ${resolverResult.error || 'Unknown error'}`);
                    }
                } catch (error) {
                    console.error('❌ Failed to submit ICP→EVM order:', error);
                    alert(`❌ ICP→EVM Connection Error ❌\n\nFailed to connect to resolver.`);
                }
            }
            // Handle other chain combinations
            else {
                alert('Swap initiated! This is a demo - actual swap functionality would be implemented here.');
            }
        } catch (error) {
            console.error('Swap failed:', error);
            alert('Swap failed. Check console for details.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="modern-card p-8 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/20 to-purple-400/20 rounded-full blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-2xl"></div>

                <div className="text-center mb-8 relative z-10">
                    <h2 className="text-3xl font-bold gradient-text mb-2">Cross-Chain Swap</h2>
                    <p className="text-gray-600">Powered by AvgInch Fusion+</p>

                    {/* Wallet Connection Status */}
                    <div className="mt-4 flex justify-center space-x-4">
                        {evmAccount && (
                            <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span>EVM: {evmAccount.slice(0, 6)}...{evmAccount.slice(-4)}</span>
                            </div>
                        )}
                        {!isEvmConnected && (fromChain?.id === 'ethereum' || fromChain?.id === 'base') && (
                            <button
                                onClick={connectEvm}
                                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 transition-colors"
                            >
                                Connect EVM Wallet
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-center relative z-10">
                    {/* From Section */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center space-x-2 mb-4">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <h3 className="text-lg font-semibold text-gray-800">From</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <ChainSelector
                                selectedChain={fromChain}
                                onChainSelect={setFromChain}
                                label="Chain"
                            />
                            <TokenSelector
                                selectedToken={fromToken}
                                onTokenSelect={setFromToken}
                                selectedChain={fromChain}
                                label="Token"
                            />
                        </div>

                        <div className="relative">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Amount
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={fromAmount}
                                    onChange={(e) => setFromAmount(e.target.value)}
                                    placeholder="0.0"
                                    className="input-field text-xl font-semibold pr-20"
                                    disabled={!fromToken}
                                />
                                {fromToken && (
                                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                                        <span className="text-lg">{fromToken.icon}</span>
                                        <span className="font-medium text-gray-700">{fromToken.symbol}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Swap Direction & Actions */}
                    <div className="lg:col-span-1 flex flex-col items-center justify-center space-y-6 py-4">
                        <button
                            onClick={handleSwapDirection}
                            className="p-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-110 active:scale-95 glow-effect"
                            disabled={isLoading}
                            title="Swap direction"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                        </button>

                        {!quote ? (
                            <button
                                onClick={handleGetQuote}
                                disabled={!fromChain || !toChain || !fromToken || !toToken || !fromAmount || isLoading}
                                className="btn-primary px-8 py-4 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] glow-effect"
                            >
                                {isLoading ? (
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                                        Getting Quote...
                                    </div>
                                ) : (
                                    'Get Quote'
                                )}
                            </button>
                        ) : (
                            <div className="space-y-4 w-full max-w-sm">
                                <div className="glass-panel p-4 bg-gradient-to-r from-blue-50/80 to-purple-50/80 border border-blue-200/50">
                                    <h4 className="font-semibold text-gray-800 mb-3 text-center">Quote Details</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">Exchange Rate:</span>
                                            <span className="font-semibold text-gray-800">1:{(parseFloat(quote.toAmount) / parseFloat(quote.fromAmount)).toFixed(4)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">Bridge Fee:</span>
                                            <span className="font-semibold text-green-600">{quote.bridgeFee}%</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">Est. Gas:</span>
                                            <span className="font-semibold text-blue-600">{quote.estimatedGas} {quote.fromChain.symbol}</span>
                                        </div>
                                        {escrowInfo.sourceAddress && (
                                            <>
                                                <div className="border-t pt-2 mt-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600">Escrow Fee:</span>
                                                        <span className="font-semibold text-orange-600">{escrowInfo.creationFee} ETH</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600">Safety Deposit:</span>
                                                        <span className="font-semibold text-purple-600">{formatEther((parseEther(fromAmount) * BigInt(15) / BigInt(100)).toString())} ETH</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex space-x-3">
                                    <button
                                        onClick={() => setQuote(null)}
                                        className="btn-secondary flex-1 py-3 text-sm font-medium"
                                    >
                                        New Quote
                                    </button>
                                    <button
                                        onClick={handleSwap}
                                        disabled={isLoading}
                                        className="btn-primary flex-1 py-3 text-sm font-semibold glow-effect"
                                    >
                                        {isLoading ? (
                                            <div className="flex items-center justify-center">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                Swapping...
                                            </div>
                                        ) : (
                                            'Execute Swap'
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Enhanced Order Status Display */}
                    {activeOrder && (
                        <div className="lg:col-span-3 mb-6">
                            <div className="glass-panel p-6 bg-gradient-to-r from-green-50/80 to-blue-50/80 border border-green-200/50">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-bold text-gray-800 flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500 mr-3"></div>
                                        Cross-Chain Swap in Progress
                                    </h4>
                                    <div className="text-right">
                                        <div className="text-xs text-gray-500">Order ID</div>
                                        <div className="font-mono text-sm font-semibold text-gray-700">
                                            {activeOrder.orderHash.slice(0, 10)}...{activeOrder.orderHash.slice(-6)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-gray-600">Status:</span>
                                        <span className={`font-semibold px-3 py-1 rounded-full text-xs ${activeOrder.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                activeOrder.status === 'failed' ? 'bg-red-100 text-red-800' :
                                                    activeOrder.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            {activeOrder.status.toUpperCase()}
                                        </span>
                                    </div>

                                    {activeOrder.createdAt && (
                                        <div className="text-xs text-gray-500">
                                            Started: {new Date(activeOrder.createdAt).toLocaleString()}
                                        </div>
                                    )}

                                    {activeOrder.status === 'processing' && (
                                        <div className="text-xs text-gray-500">
                                            ⏱️ Estimated completion: ~30-60 minutes
                                        </div>
                                    )}
                                </div>

                                {activeOrder.steps.length > 0 && (
                                    <div className="space-y-3">
                                        <h5 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1">
                                            Processing Steps
                                        </h5>
                                        <div className="space-y-2">
                                            {activeOrder.steps.map((step, index) => {
                                                const isCompleted = step.status === 'completed';
                                                const isFailed = step.status === 'failed';
                                                const isPending = step.status === 'pending';

                                                return (
                                                    <div key={index} className={`flex items-start space-x-3 p-2 rounded-lg ${isCompleted ? 'bg-green-50' :
                                                            isFailed ? 'bg-red-50' :
                                                                isPending ? 'bg-blue-50' : 'bg-gray-50'
                                                        }`}>
                                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center mt-0.5 ${isCompleted ? 'bg-green-500' :
                                                                isFailed ? 'bg-red-500' :
                                                                    isPending ? 'bg-blue-500 animate-pulse' :
                                                                        'bg-gray-400'
                                                            }`}>
                                                            {isCompleted && (
                                                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                </svg>
                                                            )}
                                                            {isFailed && (
                                                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-sm font-medium text-gray-700 capitalize">
                                                                    {step.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                                </span>
                                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${isCompleted ? 'bg-green-100 text-green-700' :
                                                                        isFailed ? 'bg-red-100 text-red-700' :
                                                                            isPending ? 'bg-blue-100 text-blue-700' :
                                                                                'bg-gray-100 text-gray-700'
                                                                    }`}>
                                                                    {step.status}
                                                                </span>
                                                            </div>
                                                            {step.error && (
                                                                <div className="text-xs text-red-600 mt-1">
                                                                    ❌ {step.error}
                                                                </div>
                                                            )}
                                                            {step.startedAt && (
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    Started: {new Date(step.startedAt).toLocaleTimeString()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Progress bar */}
                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                                                <span>Progress</span>
                                                <span>
                                                    {activeOrder.steps.filter(s => s.status === 'completed').length} / {activeOrder.steps.length} steps
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div
                                                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${(activeOrder.steps.filter(s => s.status === 'completed').length / activeOrder.steps.length) * 100}%`
                                                    }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Tips for user */}
                                {activeOrder.status === 'processing' && (
                                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <div className="text-sm text-blue-800">
                                            <span className="font-semibold">💡 While you wait:</span>
                                            <ul className="mt-1 text-xs space-y-1">
                                                <li>• Keep this tab open to monitor progress</li>
                                                <li>• The resolver is automatically processing your swap</li>
                                                <li>• You'll be notified when the swap completes</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* To Section */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center space-x-2 mb-4">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <h3 className="text-lg font-semibold text-gray-800">To</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <ChainSelector
                                selectedChain={toChain}
                                onChainSelect={setToChain}
                                label="Chain"
                            />
                            <TokenSelector
                                selectedToken={toToken}
                                onTokenSelect={setToToken}
                                selectedChain={toChain}
                                label="Token"
                            />
                        </div>

                        <div className="relative">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                You'll receive
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={toAmount}
                                    placeholder="0.0"
                                    className="input-field text-xl font-semibold pr-20 bg-gradient-to-r from-green-50/50 to-blue-50/50"
                                    disabled
                                />
                                {toToken && (
                                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                                        <span className="text-lg">{toToken.icon}</span>
                                        <span className="font-medium text-gray-700">{toToken.symbol}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Developer/Testing Panel */}
                <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">🔧 Developer Tools</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <button
                            onClick={checkResolverHealth}
                            className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                            Check Resolver Health
                        </button>
                        <div className="text-xs text-gray-600">
                            <strong>Resolver URL:</strong><br />
                            {import.meta.env.VITE_RESOLVER_URL || 'http://localhost:3000'}
                        </div>
                        <div className="text-xs text-gray-600">
                            <strong>EVM Connected:</strong><br />
                            {isEvmConnected ? `✅ ${evmAccount?.slice(0, 10)}...` : '❌ Not connected'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
