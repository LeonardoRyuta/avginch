import ConnectWallet from "./Connect Wallet";

export default function Header() {
    return (
        <header className="bg-white/80 backdrop-blur-xl shadow-lg border-b border-white/50 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                                <span className="text-white font-bold text-lg">A</span>
                            </div>
                            <div className="text-2xl font-bold gradient-text">
                                AvgInch
                            </div>
                        </div>
                        <div className="hidden sm:block text-sm text-gray-600 bg-gray-100/50 px-3 py-1 rounded-full">
                            Cross-chain swaps powered by Fusion+
                        </div>
                    </div>

                    <ConnectWallet />
                </div>
            </div>
        </header>
    );
}
