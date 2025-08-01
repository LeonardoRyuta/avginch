import { useState } from 'react';
import type { Chain, Token, SwapQuote } from '../types';
import ChainSelector from './ChainSelector';
import TokenSelector from './TokenSelector';
import useAuthClient from '../hooks/useAuthClient';
import { AccountIdentifier } from '@dfinity/ledger-icp';
import { Principal } from '@dfinity/principal';

export default function SwapInterface() {
    const [fromChain, setFromChain] = useState<Chain | null>(null);
    const [toChain, setToChain] = useState<Chain | null>(null);
    const [fromToken, setFromToken] = useState<Token | null>(null);
    const [toToken, setToToken] = useState<Token | null>(null);
    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [quote, setQuote] = useState<SwapQuote | null>(null);
    const { webapp, address, ledgerCanister } = useAuthClient();

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

        // Simulate API call - replace with actual Fusion+ integration
        setTimeout(() => {
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

            setIsLoading(false);
        }, 2000);
    };

    const testWithdraw = async () => {
        const secret = [33,196,61,119,15,62,195,118,228,181,55,195,108,152,105,50,244,251,14,131,173,80,181,101,232,7,79,112,52,27,111,7]

        const hashlock = [253, 127, 201, 127, 180, 15, 64, 246, 188, 16, 43, 118, 249, 252, 107, 120, 162, 193, 72, 123, 17, 190, 186, 158, 105, 232, 145, 51, 52, 104, 201, 102]

        await webapp?.withdraw_src(secret, hashlock).then((e) => {
            console.log('Withdraw successful:', e);
            alert('Withdraw successful!');
        }).catch((error) => {
            console.error('Withdraw failed:', error);
            alert('Withdraw failed. Check console for details.');
        });
    }

    const depositToCanister = async () => {
        await ledgerCanister?.transfer({
            to: AccountIdentifier.fromPrincipal({principal: Principal.fromText("uzt4z-lp777-77774-qaabq-cai")}),
            amount: BigInt(100000000),
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

        const args = {
            maker: "qj7jl-zymjt-izpkm-72urh-zb3od-y27gj-wascg-bepck-mearo-bnj2o-rae",
            taker: address,
            token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            amount: 10000000,
            safety_deposit: 150000,
            hashlock: [253, 127, 201, 127, 180, 15, 64, 246, 188, 16, 43, 118, 249, 252, 107, 120, 162, 193, 72, 123, 17, 190, 186, 158, 105, 232, 145, 51, 52, 104, 201, 102],
            order_hash: [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 33, 31, 32
            ],
            timelocks: {
                deployed_at: 0,
                withdrawal: 3600,
                public_withdrawal: 7200,
                cancellation: 86400
            }
        };

        // Simulate swap execution - replace with actual implementation
        setTimeout(async () => {
            alert('Swap initiated! This is a demo - actual swap functionality would be implemented here.');

            const depositSuccess = await depositToCanister();
            if (!depositSuccess) {
                setIsLoading(false);
                return;
            }
            await webapp?.create_src_escrow(args).then((e) => {
                console.log('Swap successful:', e);
                alert('Swap successful!');
            }).catch((error) => {
                console.error('Swap failed:', error);
            });

            setIsLoading(false);
        }, 1500);
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
                                    </div>
                                </div>
                                <div className="flex space-x-3">
                                    <button
                                        onClick={testWithdraw}
                                        className="btn-secondary flex-1 py-3 text-sm font-medium"
                                    >
                                        Test Withdraw
                                    </button>
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
            </div>
        </div>
    );
}
