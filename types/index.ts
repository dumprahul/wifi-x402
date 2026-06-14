export interface Plan {
  id: string;
  name: string;
  duration_seconds: number;
  price_usdc: string;
  emoji: string;
  description: string;
  popular?: boolean;
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

export interface X402PaymentInfo {
  scheme: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  description: string;
  extra: {
    planId: string;
    durationSeconds: number;
  };
}

export interface PurchaseResult {
  success: boolean;
  taskId: string;
  plan: string;
  paidUsdc: string;
  durationSeconds: number;
  message: string;
  simulated?: boolean;
  relayerError?: string;
}

export interface RelayerCapabilities {
  paymentTokens: string[];
  feeCollector: string;
  targetAddress: string;
  supportedMethods?: string[];
}

export interface RelayerFeeData {
  gasPrice: string;
  rate: string;
  minFee: string;
  context: string;
  expiry: number;
}
