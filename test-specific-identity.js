// Test script to create identity for specific principal
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { Principal } from '@dfinity/principal';

// To create an identity for a specific principal, you need either:
// 1. The original private key used to generate that principal
// 2. A pre-generated identity seed that produces that principal

const targetPrincipal = 'f5hu5-c5eqs-4m2bm-fxb27-5mnk2-lpbva-l3tb5-7xv5p-w65wt-a3uyd-lqe';

console.log('🎯 Target Principal:', targetPrincipal);

// Method 1: If you have the exact private key bytes (32 bytes)
// Replace this with the actual private key if you have it
const examplePrivateKey = new Uint8Array([
    // This is just an example - replace with actual key
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
]);

try {
    const identityFromKey = Ed25519KeyIdentity.fromSecretKey(examplePrivateKey);
    console.log('🔑 Identity from private key:', identityFromKey.getPrincipal().toText());
} catch (error) {
    console.log('⚠️ Private key method failed (expected):', error.message);
}

// Method 2: Try different seed variations to find the right one
// This is a brute force approach - not recommended for production
console.log('\n🔍 Trying different seed patterns...');

const trySeeds = [
    // Seed based on the principal itself
    targetPrincipal,
    targetPrincipal + '_key',
    targetPrincipal + '_seed',
    'taker_' + targetPrincipal,
    'user_' + targetPrincipal,
    
    // Common patterns
    'dfinity_' + targetPrincipal,
    'icp_' + targetPrincipal,
    targetPrincipal + '_identity',
];

for (const seedString of trySeeds) {
    try {
        const seed = new TextEncoder().encode(seedString);
        const seedArray = new Uint8Array(32);
        seedArray.set(seed.slice(0, 32));
        
        const identity = Ed25519KeyIdentity.generate(seedArray);
        const principal = identity.getPrincipal().toText();
        
        console.log(`  Seed "${seedString}" → ${principal}`);
        
        if (principal === targetPrincipal) {
            console.log('🎉 FOUND MATCHING SEED!');
            console.log('Seed string:', seedString);
            console.log('Principal:', principal);
            break;
        }
    } catch (error) {
        console.log(`  ❌ Seed "${seedString}" failed:`, error.message);
    }
}

console.log('\n💡 Next steps:');
console.log('1. If you have the actual private key, use Ed25519KeyIdentity.fromSecretKey()');
console.log('2. If this is a test principal, you can create a new one with Ed25519KeyIdentity.generate()');
console.log('3. For production, users should provide their own identity files or use Internet Identity');
