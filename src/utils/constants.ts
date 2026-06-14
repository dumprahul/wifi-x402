export const CHAIN_ID = process.env.CHAIN_ID || '8453'; // Base mainnet
export const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
export const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const HOTSPOT_WALLET = process.env.HOTSPOT_WALLET || '0x0000000000000000000000000000000000000001';

export const ONE_SHOT_RELAYER_URL = process.env.ONE_SHOT_RELAYER_URL || 'https://relayer.1shotapi.com/relayers';
export const ONE_SHOT_RELAYER_ADDRESS = process.env.ONE_SHOT_RELAYER_ADDRESS || '0x0000000000000000000000000000000000000002';
export const ONE_SHOT_WEBHOOK_SECRET = process.env.ONE_SHOT_WEBHOOK_SECRET || '';

export const WEBHOOK_URL = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook/1shot`
  : 'http://localhost:3000/api/webhook/1shot';

export const DEFAULT_PLANS = [
  { name: '5 Minutes', duration_seconds: 300, price_usdc: '0.005' },
  { name: '30 Minutes', duration_seconds: 1800, price_usdc: '0.02' },
  { name: '24 Hours', duration_seconds: 86400, price_usdc: '0.10', is_recurring: true },
];

export const USDC_DECIMALS = 6;

// ERC-7710/x402 constants
export const X402_VERSION = '1';
export const PAYMENT_SCHEME = 'erc7710';
