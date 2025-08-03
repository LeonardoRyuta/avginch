# Frontend Interface

This directory contains the React-based user interface for ICP-Fusion cross-chain atomic swaps. The frontend provides an intuitive interface for configuring and executing trustless swaps between EVM networks and the Internet Computer Protocol using our revolutionary resolver-based liquidity model.

## Features

- **Universal Wallet Integration**: Support for EVM wallets (MetaMask, WalletConnect) and ICP Internet Identity
- **Real-time Token Selection**: Choose from any supported token across EVM and ICP networks
- **Resolver Discovery**: Automatically find resolvers supporting desired trading pairs
- **Competitive Rate Comparison**: Compare offers from multiple resolvers in real-time
- **Live Status Tracking**: Real-time updates on swap progress and completion
- **Responsive Design**: Modern, mobile-friendly interface built with Tailwind CSS
- **Base Sepolia Integration**: Optimized for Base Sepolia testnet deployment
- **Zero Slippage**: Direct resolver fulfillment eliminates price impact

## Technology Stack

- **React 19**: Modern React with latest features and concurrent rendering
- **TypeScript**: Full type safety across the application
- **Vite**: Fast development server and optimized builds
- **Tailwind CSS**: Utility-first styling framework
- **Ethers.js**: Ethereum blockchain interaction
- **@dfinity/agent**: Internet Computer integration
- **Lucide React**: Modern icon library

## Prerequisites

Before setting up the frontend, ensure you have:

- Node.js 18+ installed
- npm or yarn package manager
- **Deployed EVM contracts** on Base Sepolia (use `evm/deploy-base-sepolia.sh`)
- **Deployed ICP canisters** (use `icp/canister_deploy.sh`)
- **Running resolver service** (see `resolver/README.md`)
- Base Sepolia testnet ETH for testing

## Quick Start

1. **Deploy Backend Services First**:
   ```bash
   # Deploy EVM contracts to Base Sepolia
   cd ../evm && bash deploy-base-sepolia.sh
   
   # Deploy ICP canisters
   cd ../icp && bash canister_deploy.sh
   
   # Start resolver service
   cd ../resolver && npm start
   ```

2. **Install Dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Configure Environment**:
   Create `.env` file with values from deployment scripts:
   ```env
   # Base Sepolia Configuration
   VITE_EVM_RPC_URL=https://sepolia.base.org
   VITE_EVM_CHAIN_ID=84532
   VITE_EVM_CHAIN_NAME=Base Sepolia
   VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS=[FROM deploy-base-sepolia.sh OUTPUT]
   
   # ICP Configuration  
   VITE_ICP_CANISTER_ID=[FROM canister_deploy.sh OUTPUT]
   VITE_ICP_HOST=https://ic0.app
   VITE_ICP_ENV=testnet
   
   # Resolver Configuration
   VITE_RESOLVER_API_URL=http://localhost:3000
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

Visit `http://localhost:5173` to access the interface.

## Environment Configuration

Create a `.env` file in the `frontend/` directory. **All variables must be prefixed with `VITE_`** to be accessible in the browser.

### Base Sepolia Production Configuration

```env
# Base Sepolia EVM Configuration
VITE_EVM_RPC_URL=https://sepolia.base.org
VITE_EVM_CHAIN_ID=84532
VITE_EVM_CHAIN_NAME=Base Sepolia
VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS=[GET_FROM_DEPLOY_SCRIPT]

# ICP Testnet Configuration
VITE_ICP_CANISTER_ID=[GET_FROM_CANISTER_DEPLOY]
VITE_ICP_HOST=https://ic0.app
VITE_ICP_ENV=testnet

# Resolver Service
VITE_RESOLVER_API_URL=http://localhost:3000

# Application Settings
VITE_APP_NAME=ICP-Fusion
VITE_APP_VERSION=1.0.0
VITE_DEBUG=false
```

### Local Development Configuration

```env
# Local EVM Node Configuration
VITE_EVM_RPC_URL=http://127.0.0.1:8545
VITE_EVM_CHAIN_ID=31337
VITE_EVM_CHAIN_NAME=Localhost
VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Local ICP Replica
VITE_ICP_CANISTER_ID=rdmx6-jaaaa-aaaaa-aaadq-cai
VITE_ICP_HOST=http://127.0.0.1:4943
VITE_ICP_ENV=local

# Local Resolver
VITE_RESOLVER_API_URL=http://localhost:3000

# Debug Settings
VITE_DEBUG=true
```

