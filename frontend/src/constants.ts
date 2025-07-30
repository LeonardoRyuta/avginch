import type { Chain, Token } from './types';

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    icon: '🔷',
    rpcUrl: 'https://mainnet.infura.io/v3/',
  },
  {
    id: 'icp',
    name: 'Internet Computer',
    symbol: 'ICP',
    icon: '∞',
    rpcUrl: 'https://ic0.app',
  },
  {
    id: 'tron',
    name: 'Tron',
    symbol: 'TRX',
    icon: '🔴',
    rpcUrl: 'https://api.trongrid.io',
  },
  {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    icon: '🟣',
    rpcUrl: 'https://polygon-rpc.com',
  },
  {
    id: 'bsc',
    name: 'BSC',
    symbol: 'BNB',
    icon: '🟡',
    rpcUrl: 'https://bsc-dataseed.binance.org',
  },
];

export const TOKENS_BY_CHAIN: Record<string, Token[]> = {
  ethereum: [
    {
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      icon: '🔷',
      chainId: 'ethereum',
    },
    {
      address: '0xA0b86a33E6441d15e5c60f55d9f9e7e00a9Db5Dd',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: '💵',
      chainId: 'ethereum',
    },
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: '💲',
      chainId: 'ethereum',
    },
  ],
  icp: [
    {
      address: 'rrkah-fqaaa-aaaaa-aaaaq-cai',
      symbol: 'ICP',
      name: 'Internet Computer',
      decimals: 8,
      icon: '∞',
      chainId: 'icp',
    },
    {
      address: 'mxzaz-hqaaa-aaaar-qaada-cai',
      symbol: 'ckBTC',
      name: 'Chain-key Bitcoin',
      decimals: 8,
      icon: '₿',
      chainId: 'icp',
    },
    {
      address: 'xkbca-2qaaa-aaaar-qah4a-cai',
      symbol: 'ckETH',
      name: 'Chain-key Ethereum',
      decimals: 18,
      icon: '🔷',
      chainId: 'icp',
    },
  ],
  tron: [
    {
      address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
      symbol: 'TRX',
      name: 'Tron',
      decimals: 6,
      icon: '🔴',
      chainId: 'tron',
    },
    {
      address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      icon: '💲',
      chainId: 'tron',
    },
  ],
  polygon: [
    {
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'MATIC',
      name: 'Polygon',
      decimals: 18,
      icon: '🟣',
      chainId: 'polygon',
    },
    {
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      icon: '💵',
      chainId: 'polygon',
    },
  ],
  bsc: [
    {
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'BNB',
      name: 'Binance Coin',
      decimals: 18,
      icon: '🟡',
      chainId: 'bsc',
    },
    {
      address: '0x55d398326f99059fF775485246999027B3197955',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 18,
      icon: '💲',
      chainId: 'bsc',
    },
  ],
};
