#!/usr/bin/env node

// Script to help update resolver .env after deployment
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Post-deployment configuration helper');
console.log('');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Usage: node post-deploy-config.js <factory_address> <access_token_address>');
    console.log('');
    console.log('Example:');
    console.log('node post-deploy-config.js 0x1234...abcd 0x5678...efgh');
    process.exit(1);
}

const factoryAddress = args[0];
const accessTokenAddress = args[1];

// Validate addresses
if (!factoryAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.error('❌ Invalid factory address format');
    process.exit(1);
}

if (!accessTokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.error('❌ Invalid access token address format');
    process.exit(1);
}

// Update resolver .env file
const resolverEnvPath = path.join(__dirname, '..', 'resolver', '.env');

try {
    let envContent = fs.readFileSync(resolverEnvPath, 'utf8');
    
    // Update the addresses
    envContent = envContent.replace(
        /EVM_ICP_ESCROW_FACTORY_ADDRESS=.*/,
        `EVM_ICP_ESCROW_FACTORY_ADDRESS=${factoryAddress}`
    );
    
    envContent = envContent.replace(
        /EVM_ACCESS_TOKEN_ADDRESS=.*/,
        `EVM_ACCESS_TOKEN_ADDRESS=${accessTokenAddress}`
    );
    
    fs.writeFileSync(resolverEnvPath, envContent);
    
    console.log('✅ Updated resolver/.env with deployed contract addresses:');
    console.log(`   Factory: ${factoryAddress}`);
    console.log(`   Access Token: ${accessTokenAddress}`);
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Make sure your EVM_PRIVATE_KEY is set in resolver/.env');
    console.log('2. Start the resolver: cd resolver && npm start');
    console.log('3. Test with: curl http://localhost:3000/health');
    
} catch (error) {
    console.error('❌ Error updating resolver .env:', error.message);
    process.exit(1);
}