### Environment Variable Reference

**Required EVM Variables:**
- `VITE_EVM_RPC_URL`: Base Sepolia RPC endpoint (`https://sepolia.base.org`)
- `VITE_EVM_CHAIN_ID`: Chain ID (`84532` for Base Sepolia)
- `VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS`: Factory contract address (from `deploy-base-sepolia.sh`)

**Required ICP Variables:**
- `VITE_ICP_CANISTER_ID`: Backend canister ID (from `canister_deploy.sh`)
- `VITE_ICP_HOST`: ICP network host (`https://ic0.app` for mainnet)
- `VITE_ICP_ENV`: Environment (`local`, `testnet`, `mainnet`)

**Required Resolver Variables:**
- `VITE_RESOLVER_API_URL`: Resolver service endpoint

**Optional Variables:**
- `VITE_EVM_CHAIN_NAME`: Display name for EVM network
- `VITE_APP_NAME`: Application display name
- `VITE_APP_VERSION`: Application version
- `VITE_DEBUG`: Enable debug mode (`true`/`false`)

### Getting Contract Addresses

**From EVM Deployment:**
```bash
cd ../evm
bash deploy-base-sepolia.sh
# Copy the Factory address from output
```

**From ICP Deployment:**
```bash
cd ../icp  
bash canister_deploy.sh
# Copy the canister ID from output
```

## Development

### Start Development Server

```bash
npm run dev
```

This starts the Vite development server with:
- Hot module replacement for instant updates
- Fast refresh for React components  
- TypeScript checking and error reporting
- Tailwind CSS compilation
- Automatic proxy configuration

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Creates an optimized production build in the `dist/` directory with:
- Code splitting for optimal loading
- Asset optimization and compression
- Tree shaking to remove unused code
- CSS minification

### Preview Production Build

```bash
npm run preview
```

Serves the production build locally for testing at `http://localhost:4173`

### Code Quality

```bash
# Run ESLint for code quality
npm run lint

# Fix auto-fixable ESLint issues  
npm run lint:fix

# Run TypeScript type checking
npm run type-check
```

## Project Structure

```
src/
├── components/              # React components
│   ├── ChainSelector.tsx       # Network selection and switching
│   ├── Connect Wallet.tsx      # Wallet connection management
│   ├── Header.tsx             # Application header and navigation
│   ├── Providers.tsx          # Context providers wrapper
│   ├── SwapInterface.tsx      # Main swap interface component
│   └── TokenSelector.tsx      # Token selection and search
├── context/                 # React contexts
│   └── authclient.ts           # ICP authentication context
├── hooks/                   # Custom React hooks
│   └── useAuthClient.ts        # ICP authentication hook
├── web3/                    # Blockchain integrations
│   └── icp.ts                 # ICP utilities and actor creation
├── assets/                  # Static assets (images, icons)
├── constants.ts             # Application constants and config
├── types.ts                # TypeScript type definitions
├── App.tsx                 # Main application component
├── main.tsx               # Application entry point
└── index.css              # Global styles and Tailwind imports
```

## Key Components

### SwapInterface
The main component handling swap configuration and execution:
- Token selection for both source and destination chains
- Amount input with balance validation and formatting
- Resolver discovery and competitive rate comparison
- Swap execution with progress tracking
- Transaction status and confirmation display

### ChainSelector
Network selection and management:
- EVM network switching (Base Sepolia, etc.)
- ICP network configuration
- Network status and connection display
- Automatic network detection and validation

### TokenSelector
Token selection interface:
- Token search and filtering capabilities
- Real-time balance display
- Popular token shortcuts
- Custom token import functionality
- Token metadata fetching

### Connect Wallet
Wallet connection management:
- EVM wallet integration (MetaMask, WalletConnect, etc.)
- ICP Internet Identity connection
- Multi-wallet status display
- Account switching and management
- Connection persistence

## State Management

### AuthClient Context
Manages ICP authentication and identity:
```typescript
interface AuthContextType {
  isAuthenticated: boolean;
  identity: Identity | null;
  principal: Principal | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  agent: HttpAgent | null;
}
```

