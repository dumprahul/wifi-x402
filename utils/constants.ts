// Base Sepolia testnet
export const CHAIN_ID = 84532;
export const CHAIN_ID_HEX = '0x14a34';
export const RPC_URL = 'https://sepolia.base.org';

// USDC on Base Sepolia
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const USDC_DECIMALS = 6;

// Where payments go (set via env for demo)
export const RECEIVER_WALLET = process.env.HOTSPOT_WALLET || '0x0000000000000000000000000000000000000001';

// 1Shot relayer
export const ONE_SHOT_RELAYER_URL = 'https://relayer.1shotapi.com/relayers';

// Webhook URL for 1Shot to call back
export const WEBHOOK_URL = process.env.NEXT_PUBLIC_BASE_URL
  ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook/1shot`
  : 'http://localhost:3000/api/webhook/1shot';

// WiFi access plans
export const PLANS = [
  {
    id: 'plan-1h',
    name: '1 Hour',
    duration_seconds: 3600,
    price_usdc: '0.01',
    emoji: '⚡',
    description: 'Quick session',
  },
  {
    id: 'plan-1d',
    name: '1 Day',
    duration_seconds: 86400,
    price_usdc: '0.05',
    emoji: '🌙',
    description: 'All day access',
  },
  {
    id: 'plan-1w',
    name: '1 Week',
    duration_seconds: 604800,
    price_usdc: '0.20',
    emoji: '🚀',
    description: 'Best value',
    popular: true,
  },
] as const;

export type PlanId = typeof PLANS[number]['id'];
