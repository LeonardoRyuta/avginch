import { ethers } from 'ethers';
import { useState, useEffect } from 'react';

// Extend window to include ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

// Contract ABIs (Updated from actual deployed contracts)
const ICPEscrowFactoryABI = [
  "function addressOfEscrowSrc(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function addressOfEscrowDst(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external view returns (address)",
  "function createSrcEscrow(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external payable",
  "function createDstEscrow(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external payable",
  "function creationFee() external view returns (uint256)",
  "function ACCESS_TOKEN() external view returns (address)"
];

const ERC20ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)"
];

const EscrowABI = [
  "function withdraw(bytes32 secret, tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
  "function cancel(tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks) immutables) external",
  "function getImmutables() external view returns (tuple(bytes32 orderHash, bytes32 hashlock, uint256 maker, uint256 taker, uint256 token, uint256 amount, uint256 safetyDeposit, uint256 timelocks))"
];

// Chain configurations
const CHAIN_CONFIGS = {
  'base-sepolia': {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.basescan.org',
    factoryAddress: '0xAb88c8D4C86756c960ECd37b4EF41f4cBa5374DB', // Placeholder - update with deployed address
    accessTokenAddress: '0x94cf9723C912DcE70C845263804bBa1b3Cd148E1' // Placeholder - update with deployed address
  },
  'ethereum': {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorer: 'https://etherscan.io',
    factoryAddress: '0xAb88c8D4C86756c960ECd37b4EF41f4cBa5374DB', // Placeholder - update when deployed
    accessTokenAddress: '0x94cf9723C912DcE70C845263804bBa1b3Cd148E1' // Placeholder - update when deployed
  }
} as const;

type ChainConfig = typeof CHAIN_CONFIGS[keyof typeof CHAIN_CONFIGS];

export interface OrderImmutables {
  orderHash: string;
  hashlock: string;
  maker: string; // Will be converted to uint256
  taker: string; // Will be converted to uint256  
  token: string; // Will be converted to uint256
  amount: string;
  safetyDeposit: string;
  timelocks: number | string | { // Can be packed uint256, or object to be packed
    withdrawal: number;
    publicWithdrawal: number;
    cancellation: number;
    deployedAt: number;
  };
}

export class EVMContractHelper {
  private provider: ethers.BrowserProvider | ethers.JsonRpcProvider;
  private signer: ethers.JsonRpcSigner | null = null;
  private factoryContract: ethers.Contract | null = null;
  private chainConfig: ChainConfig;

  constructor(chain: keyof typeof CHAIN_CONFIGS = 'base-sepolia') {
    this.chainConfig = CHAIN_CONFIGS[chain];
    
    if (typeof window !== 'undefined' && window.ethereum) {
      this.provider = new ethers.BrowserProvider(window.ethereum);
    } else {
      // Fallback to read-only provider
      this.provider = new ethers.JsonRpcProvider(this.chainConfig.rpcUrl);
    }
  }

  // Helper: Convert EVM address to uint256 for EVM contracts (AddressLib format)
  private evmAddressToUint256(evmAddress: string): string {
    // Validate it's a proper EVM address
    if (!ethers.isAddress(evmAddress)) {
      throw new Error(`Invalid EVM address: ${evmAddress}`);
    }
    // Convert to uint160 then to uint256 (this matches AddressLib.wrap)
    return ethers.getBigInt(evmAddress).toString();
  }

  // Helper: Pack timelocks into uint256
  private packTimelocks(timelocks: { withdrawal: number; publicWithdrawal: number; cancellation: number; deployedAt: number }): string {
    // Pack four uint32 values into one uint256
    // This is a simplified packing - adjust based on your contract's expectations
    const packed = (BigInt(timelocks.withdrawal) << BigInt(96)) |
                  (BigInt(timelocks.publicWithdrawal) << BigInt(64)) |
                  (BigInt(timelocks.cancellation) << BigInt(32)) |
                  BigInt(timelocks.deployedAt);
    return packed.toString();
  }