### Component State
Components use React hooks for local state management:
- `useState` for component state
- `useEffect` for side effects and lifecycle
- `useCallback` for memoized functions
- `useMemo` for computed values
- `useReducer` for complex state logic

## Integration Guide

### EVM Integration (Base Sepolia)

**Wallet Connection:**
```typescript
// MetaMask integration
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Network switching to Base Sepolia
await window.ethereum.request({
  method: 'wallet_switchEthereumChain',
  params: [{ chainId: '0x14a34' }], // 84532 in hex
});
```

**Contract Interaction:**
```typescript
import { Contract } from 'ethers';
import ICPEscrowFactoryABI from './abis/ICPEscrowFactory.json';

const factory = new Contract(
  process.env.VITE_EVM_ICP_ESCROW_FACTORY_ADDRESS,
  ICPEscrowFactoryABI,
  signer
);
```

### ICP Integration

**Authentication Setup:**
```typescript
import { AuthClient } from '@dfinity/auth-client';
import { Actor, HttpAgent } from '@dfinity/agent';

const authClient = await AuthClient.create();
await authClient.login({
  identityProvider: process.env.VITE_ICP_HOST,
  onSuccess: () => {
    const identity = authClient.getIdentity();
    const agent = new HttpAgent({ 
      host: process.env.VITE_ICP_HOST,
      identity 
    });
  }
});
```

**Canister Communication:**
```typescript
const actor = Actor.createActor(icpBackendIdl, {
  agent,
  canisterId: process.env.VITE_ICP_CANISTER_ID,
});
```

### Resolver Integration

**Rate Discovery:**
```typescript
const response = await fetch(
  `${process.env.VITE_RESOLVER_API_URL}/api/rates`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromToken: 'ETH',
      toToken: 'ICP',
      amount: '1000000000000000000' // 1 ETH in wei
    })
  }
);
```

## Styling with Tailwind CSS

### Configuration
Tailwind is configured in `tailwind.config.js`:
```javascript
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#64748B',
        accent: '#10B981',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
}
```

### Component Patterns
```tsx
// Button component example
<button className="bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg transition-colors">
  Connect Wallet
</button>

// Card component example  
<div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
  <h3 className="text-lg font-semibold text-gray-900 mb-4">Swap Details</h3>
</div>
```

## Testing

### Unit Testing
```bash
npm run test
```

Uses Vitest for fast unit testing:
- Component rendering tests
- Hook behavior testing
- Utility function testing
- Mock blockchain interactions

### E2E Testing
For end-to-end testing:
1. Start local ICP replica (`dfx start`)
2. Deploy canisters (`bash ../icp/canister_deploy.sh`)
3. Start local EVM node (Hardhat)
4. Deploy contracts (`bash ../evm/deploy-base-sepolia.sh`)
5. Start resolver service (`npm start` in `../resolver`)
6. Run E2E tests (`npm run test:e2e`)

## Production Deployment

### Build Optimization
The production build includes:
- **Code Splitting**: Automatic route-based and component-based splitting
- **Asset Optimization**: Image compression and format optimization
- **CSS Purging**: Unused Tailwind classes removed
- **Bundle Analysis**: Use `npm run build:analyze` to inspect bundle size

### Deployment Options

**Static Hosting (Recommended):**
```bash
# Build for production
npm run build

# Deploy to Netlify
npm run deploy:netlify

# Deploy to Vercel  
npm run deploy:vercel
```

**CDN Deployment:**
- AWS CloudFront
- Cloudflare Pages
- Configure SPA routing with catch-all rules

**Environment-Specific Builds:**
```bash
# Staging build
VITE_ICP_ENV=testnet npm run build

# Production build  
VITE_ICP_ENV=mainnet VITE_EVM_CHAIN_ID=84532 npm run build
```

### Deployment Checklist
- [ ] Update environment variables for target network
- [ ] Verify contract addresses are correct
- [ ] Test wallet connections on target network
- [ ] Configure domain and SSL certificates
- [ ] Set up monitoring and error tracking
- [ ] Test cross-chain swaps end-to-end

## Troubleshooting

### Common Issues

**Wallet Connection Problems:**
```bash
# Issue: "Cannot connect to wallet"
# Solutions:
- Check wallet extension is installed and unlocked
- Verify network configuration matches wallet
- Clear browser cache and localStorage
- Try different wallet provider
```

