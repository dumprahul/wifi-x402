import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RPC_URL, USDC_ADDRESS } from './constants';

export function getPublicClient() {
  const chain = base;
  return createPublicClient({ chain, transport: http(RPC_URL) });
}

/** Fetch ERC-20 balance of an address in atom units. */
export async function getUsdcBalance(address: `0x${string}`): Promise<bigint> {
  const client = getPublicClient();
  return client.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [address],
  }) as Promise<bigint>;
}

/** Check whether a smart account is deployed at an address. */
export async function isDeployed(address: `0x${string}`): Promise<boolean> {
  const client = getPublicClient();
  const code = await client.getCode({ address }).catch(() => undefined);
  return !!code && code !== '0x';
}

/** Wait for a transaction to be mined and return its receipt. */
export async function waitForTx(hash: `0x${string}`, timeoutMs = 120_000) {
  const client = getPublicClient();
  return client.waitForTransactionReceipt({ hash, timeout: timeoutMs });
}
