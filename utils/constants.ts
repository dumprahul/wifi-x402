// Base Mainnet
export const CHAIN_ID = parseInt(process.env.CHAIN_ID || '8453');
export const CHAIN_ID_HEX = '0x2105'; // Base Mainnet
export const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

// USDC on Base Mainnet
export const USDC_ADDRESS = (process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as `0x${string}`;
export const USDC_DECIMALS = 6;

// Where payments go
export const RECEIVER_WALLET = (process.env.HOTSPOT_WALLET || '0x14a825D93c0592DB35f3CE964Fb48DB0ad98cF05') as `0x${string}`;

// x402 resource URL (this server)
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
export const WEBHOOK_URL = `${BASE_URL}/api/webhook/1shot`;

// WiFi plans
export const PLANS = [
  {
    id: 'plan-1h',
    name: '1 Hour',
    duration_seconds: 3600,
    price_usdc: '0.01',
    price_units: '10000', // 0.01 * 1e6
    emoji: '⚡',
    description: 'Quick session',
  },
  {
    id: 'plan-1d',
    name: '1 Day',
    duration_seconds: 86400,
    price_usdc: '0.05',
    price_units: '50000',
    emoji: '🌙',
    description: 'All day access',
  },
  {
    id: 'plan-1w',
    name: '1 Week',
    duration_seconds: 604800,
    price_usdc: '0.20',
    price_units: '200000',
    emoji: '🚀',
    description: 'Best value',
    popular: true,
  },
] as const;

export type PlanId = typeof PLANS[number]['id'];

// Top-Up pricing: $0.001 USDC per minute = 1000 atoms/min
export const TOPUP_RATE_PER_MINUTE_ATOMS = 1000n; // 0.001 USDC in atoms
export const TOPUP_RATE_PER_SECOND_ATOMS = TOPUP_RATE_PER_MINUTE_ATOMS / 60n; // ~16 atoms/sec

export const TOPUP_OPTIONS = [
  { minutes: 5,  label: '5 min',  maxUsdc: '0.005', maxAtoms: '5000' },
  { minutes: 10, label: '10 min', maxUsdc: '0.010', maxAtoms: '10000' },
  { minutes: 30, label: '30 min', maxUsdc: '0.030', maxAtoms: '30000' },
  { minutes: 60, label: '1 hour', maxUsdc: '0.060', maxAtoms: '60000' },
] as const;

export type TopupOption = typeof TOPUP_OPTIONS[number];