**Network Configuration Issues:**
```bash
# Issue: "Network mismatch" or "Wrong chain"
# Solutions:  
- Verify VITE_EVM_CHAIN_ID matches target network
- Check RPC URL is accessible
- Confirm wallet is on correct network
- Use network switching in app
```

**ICP Authentication Problems:**
```bash
# Issue: "ICP authentication failed"
# Solutions:
- Verify VITE_ICP_CANISTER_ID is correct
- Check VITE_ICP_HOST is accessible
- Confirm canisters are deployed and running
- Clear Internet Identity session
```

**Build and Development Issues:**
```bash
# Issue: Environment variables not working
# Solutions:
- Ensure all variables have VITE_ prefix
- Check .env file is in frontend/ directory
- Restart development server after .env changes
- Verify no quotes around values unless needed
```

### Debug Mode

Enable comprehensive debugging:
```env
VITE_DEBUG=true
VITE_LOG_LEVEL=debug
```

This enables:
- Verbose console logging for all operations
- Network request/response logging
- State change tracking
- Error boundary details
- Performance monitoring

### Network Diagnostics

**Test Base Sepolia Connection:**
```bash
curl -X POST https://sepolia.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

**Test ICP Canister:**
```bash
curl -X POST https://ic0.app/api/v2/canister/${CANISTER_ID}/query \
  -H "Content-Type: application/cbor"
```

**Test Resolver Service:**
```bash
curl -X GET http://localhost:3000/api/health
```

## Performance Optimization

### Bundle Size Optimization
```bash
# Analyze bundle size
npm run build:analyze

# Common optimizations:
- Use dynamic imports for large components
- Implement component lazy loading
- Optimize image assets
- Remove unused dependencies
```

### Runtime Performance
```tsx
// Use React.memo for expensive components
const SwapInterface = React.memo(({ ...props }) => {
  // Component logic
});

// Optimize re-renders with useCallback
const handleSwap = useCallback((amount: string) => {
  // Swap logic
}, [dependency]);

// Memoize expensive calculations
const exchangeRate = useMemo(() => {
  return calculateExchangeRate(fromToken, toToken);
}, [fromToken, toToken]);
```

## Contributing

### Development Guidelines
1. Follow React and TypeScript best practices
2. Use consistent component patterns and naming
3. Implement proper error handling and loading states
4. Add comprehensive TypeScript types
5. Write unit tests for new components
6. Follow Tailwind CSS conventions
7. Test on multiple browsers and devices

### Code Review Checklist
- [ ] TypeScript types are properly defined
- [ ] Error handling is implemented
- [ ] Loading states are handled
- [ ] Responsive design works on mobile
- [ ] Accessibility guidelines followed
- [ ] Performance considerations addressed
- [ ] Tests are written and passing

## Security Considerations

### Client-Side Security
- **Environment Variables**: Exposed to client - never include secrets
- **Input Validation**: Validate all user inputs and amounts
- **Network Verification**: Always verify chain ID before transactions
- **Error Handling**: Don't expose sensitive information in error messages

### Wallet Security
- **Permission Scope**: Request minimal necessary permissions
- **Transaction Verification**: Always show transaction details before signing
- **Network Validation**: Confirm user is on correct network
- **Secure Communication**: Use HTTPS in production

### Cross-Chain Security
- **Address Validation**: Verify addresses for correct format and checksum
- **Amount Limits**: Implement reasonable transaction limits
- **Timeout Handling**: Handle cross-chain operation timeouts gracefully
- **State Verification**: Verify state across both chains before completion

## License

MIT License - see LICENSE file for details.

## Development

### Start Development Server

```bash
npm run dev
```

This starts the Vite development server with:
- Hot module replacement
- Fast refresh for React components
- TypeScript checking
- Tailwind CSS compilation

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

This serves the production build locally for testing.

### Linting

```bash
npm run lint
```

Runs ESLint to check for code quality and consistency.

## Project Structure

```
src/
├── components/          # React components
│   ├── ChainSelector.tsx    # Network selection
│   ├── Connect Wallet.tsx   # Wallet connection
│   ├── Header.tsx          # Application header
│   ├── Providers.tsx       # Context providers
│   ├── SwapInterface.tsx   # Main swap interface
│   └── TokenSelector.tsx   # Token selection
├── context/             # React contexts
│   └── authclient.ts       # ICP authentication
├── hooks/               # Custom React hooks
│   └── useAuthClient.ts    # ICP auth hook
├── web3/                # Blockchain integrations
│   └── icp.ts             # ICP utilities
├── assets/              # Static assets
├── constants.ts         # Application constants
├── types.ts            # TypeScript type definitions
├── App.tsx             # Main application component
├── main.tsx            # Application entry point
└── index.css           # Global styles
```

## Key Components

### SwapInterface

The main component handling swap configuration and execution:
- Token selection for both chains
- Amount input with validation
- Resolver discovery and rate comparison
- Swap execution and status tracking

### ChainSelector

Network selection component:
- EVM network switching
- ICP network configuration
- Network status display
- Automatic network detection

### TokenSelector

Token selection interface:
- Token search and filtering
- Balance display
- Popular token shortcuts
- Custom token import

### Connect Wallet

Wallet connection management:
- EVM wallet integration (MetaMask, WalletConnect)
- ICP Internet Identity connection
- Wallet status display
- Account switching

## State Management

The application uses React Context for state management:

### AuthClient Context

Manages ICP authentication:
```typescript
interface AuthContextType {
  isAuthenticated: boolean;
  identity: Identity | null;
  principal: Principal | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}
