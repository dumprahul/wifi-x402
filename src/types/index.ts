export interface Plan {
  id: string;
  hotspot_id: string;
  name: string;
  duration_seconds: number;
  price_usdc: string;
  is_recurring: boolean;
  renewal_every_seconds?: number;
  max_bandwidth_mbps?: number;
  created_at: number;
}

export interface Hotspot {
  id: string;
  owner_wallet: string;
  name: string;
  location?: string;
  router_mac: string;
  router_ip?: string;
  is_active: boolean;
  bandwidth_mbps?: number;
  uptime_percent?: number;
  created_at: number;
  updated_at: number;
  plans?: Plan[];
}

export interface Session {
  id: string;
  hotspot_id: string;
  plan_id: string;
  wallet: string;
  mac: string;
  ip: string;
  user_agent?: string;
  delegation_hash?: string;
  delegation_nonce?: number;
  task_id?: string;
  transaction_hash?: string;
  paid_amount: string;
  gas_paid_usdc?: string;
  started_at: number;
  expires_at: number;
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'error';
  is_recurring: boolean;
  renewal_count: number;
  last_renewal_at?: number;
  next_renewal_at?: number;
  created_at: number;
  updated_at: number;
}

export interface ERC7710Delegation {
  delegator: string;
  delegate: string;
  authority: {
    chainId: string;
    caveats: Caveat[];
  };
  signature: string;
  [key: string]: unknown;
}

export interface Caveat {
  type: string;
  value: unknown;
}

export interface EIP7702Authorization {
  chainId: string;
  address: string;
  nonce: string;
  r: string;
  s: string;
  v: string;
}

export interface Delegation {
  id: string;
  wallet: string;
  hotspot_id: string;
  permissions_context: ERC7710Delegation;
  total_usdc_authorized: string;
  usdc_spent: string;
  created_at: number;
  scope_expiry?: number;
  is_active: boolean;
  used_count: number;
  last_used_at?: number;
}

export interface WebhookEvent {
  id: string;
  task_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  transaction_hash?: string;
  received_at: number;
  processed: boolean;
  processed_at?: number;
}

export interface FirewallLog {
  id: string;
  session_id: string;
  ip: string;
  mac: string;
  action: 'add' | 'delete';
  executed_at: number;
  pfctl_output?: string;
}

export interface Revenue {
  id: string;
  hotspot_id: string;
  session_count: number;
  total_usdc: string;
  average_session_duration_seconds?: number;
  date: string;
}

export interface X402PaymentHeader {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface RelayerCapabilities {
  paymentTokens: string[];
  feeCollector: string;
  targetAddress: string;
}

export interface RelayerFeeData {
  gasPrice: string;
  rate: string;
  minFee: string;
  context: string;
  expiry: number;
}

export interface PurchaseRequest {
  wallet: string;
  mac: string;
  ip: string;
  planId: string;
  hotspotId?: string;
}
