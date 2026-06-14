import { bytesToHex } from 'viem/utils';

// Base Sepolia uses the dev endpoint; mainnet uses production
export function relayerUrl(chainId: string | number): string {
  return String(chainId) === '84532' || String(chainId) === '11155111'
    ? 'https://relayer.1shotapi.dev/relayers'
    : 'https://relayer.1shotapi.com/relayers';
}

async function rpc<T>(method: string, params: unknown, chainId: string | number = '84532'): Promise<T> {
  const url = relayerUrl(chainId);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as { result?: T; error?: { code: number; message: string } };
  if (json.error) throw new Error(`1Shot ${method} [${json.error.code}]: ${json.error.message}`);
  return json.result as T;
}

export type RelayerChainCapabilities = {
  feeCollector: `0x${string}`;
  targetAddress: `0x${string}`;
  tokens: Array<{ address: `0x${string}`; symbol?: string; decimals: number | string }>;
};

export type RelayerFeeData = {
  chainId: string;
  token: { address: `0x${string}`; decimals: number; symbol?: string };
  rate: number;
  minFee: string;
  expiry: number;
  gasPrice: `0x${string}`;
  feeCollector: `0x${string}`;
  targetAddress?: `0x${string}`;
  context?: string;
};

export type Estimate7710Result = {
  success: boolean;
  requiredPaymentAmount?: string;
  context?: string;
  contextByChainId?: Record<string, string>;
  gasUsed: Record<string, string>;
  error?: string;
};

export type Execution7710 = {
  target: `0x${string}`;
  value: string;
  data: `0x${string}`;
};

export async function getCapabilities(chainId: string): Promise<Record<string, RelayerChainCapabilities>> {
  return rpc<Record<string, RelayerChainCapabilities>>('relayer_getCapabilities', [chainId], chainId);
}

export async function getFeeData(chainId: string, token: `0x${string}`): Promise<RelayerFeeData> {
  return rpc<RelayerFeeData>('relayer_getFeeData', { chainId, token }, chainId);
}

export async function estimate7710Transaction(
  chainId: string,
  delegations: unknown[],
  executions: Execution7710[],
): Promise<Estimate7710Result> {
  return rpc<Estimate7710Result>(
    'relayer_estimate7710Transaction',
    { chainId, transactions: [{ permissionContext: delegations, executions }] },
    chainId,
  );
}

export async function send7710Transaction(opts: {
  chainId: string;
  delegations: unknown[];
  executions: Execution7710[];
  context?: string;
  destinationUrl?: string;
  memo?: string;
}): Promise<string> {
  const taskId = await rpc<string>(
    'relayer_send7710Transaction',
    {
      chainId: opts.chainId,
      transactions: [{ permissionContext: opts.delegations, executions: opts.executions }],
      ...(opts.context && { context: opts.context }),
      ...(opts.destinationUrl && { destinationUrl: opts.destinationUrl }),
      memo: opts.memo ?? 'wifix402-wifi-access',
    },
    opts.chainId,
  );
  return taskId;
}

export async function getRelayerStatus(taskId: string, chainId: string) {
  return rpc<{
    id: string;
    status: 100 | 110 | 200 | 400 | 500;
    chainId: string;
    hash?: string;
    receipt?: { transactionHash: string };
    message?: string;
  }>('relayer_getStatus', { id: taskId, logs: false }, chainId);
}

/** Convert delegation bigints + Uint8Arrays to JSON-safe shapes for relayer API. */
export function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toRelayerJson(v);
    }
    return out;
  }
  return value;
}
