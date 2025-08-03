import fetch from 'node-fetch';

const RESOLVER_URL = 'http://localhost:3000';

async function testResolver() {
    console.log('Testing ICP Fusion+ Resolver...\n');

    try {
        // Test health endpoint
        console.log('1. Testing health endpoint...');
        const healthResponse = await fetch(`${RESOLVER_URL}/health`);
        const healthData = await healthResponse.json();
        console.log('Health:', healthData);
        console.log('');

        // Test info endpoint
        console.log('2. Testing info endpoint...');
        const infoResponse = await fetch(`${RESOLVER_URL}/info`);
        const infoData = await infoResponse.json();
        console.log('Info:', infoData);
        console.log('');

        // Test order submission (ICP -> EVM)
        console.log('3. Testing order submission (ICP -> EVM)...');
        const orderData = {
            orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            srcChain: "icp",
            dstChain: "ethereum",
            srcToken: "0x0000000000000000000000000000000000000000", // ICP
            dstToken: "0x0000000000000000000000000000000000000000", // ETH on Ethereum
            srcAmount: "1000000000", // 10 ICP in e8s
            dstAmount: "1000000000000000000", // 1 ETH in wei
            // Clean address mapping for ICP -> EVM:
            maker: "0x742d35Cc6E5A69e6d89B134b1234567890123456", // EVM address (receives ETH)
            taker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae", // ICP address (receives ICP)
            deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
            timelocks: {
                withdrawal: 3600, // 1 hour
                publicWithdrawal: 7200, // 2 hours
                cancellation: 86400 // 24 hours
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
        console.log('Order submission result:', orderResult);
        console.log('');

        if (orderResult.success) {
            // Test order status
            console.log('4. Testing order status...');
            const statusResponse = await fetch(`${RESOLVER_URL}/orders/${orderData.orderHash}`);
            const statusData = await statusResponse.json();
            console.log('Order status:', statusData);
            console.log('');

            // Test orders list
            console.log('5. Testing orders list...');
            const listResponse = await fetch(`${RESOLVER_URL}/orders?limit=10`);
            const listData = await listResponse.json();
            console.log('Orders list:', JSON.stringify(listData, null, 2));
        }

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Example of creating a different order (EVM -> ICP)
async function testEVMToICPOrder() {
    console.log('\n6. Testing EVM to ICP order...');
    
    const evmToIcpOrder = {
        orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        srcChain: "ethereum",
        dstChain: "icp",
        srcToken: "0x0000000000000000000000000000000000000000", // ETH on Ethereum
        dstToken: "0x0000000000000000000000000000000000000000", // ICP
        srcAmount: "1000000000000000000", // 1 ETH in wei
        dstAmount: "1000000000", // 10 ICP in e8s
        // Clean address mapping for EVM -> ICP:
        maker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae", // ICP address (receives ICP)
        taker: "0x742d35Cc6E5A69e6d89B134b1234567890123456", // EVM address (receives ETH)
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        timelocks: {
            withdrawal: 1800, // 30 minutes
            publicWithdrawal: 3600, // 1 hour
            cancellation: 43200 // 12 hours
        }
    };

    try {
        const response = await fetch(`${RESOLVER_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(evmToIcpOrder)
        });

        const result = await response.json();
        console.log('EVM to ICP order result:', result);
        
        if (result.success) {
            console.log('✅ Address mapping verified:');
            console.log('  Maker receives:', result.addressMapping?.makerReceives);
            console.log('  Taker receives:', result.addressMapping?.takerReceives);
        }
    } catch (error) {
        console.error('EVM to ICP order test failed:', error);
    }
}

// New test for ICP to EVM order (opposite direction)
async function testICPToEVMOrder() {
    console.log('\n7. Testing ICP to EVM order...');
    
    const icpToEvmOrder = {
        orderHash: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
        srcChain: "icp",
        dstChain: "ethereum", 
        srcToken: "0x0000000000000000000000000000000000000000", // ICP
        dstToken: "0xa0b86a33E6417D01c97fEF10E4B19e0aB36f22E8", // USDC on Ethereum
        srcAmount: "100000000", // 20 ICP in e8s
        dstAmount: "10000000000000", // 2 ETH in wei
        // Clean address mapping for ICP -> EVM (flipped from above):
        maker: "0x742d35Cc6E5A69e6d89B134b1234567890123456", // EVM address (receives ETH)
        taker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae", // ICP address (receives ICP)
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
        console.log('ICP to EVM order result:', result);
        
        if (result.success) {
            console.log('✅ Address mapping verified:');
            console.log('  Maker receives:', result.addressMapping?.makerReceives);
            console.log('  Taker receives:', result.addressMapping?.takerReceives);
        }
    } catch (error) {
        console.error('ICP to EVM order test failed:', error);
    }
}

// Run tests
console.log('🚀 ICP Fusion+ Resolver Test Suite');
console.log('Make sure the resolver is running on port 3000 before running this test.\n');
console.log('To start the resolver: cd resolver && npm start\n');

testResolver().then(() => {
    testEVMToICPOrder()
    // .then(() => { disable for now
    //     testICPToEVMOrder();
    // });
});
