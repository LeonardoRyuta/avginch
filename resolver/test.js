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

        // Test order submission
        console.log('3. Testing order submission...');
        const orderData = {
            orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            srcChain: "icp",
            dstChain: "ethereum",
            srcToken: "0x0000000000000000000000000000000000000000",
            dstToken: "0xA0b86a33E6417d01C97FEf10e4B19e0ab36f22e8",
            srcAmount: "1000000000", // 10 ICP in e8s
            dstAmount: "1000000000000000000", // 1 ETH in wei
            maker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae",
            taker: "0x742d35Cc6E5A69e6d89B134b1234567890123456",
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
        srcToken: "0xA0b86a33E6417d01C97FEf10e4B19e0ab36f22e8",
        dstToken: "0x0000000000000000000000000000000000000000",
        srcAmount: "1000000000000000000", // 1 ETH in wei
        dstAmount: "1000000000", // 10 ICP in e8s
        maker: "0x742d35Cc6E5A69e6d89B134b1234567890123456",
        taker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae",
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
    } catch (error) {
        console.error('EVM to ICP order test failed:', error);
    }
}

// Run tests
console.log('Make sure the resolver is running on port 3000 before running this test.\n');
console.log('To start the resolver: cd resolver && npm start\n');

testResolver().then(() => {
    testEVMToICPOrder();
});
