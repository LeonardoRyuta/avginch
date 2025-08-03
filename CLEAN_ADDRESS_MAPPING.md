# Clean Address Mapping Strategy

## Overview

We've implemented a clean, intuitive address mapping strategy where:
- **Maker address** = Address on **destination chain** (where maker receives tokens)
- **Taker address** = Address on **source chain** (where taker receives tokens)

This eliminates the need for extra address fields while maintaining security and clarity.

## Address Mapping Rules

### For EVM → ICP Swaps:
```javascript
{
    srcChain: "ethereum",
    dstChain: "icp", 
    maker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae", // ICP address
    taker: "0x742d35Cc6E5A69e6d89B134b1234567890123456" // EVM address
}
```

**Logic:**
- Maker wants ICP → Maker has ICP address
- Taker wants EVM tokens → Taker has EVM address

### For ICP → EVM Swaps:
```javascript
{
    srcChain: "icp",
    dstChain: "ethereum",
    maker: "0x742d35Cc6E5A69e6d89B134b1234567890123456", // EVM address  
    taker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae" // ICP address
}
```

**Logic:**
- Maker wants EVM tokens → Maker has EVM address
- Taker wants ICP → Taker has ICP address

## Benefits

### ✅ **Intuitive Design**
- Address type naturally corresponds to the chain where user receives funds
- No confusion about which address goes where

### ✅ **No Extra Fields**
- Uses existing `maker`/`taker` fields
- Cleaner API with fewer parameters

### ✅ **Built-in Security** 
- Only the actual recipient can withdraw (they control the receiving address)
- No need for separate authentication mechanisms

### ✅ **Symmetric Logic**
- Same pattern works for both swap directions
- Easy to understand and implement

## Validation

The resolver automatically validates:

1. **Address Format**: Ensures EVM addresses are valid hex and ICP addresses follow principal format
2. **Chain Consistency**: Verifies maker address matches destination chain type
3. **Flow Logic**: Confirms the address mapping makes sense for the swap direction

## Example Test Cases

### Test 1: EVM → ICP
```javascript
const evmToIcpOrder = {
    srcChain: "ethereum",
    dstChain: "icp",
    srcToken: "0xA0b86a33E6417d01C97FEf10e4B19e0ab36f22e8", // USDC
    dstToken: "0x0000000000000000000000000000000000000000", // ICP
    srcAmount: "1000000000000000000", // 1 ETH worth of USDC
    dstAmount: "1000000000", // 10 ICP in e8s
    maker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae", // ICP principal
    taker: "0x742d35Cc6E5A69e6d89B134b1234567890123456" // EVM address
};
```

### Test 2: ICP → EVM  
```javascript
const icpToEvmOrder = {
    srcChain: "icp",
    dstChain: "ethereum", 
    srcToken: "0x0000000000000000000000000000000000000000", // ICP
    dstToken: "0xA0b86a33E6417d01C97FEf10e4B19e0ab36f22e8", // USDC
    srcAmount: "2000000000", // 20 ICP in e8s
    dstAmount: "2000000000000000000", // 2 ETH worth of USDC
    maker: "0x742d35Cc6E5A69e6d89B134b1234567890123456", // EVM address
    taker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae" // ICP principal
};
```

## Implementation Details

### Order Processing
1. **Address Type Detection**: `getAddressTypes()` determines which chain each address belongs to
2. **Validation**: Ensures address formats match expected chain types  
3. **Mapping Storage**: Stores clean mappings like `makerICPAddress`, `takerEVMAddress`
4. **Contract Interaction**: Uses appropriate addresses for each chain's contracts

### Contract Integration
- **EVM Contracts**: Use EVM addresses for authentication, store ICP addresses as strings
- **ICP Contracts**: Use ICP principals for authentication, store EVM addresses as strings

This approach makes the entire system more intuitive while maintaining all security properties and atomic swap guarantees.
