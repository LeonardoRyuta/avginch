export interface Chain {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  rpcUrl: string;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  chainId: string;
}

export interface SwapQuote {
  fromAmount: string;
  toAmount: string;
  fromToken: Token;
  toToken: Token;
  fromChain: Chain;
  toChain: Chain;
  estimatedGas: string;
  bridgeFee: string;
  route: string[];
}
