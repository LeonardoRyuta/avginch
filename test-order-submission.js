// Test script for order submission and tracking
const fetch = require('node-fetch');

const RESOLVER_URL = 'http://localhost:3000';

async function testOrderSubmissionAndTracking() {
    console.log('Testing Order Submission and Tracking System...\n');

    try {
        // Test 1: Health check
        console.log('1. Testing resolver health...');
        const healthResponse = await fetch(`${RESOLVER_URL}/health`);
        const healthData = await healthResponse.json();
        console.log('✅ Health:', healthData);
        console.log('');

        // Test 2: Submit an order with the new dual addressing format (EVM -> ICP)
        console.log('2. Testing order submission (EVM -> ICP with dual addressing)...');
        const orderData = {
            orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            srcChain: "base",
            dstChain: "icp",
            srcToken: "0x0000000000000000000000000000000000000000", // ETH
            dstToken: "0x0000000000000000000000000000000000000000", // ICP
            srcAmount: "100000000000000000", // 0.1 ETH in wei
            dstAmount: "1000000000", // 10 ICP in e8s
            
            // New dual addressing format
            makerEVMAddress: "0x742d35cc6e5a69e6d89b134b1234567890123456", // Maker's EVM address
            makerICPAddress: "rdmx6-jaaaa-aaaaa-aaadq-cai", // Maker's ICP address  
            takerEVMAddress: "0x456d35cc6e5a69e6d89b134b1234567890123456", // Taker's EVM address
            takerICPAddress: "rrkah-fqaaa-aaaaa-aaaaq-cai", // Taker's ICP address
            
            deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
            timelocks: {
                withdrawal: 1800, // 30 minutes
                publicWithdrawal: 3600, // 1 hour
                cancellation: 43200 // 12 hours
            }
        };

        const orderResponse = await fetch(`${RESOLVER_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const orderResult = await orderResponse.json();
        console.log('Order submission result:', JSON.stringify(orderResult, null, 2));
        console.log('');

        if (orderResult.success) {
            console.log('✅ Order submitted successfully!');
            console.log(`Order Hash: ${orderData.orderHash}`);
            console.log(`Hashlock: ${orderResult.hashlockHex}`);
            console.log('');

            // Test 3: Track order status
            console.log('3. Testing order status tracking...');
            
            // Poll order status several times to simulate frontend tracking
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                
                const statusResponse = await fetch(`${RESOLVER_URL}/orders/${orderData.orderHash}`);
                const statusData = await statusResponse.json();
                
                if (statusData.success) {
                    const order = statusData.order;
                    console.log(`📊 Poll ${i + 1} - Status: ${order.status}`);
                    
                    if (order.steps && order.steps.length > 0) {
                        console.log('   Steps:');
                        order.steps.forEach(step => {
                            console.log(`   - ${step.name}: ${step.status}`);
                        });
                    }
                    
                    // Stop polling if order is completed or failed
                    if (order.status === 'completed' || order.status === 'failed') {
                        console.log(`🎯 Order finished with status: ${order.status}`);
                        break;
                    }
                } else {
                    console.log('❌ Failed to get order status');
                }
                console.log('');
            }

            // Test 4: Get all orders
            console.log('4. Testing orders list...');
            const listResponse = await fetch(`${RESOLVER_URL}/orders?limit=5`);
            const listData = await listResponse.json();
            console.log('Orders list:', JSON.stringify(listData, null, 2));
        } else {
            console.log('❌ Order submission failed:', orderResult.error);
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Test different order types
async function testICPToEVMOrder() {
    console.log('\n5. Testing ICP to EVM order...');
    
    const icpToEvmOrder = {
        orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        srcChain: "icp",
        dstChain: "base",
        srcToken: "0x0000000000000000000000000000000000000000", // ICP
        dstToken: "0x0000000000000000000000000000000000000000", // ETH
        srcAmount: "2000000000", // 20 ICP in e8s
        dstAmount: "50000000000000000", // 0.05 ETH in wei
        
        // Dual addressing for ICP -> EVM
        makerEVMAddress: "0x853F2A1C45c6543B8DA94B891234567890123456",
        makerICPAddress: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae",
        takerEVMAddress: "0x742d35Cc6E5A69e6d89B134b1234567890123456",
        takerICPAddress: "rdmx6-jaaaa-aaaaa-aaadq-cai",
        
        deadline: Math.floor(Date.now() / 1000) + 3600,
        timelocks: {
            withdrawal: 1800,
            publicWithdrawal: 3600,
            cancellation: 43200
        }
    };

    try {
        const response = await fetch(`${RESOLVER_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(icpToEvmOrder)
        });

        const result = await response.json();
        console.log('ICP to EVM order result:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('✅ ICP to EVM order submitted successfully!');
        } else {
            console.log('❌ ICP to EVM order failed:', result.error);
        }
    } catch (error) {
        console.error('ICP to EVM order test failed:', error);
    }
}

// Run the tests
async function runAllTests() {
    await testOrderSubmissionAndTracking();
    await testICPToEVMOrder();
    
    console.log('\n🎉 All tests completed!');
    console.log('Check the resolver logs to see order processing details.');
}

// Check if running directly
if (require.main === module) {
    runAllTests();
}

module.exports = { testOrderSubmissionAndTracking, testICPToEVMOrder };