  // Prepare EVM-compatible order immutables with EVM addresses
  prepareEVMOrderImmutables(orderData: {
    orderHash: string;
    hashlock: string;
    makerEVMAddress: string;
    takerEVMAddress: string;
    tokenEVMAddress: string;
    amount: string;
    safetyDeposit: string;
    timelocks: { withdrawal: number; publicWithdrawal: number; cancellation: number; deployedAt: number };
  }): OrderImmutables {
    return {
      orderHash: orderData.orderHash,
      hashlock: orderData.hashlock,
      maker: this.evmAddressToUint256(orderData.makerEVMAddress),
      taker: this.evmAddressToUint256(orderData.takerEVMAddress),
      token: this.evmAddressToUint256(orderData.tokenEVMAddress),
      amount: orderData.amount,
      safetyDeposit: orderData.safetyDeposit,
      timelocks: this.packTimelocks(orderData.timelocks)
    };
  }

  // Initialize connection and get signer
  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error('MetaMask not found');
    }

    // Ensure we have a BrowserProvider for connection
    if (!(this.provider instanceof ethers.BrowserProvider)) {
      this.provider = new ethers.BrowserProvider(window.ethereum);
    }

    // Request account access
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    // Check if we're on the correct network
    const network = await this.provider.getNetwork();
    if (network.chainId !== BigInt(this.chainConfig.chainId)) {
      await this.switchChain();
    }

    this.signer = await this.provider.getSigner();
    this.factoryContract = new ethers.Contract(
      this.chainConfig.factoryAddress,
      ICPEscrowFactoryABI,
      this.signer
    );

    const address = await this.signer.getAddress();
    return address;
  }

  // Switch to the correct chain
  async switchChain(): Promise<void> {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${this.chainConfig.chainId.toString(16)}` }],
      });
    } catch (error: unknown) {
      // If chain doesn't exist, add it
      if (error && typeof error === 'object' && 'code' in error && error.code === 4902) {
        await window.ethereum!.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: `0x${this.chainConfig.chainId.toString(16)}`,
            chainName: this.chainConfig.name,
            rpcUrls: [this.chainConfig.rpcUrl],
            blockExplorerUrls: [this.chainConfig.blockExplorer]
          }]
        });
      }
    }
  }

  // Get the pre-computed escrow source address
  async getEscrowSourceAddress(immutables: OrderImmutables): Promise<string> {
    if (!this.factoryContract) {
      // For read-only operations, create contract with current provider
      const contract = new ethers.Contract(
        this.chainConfig.factoryAddress,
        ICPEscrowFactoryABI,
        this.provider
      );
      const address = await contract.addressOfEscrowSrc(immutables);
      return address;
    }
    
    const address = await this.factoryContract.addressOfEscrowSrc(immutables);
    return address;
  }

  // Get the pre-computed escrow destination address
  async getEscrowDestinationAddress(immutables: OrderImmutables): Promise<string> {
    if (!this.factoryContract) {
      // For read-only operations, create contract with current provider
      const contract = new ethers.Contract(
        this.chainConfig.factoryAddress,
        ICPEscrowFactoryABI,
        this.provider
      );
      const address = await contract.addressOfEscrowDst(immutables);
      return address;
    }
    
    const address = await this.factoryContract.addressOfEscrowDst(immutables);
    return address;
  }

  // Get creation fee
  async getCreationFee(): Promise<string> {
    if (!this.factoryContract) {
      // For read-only operations, create contract with current provider
      const contract = new ethers.Contract(
        this.chainConfig.factoryAddress,
        ICPEscrowFactoryABI,
        this.provider
      );
      const fee = await contract.creationFee();
      return fee.toString();
    }
    
    const fee = await this.factoryContract.creationFee();
    return fee.toString();
  }

  // Deposit ETH to escrow (user sends ETH directly to escrow address)
  async depositETHToEscrow(escrowAddress: string, amount: string): Promise<string> {
    if (!this.signer) await this.connect();

    const tx = await this.signer!.sendTransaction({
      to: escrowAddress,
      value: ethers.parseEther(amount),
      gasLimit: 21000
    });

    await tx.wait();
    return tx.hash;
  }

  // Deposit ERC20 to escrow (transfer tokens to escrow address)
  async depositERC20ToEscrow(
    tokenAddress: string, 
    escrowAddress: string, 
    amount: string
  ): Promise<string> {
    if (!this.signer) await this.connect();

    const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.signer);
    
    const tx = await tokenContract.transfer(escrowAddress, amount);
    await tx.wait();
    return tx.hash;
  }

  // Approve ERC20 for escrow factory (if using factory to create escrows)
  async approveERC20ForFactory(tokenAddress: string, amount: string): Promise<string> {
    if (!this.signer) await this.connect();

    const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.signer);
    
    const tx = await tokenContract.approve(this.chainConfig.factoryAddress, amount);
    await tx.wait();
    return tx.hash;
  }

  // Check ERC20 allowance
  async checkERC20Allowance(tokenAddress: string, owner: string, spender: string): Promise<string> {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.provider);
    const allowance = await tokenContract.allowance(owner, spender);
    return allowance.toString();
  }

  // Get ERC20 balance
  async getERC20Balance(tokenAddress: string, address: string): Promise<string> {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.provider);
    const balance = await tokenContract.balanceOf(address);
    return balance.toString();
  }

  // Get ETH balance
  async getETHBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return balance.toString();
  }

  // Get token info
  async getTokenInfo(tokenAddress: string): Promise<{
    name: string;
    symbol: string;
    decimals: number;
  }> {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.provider);
    
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals()
    ]);

    return { name, symbol, decimals };
  }

  // Withdraw from escrow (when user has the secret)
  async withdrawFromEscrow(
    escrowAddress: string,
    secret: string,
    immutables: OrderImmutables
  ): Promise<string> {
    if (!this.signer) await this.connect();

    const escrowContract = new ethers.Contract(escrowAddress, EscrowABI, this.signer);
    
    const tx = await escrowContract.withdraw(secret, immutables);
    await tx.wait();
    return tx.hash;
  }

  // Cancel escrow
  async cancelEscrow(
    escrowAddress: string,
    immutables: OrderImmutables
  ): Promise<string> {
    if (!this.signer) await this.connect();

    const escrowContract = new ethers.Contract(escrowAddress, EscrowABI, this.signer);
    
    const tx = await escrowContract.cancel(immutables);
    await tx.wait();
    return tx.hash;
  }

  // Helper: Format address for display
  formatAddress(address: string, chars: number = 4): string {
    if (!address) return '';
    return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
  }

  // Helper: Format token amount with decimals
  formatTokenAmount(amount: string, decimals: number = 18): string {
    return ethers.formatUnits(amount, decimals);
  }

  // Helper: Parse token amount to wei
  parseTokenAmount(amount: string, decimals: number = 18): string {
    return ethers.parseUnits(amount, decimals).toString();
  }

  // Get current chain info
  async getChainInfo(): Promise<{ chainId: number; name: string }> {
    const network = await this.provider.getNetwork();
    return {
      chainId: Number(network.chainId),
      name: network.name
    };
  }
}

// React hook for easier usage
export function useEVMContract(chain?: keyof typeof CHAIN_CONFIGS) {
  const [helper, setHelper] = useState<EVMContractHelper | null>(null);
  const [account, setAccount] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const contractHelper = new EVMContractHelper(chain);
    setHelper(contractHelper);
  }, [chain]);

  const connect = async () => {
    if (!helper) return;
    
    try {
      const address = await helper.connect();
      setAccount(address);
      setIsConnected(true);
      return address;
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  };

  const disconnect = () => {
    setAccount('');
    setIsConnected(false);
  };

  return {
    helper,
    account,
    isConnected,
    connect,
    disconnect
  };
}

export default EVMContractHelper;
