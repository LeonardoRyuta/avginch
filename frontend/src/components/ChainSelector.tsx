import { useState } from 'react';
import type { Chain } from '../types';
import { SUPPORTED_CHAINS } from '../constants';

interface ChainSelectorProps {
  selectedChain: Chain | null;
  onChainSelect: (chain: Chain) => void;
  label: string;
}

export default function ChainSelector({ selectedChain, onChainSelect, label }: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="selector-button w-full text-left flex items-center justify-between hover:shadow-lg transform hover:scale-[1.02] transition-all duration-300"
      >
        {selectedChain ? (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 rounded-full text-white text-lg shadow-md">
              {selectedChain.icon}
            </div>
            <div>
              <div className="font-semibold text-gray-800">{selectedChain.name}</div>
              <div className="text-xs text-gray-500">{selectedChain.symbol}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <span className="text-gray-500 font-medium">Select chain</span>
          </div>
        )}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 w-full mt-2 modern-card max-h-60 overflow-auto shadow-2xl border border-gray-100">
          {SUPPORTED_CHAINS.map((chain, index) => (
            <button
              key={chain.id}
              onClick={() => {
                onChainSelect(chain);
                setIsOpen(false);
              }}
              className={`w-full p-4 text-left hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 flex items-center space-x-3 transition-all duration-200 ${
                index === 0 ? 'rounded-t-2xl' : ''
              } ${index === SUPPORTED_CHAINS.length - 1 ? 'rounded-b-2xl' : ''}`}
            >
              <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 rounded-full text-white text-lg shadow-md">
                {chain.icon}
              </div>
              <div>
                <div className="font-semibold text-gray-800">{chain.name}</div>
                <div className="text-xs text-gray-500">{chain.symbol}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