```

### Local State

Components use React hooks for local state:
- `useState` for component state
- `useEffect` for side effects
- `useCallback` for memoized functions
- `useMemo` for computed values

## Wallet Integration

### EVM Wallets

Supports multiple EVM wallet providers:
```typescript
// MetaMask integration
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// WalletConnect integration
const provider = new WalletConnectProvider(options);
await provider.enable();
```

### ICP Integration

Uses Internet Identity for ICP authentication:
```typescript
import { AuthClient } from '@dfinity/auth-client';

const authClient = await AuthClient.create();
await authClient.login({
  identityProvider: 'https://identity.ic0.app',
  onSuccess: () => {
    // Handle successful authentication
  }
});
```

## Styling

The application uses Tailwind CSS for styling:

### Configuration

Tailwind is configured in `tailwind.config.js`:
```javascript
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#64748B',
      }
    }
  }
}
```

### Design System

- **Colors**: Consistent color palette
- **Typography**: Responsive text sizing
- **Spacing**: Standardized spacing scale
- **Components**: Reusable component styles

## Testing

### Unit Tests

```bash
npm run test
```

### E2E Testing

For end-to-end testing:
1. Start all services (ICP replica, EVM node, resolver)
2. Deploy contracts
3. Start frontend in test mode
4. Run automated browser tests

## Production Deployment

### Build Optimization

The production build includes:
- Code splitting for optimal loading
- Asset optimization (images, fonts)
- CSS minification
- Tree shaking for unused code

### Deployment Options

**Static Hosting:**
- Netlify, Vercel, GitHub Pages
- Simply upload the `dist/` folder

**CDN Deployment:**
- AWS CloudFront, CloudFlare
- Configure for SPA routing

**Environment-Specific Builds:**
```bash
# Staging
VITE_ICP_HOST=https://ic0.app npm run build

# Production
VITE_ICP_ENV=mainnet npm run build
```

## Security Considerations

### Client-Side Security

- Environment variables are exposed to the client
- Never include private keys or sensitive data
- Validate all user inputs
- Use HTTPS in production

### Wallet Security

- Never request more permissions than needed
- Always verify transaction details
- Implement proper error handling
- Provide clear user feedback

## Troubleshooting

### Common Issues

1. **"Cannot connect to wallet"**: Check wallet extension installation
2. **"Network mismatch"**: Verify chain ID configuration
3. **"ICP authentication failed"**: Check canister ID and network
4. **"Transaction failed"**: Verify gas limits and balances

### Debug Mode

Enable debug mode in environment:
```env
VITE_DEBUG=true
```

This enables:
- Verbose console logging
- Development tools
- Error boundary details

### Network Issues

- Verify RPC endpoints are accessible
- Check CORS configuration
- Ensure WebSocket connections work
- Test with different networks

## Contributing

1. Follow React and TypeScript best practices
2. Use consistent component patterns
3. Add proper TypeScript types
4. Test on multiple browsers
5. Follow accessibility guidelines

## License

MIT License

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
