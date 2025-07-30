import Header from './components/Header'
import SwapInterface from './components/SwapInterface'

function App() {
  return (
    <div className="min-h-screen">
      <Header />
      
      <main className="py-8 px-4 relative">
        {/* Background decorations */}
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-300/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-purple-300/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-pink-300/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-2000"></div>
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold gradient-text mb-3">
              Welcome to AvgInch
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Experience seamless cross-chain swaps with our Fusion+ technology. 
              Bridge assets between Ethereum, ICP, Tron, and more.
            </p>
          </div>
          
          <SwapInterface />
        </div>
      </main>
      
      <footer className="bg-white/80 backdrop-blur-xl border-t border-white/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-center text-gray-600 text-sm">
            <p>&copy; 2025 AvgInch. Building the future of cross-chain DeFi.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
