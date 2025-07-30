import { useState } from 'react';
import type { Token, Chain } from '../types';
import { TOKENS_BY_CHAIN } from '../constants';

interface TokenSelectorProps {
  selectedToken: Token | null;
  onTokenSelect: (token: Token) => void;
  selectedChain: Chain | null;
  label: string;
}

export default function TokenSelector({ selectedToken, onTokenSelect, selectedChain, label }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const availableTokens = selectedChain ? (TOKENS_BY_CHAIN[selectedChain.id] || []) : [];

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!selectedChain}
        className="selector-button w-full text-left flex items-center justify-between hover:shadow-lg transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
      >
        {selectedToken ? (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500 rounded-full text-white text-lg shadow-md">
              {selectedToken.icon}
            </div>
            <div>
              <div className="font-semibold text-gray-800">{selectedToken.symbol}</div>
              <div className="text-xs text-gray-500">{selectedToken.name}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <span className="text-gray-500 font-medium">
              {selectedChain ? 'Select token' : 'Select chain first'}
            </span>
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

      {isOpen && selectedChain && (
        <div className="absolute z-20 w-full mt-2 modern-card max-h-60 overflow-auto shadow-2xl border border-gray-100">
          {availableTokens.map((token, index) => (
            <button
              key={token.address}
              onClick={() => {
                onTokenSelect(token);
                setIsOpen(false);
              }}
              className={`w-full p-4 text-left hover:bg-gradient-to-r hover:from-green-50 hover:to-blue-50 flex items-center space-x-3 transition-all duration-200 ${
                index === 0 ? 'rounded-t-2xl' : ''
              } ${index === availableTokens.length - 1 ? 'rounded-b-2xl' : ''}`}
            >
              <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500 rounded-full text-white text-lg shadow-md">
                {token.icon}
              </div>
              <div>
                <div className="font-semibold text-gray-800">{token.symbol}</div>
                <div className="text-xs text-gray-500">{token.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
