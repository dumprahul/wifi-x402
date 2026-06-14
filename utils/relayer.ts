// 1Shot permissionless relayer API calls
const RELAYER_URL = 'https://relayer.1shotapi.com/relayers';

async function rpc(method: string, params: unknown, id = 1) {
  const res = await fetch(RELAYER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`1Shot [${method}]: ${JSON.stringify(data.error)}`);
  return data.result;
}

export async function relayerGetCapabilities(chainId: string) {
  return rpc('relayer_getCapabilities', [chainId]);
}

export async function relayerGetFeeData(chainId: string, token: string) {
  return rpc('relayer_getFeeData', { chainId, token }, 2);
}

export async function relayerSend7710Transaction(params: {
  chainId: string;
  permissionContext: unknown;
  transactions: Array<{ to: string; data: string; value: string }>;
  context?: string;
  destinationUrl?: string;
}): Promise<string> {
  const result = await rpc('relayer_send7710Transaction', {
    chainId: params.chainId,
    transactions: params.transactions,
    permissionContext: params.permissionContext,
    context: params.context,
    destinationUrl: params.destinationUrl,
    memo: 'wifix402-wifi-access',
  }, 3);
  // result may be { taskId } or just taskId string
  return typeof result === 'string' ? result : result?.taskId ?? JSON.stringify(result);
}
