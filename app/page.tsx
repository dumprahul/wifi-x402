'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils';
import { createWalletClient, custom } from 'viem';
import { PLANS, USDC_ADDRESS, CHAIN_ID_HEX } from '@/utils/constants';
import { toRelayerJson } from '@/utils/relayer';

type Plan = typeof PLANS[number];

type PurchaseStage =
  | 'Checking USDC balance...'
  | 'Fetching relay info...'
  | 'Sign permission in MetaMask...'
  | 'Submitting to 1Shot relayer...'
  | 'Waiting for confirmation...'
  | 'Activating session...';

type Step =
  | { type: 'idle' }
  | { type: 'connecting' }
  | { type: 'ready'; address: string }
  | { type: 'purchasing'; plan: Plan; stage: PurchaseStage }
  | { type: 'confirming'; plan: Plan; taskId: string; sessionId?: string }
  | { type: 'success'; plan: Plan; sessionId?: string; txHash: string }
  | { type: 'error'; message: string };

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

export default function HomePage() {
  const [step, setStep] = useState<Step>({ type: 'idle' });
  const [address, setAddress] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-reconnect if already connected
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    window.ethereum.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) {
          setAddress(list[0]);
          setStep({ type: 'ready', address: list[0] });
        }
      })
      .catch(() => {});
  }, []);

  // Poll relayer status while confirming
  useEffect(() => {
    if (step.type !== 'confirming') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const { taskId, plan, sessionId } = step;

    const poll = async () => {
      try {
        const res = await fetch(`/api/status/${taskId}`);
        const data = await res.json() as { status?: { status?: number; hash?: string; receipt?: { transactionHash?: string } }; error?: string };
        const statusCode = data.status?.status;
        const txHash = data.status?.receipt?.transactionHash ?? data.status?.hash ?? '';
        console.log(`[Poll] taskId=${taskId} status=${statusCode} tx=${txHash}`);

        if (statusCode === 200) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setStep({ type: 'success', plan, sessionId, txHash });
        } else if (statusCode === 400 || statusCode === 500) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setStep({ type: 'error', message: `1Shot relay failed (status ${statusCode}). Please try again.` });
        }
      } catch { /* network hiccup — keep polling */ }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStep({ type: 'error', message: 'MetaMask not found. Please install it.' });
      return;
    }
    setStep({ type: 'connecting' });
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const addr = accounts[0];
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
      } catch (switchErr: unknown) {
        const err = switchErr as { code?: number };
        if (err.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CHAIN_ID_HEX,
              chainName: 'Base Sepolia',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia-explorer.base.org'],
            }],
          });
        }
      }
      setAddress(addr);
      setStep({ type: 'ready', address: addr });

      // Fetch USDC balance at EOA (1Shot uses EOA upgraded via EIP-7702, not separate smart account)
      try {
        const pc = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
        const bal = await pc.readContract({
          address: USDC_ADDRESS,
          abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
          functionName: 'balanceOf',
          args: [addr as `0x${string}`],
        }).catch(() => 0n);
        setUsdcBalance((Number(bal) / 1_000_000).toFixed(4));
      } catch { /* non-critical */ }
    } catch (err) {
      setStep({ type: 'error', message: err instanceof Error ? err.message : 'Failed to connect' });
    }
  }, []);

  const handleBuy = useCallback(async (plan: Plan) => {
    if (!address || !window.ethereum) return;

    const stage = (s: PurchaseStage) => {
      console.log(`[1Shot] ${s}`);
      setStep({ type: 'purchasing', plan, stage: s });
    };

    try {
      // ── 1. Check USDC balance ──────────────────────────────────────────────
      stage('Checking USDC balance...');
      const pc = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
      const rawBalance = await pc.readContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      }).catch(() => 0n) as bigint;

      const balanceUsdc = (Number(rawBalance) / 1_000_000).toFixed(4);
      setUsdcBalance(balanceUsdc);
      console.log('[Balance] EOA USDC:', balanceUsdc, 'at', address);

      // ── 2. Get relay info from server 402 ────────────────────────────────
      stage('Fetching relay info...');
      const res402 = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, wallet: address }),
      });

      if (res402.status !== 402) {
        const txt = await res402.text();
        throw new Error(`Expected 402, got ${res402.status}: ${txt}`);
      }

      const paymentRequiredHeader = res402.headers.get('payment-required');
      if (!paymentRequiredHeader) throw new Error('Server did not return PAYMENT-REQUIRED header');

      const paymentRequired = JSON.parse(atob(paymentRequiredHeader)) as {
        x402Version: number;
        accepts: Array<{
          extra?: {
            targetAddress?: string;
            feeCollector?: string;
            feeAmount?: string;
          };
        }>;
      };
      const extra = paymentRequired.accepts[0]?.extra ?? {};
      const { targetAddress, feeCollector, feeAmount } = extra;

      if (!targetAddress || !feeCollector || !feeAmount) {
        throw new Error('Server 402 missing targetAddress / feeCollector / feeAmount in extra');
      }

      // Balance check: need plan amount + fee
      const totalNeeded = BigInt(plan.price_units) + BigInt(feeAmount);
      if (rawBalance < totalNeeded) {
        throw new Error(
          `Insufficient USDC at your wallet (${balanceUsdc} USDC).\n` +
          `Need ${(Number(totalNeeded) / 1_000_000).toFixed(4)} USDC (plan + relay fee).\n` +
          `Get Base Sepolia USDC at https://faucet.circle.com`
        );
      }

      // ── 3. Request EIP-7715 execution permission from MetaMask ───────────
      stage('Sign permission in MetaMask...');
      const walletClient = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum!) });
      const wallet7715 = walletClient.extend(erc7715ProviderActions());

      const periodAmount = BigInt(plan.price_units) + BigInt(feeAmount);
      const expiry = Math.floor(Date.now() / 1000) + 600; // 10-min window

      console.log('[EIP-7715] requesting permission to:', targetAddress, 'periodAmount:', periodAmount.toString());

      const granted = await wallet7715.requestExecutionPermissions([{
        chainId: baseSepolia.id,
        to: targetAddress as `0x${string}`,
        permission: {
          type: 'erc20-token-periodic' as const,
          data: {
            tokenAddress: USDC_ADDRESS,
            periodAmount,
            periodDuration: 86400, // 1 day window
            justification: `Wifix402 — ${plan.name} WiFi access`,
          },
          isAdjustmentAllowed: true,
        },
        expiry,
      }]);

      const context = granted[0]?.context;
      if (!context) throw new Error('MetaMask did not return a permission context');

      // Decode permission context → Delegation7710[] format for 1Shot
      const delegations = decodeDelegations(context).map(d => toRelayerJson(d));
      console.log('[EIP-7715] decoded delegations:', delegations.length);

      // ── 4. Submit to server → server calls 1Shot ──────────────────────────
      stage('Submitting to 1Shot relayer...');

      const paymentSigPayload = {
        x402Version: paymentRequired.x402Version,
        payload: {
          delegations,
          delegator: address,
          feeCollector,
          feeAmount,
        },
      };
      const paymentSig = btoa(JSON.stringify(paymentSigPayload));

      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': paymentSig,
        },
        body: JSON.stringify({ planId: plan.id, wallet: address }),
      });

      const text = await res.text();
      console.log(`[1Shot] purchase response ${res.status}:`, text);
      if (!res.ok) throw new Error(`Purchase failed (${res.status}): ${text}`);

      const data = JSON.parse(text) as { taskId?: string; sessionId?: string };
      console.log('[1Shot] taskId:', data.taskId);

      // ── 5. Poll relayer status until confirmed ────────────────────────────
      stage('Waiting for confirmation...');
      setStep({ type: 'confirming', plan, taskId: data.taskId ?? '', sessionId: data.sessionId });

    } catch (err) {
      console.error('[Buy] Error:', err);
      setStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [address]);

  const stepType = step.type;

  const stages: PurchaseStage[] = [
    'Checking USDC balance...',
    'Fetching relay info...',
    'Sign permission in MetaMask...',
    'Submitting to 1Shot relayer...',
    'Waiting for confirmation...',
    'Activating session...',
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-sm">W</div>
          <span className="font-bold text-lg tracking-tight">Wifix402</span>
          <span className="text-xs text-white/40 ml-1">Programmable WiFi</span>
        </div>
        <div className="flex items-center gap-2">
          {(stepType === 'ready' || stepType === 'purchasing' || stepType === 'confirming' || stepType === 'success') && address && (
            <span className="text-xs bg-white/10 px-3 py-1 rounded-full font-mono">
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          )}
          <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full">Base Sepolia</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-3">Pay-Per-Use WiFi</h1>
          <p className="text-white/60 text-lg">
            x402 + ERC-7710 + 1Shot permissionless relay — no ETH needed
          </p>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/40">
            <span>USDC on Base</span>
            <span>•</span>
            <span>EIP-7715 Permissions</span>
            <span>•</span>
            <span>1Shot Relayer</span>
          </div>
        </div>

        {/* Wallet info panel */}
        {address && usdcBalance !== null && (
          <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-white/40 text-xs mb-1">Your Wallet (pays USDC, no ETH needed)</div>
                <div className="font-mono text-white/70 text-xs">{address}</div>
              </div>
              <div className="text-right">
                <div className="text-white/40 text-xs mb-1">USDC Balance</div>
                <div className={`font-bold text-sm ${Number(usdcBalance) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {usdcBalance} USDC
                </div>
              </div>
            </div>
            {Number(usdcBalance) === 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 text-yellow-400 text-xs">
                ⚠️ No USDC in wallet. Get Base Sepolia USDC at{' '}
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline">
                  faucet.circle.com
                </a>
              </div>
            )}
          </div>
        )}

        {stepType === 'error' && (
          <div className="mb-8 bg-red-900/40 border border-red-500/40 rounded-xl p-4 text-red-300 text-sm whitespace-pre-wrap break-words">
            <strong>Error:</strong> {(step as Extract<Step, { type: 'error' }>).message}
            <button
              className="ml-4 underline text-red-400"
              onClick={() => setStep(address ? { type: 'ready', address } : { type: 'idle' })}
            >
              Dismiss
            </button>
          </div>
        )}

        {stepType === 'success' && (() => {
          const s = step as Extract<Step, { type: 'success' }>;
          return (
            <div className="mb-8 bg-green-900/30 border border-green-500/40 rounded-xl p-6 text-center">
              <div className="text-5xl mb-3">{s.plan.emoji}</div>
              <h2 className="text-xl font-bold text-green-300 mb-2">Access Granted!</h2>
              <p className="text-white/70 mb-4">
                Your <strong>{s.plan.name}</strong> plan is now active. 1Shot relayed the delegation on-chain.
              </p>
              <div className="text-xs text-white/40 space-y-1 font-mono">
                {s.sessionId && <div>Session: {s.sessionId}</div>}
                {s.txHash && (
                  <a
                    href={`https://sepolia.basescan.org/tx/${s.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 underline block mt-1"
                  >
                    View tx: {s.txHash.slice(0, 20)}…
                  </a>
                )}
              </div>
            </div>
          );
        })()}

        {/* Confirming panel */}
        {stepType === 'confirming' && (() => {
          const s = step as Extract<Step, { type: 'confirming' }>;
          return (
            <div className="mb-8 bg-blue-900/20 border border-blue-500/30 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-blue-400 animate-spin text-xl">⟳</span>
                <span className="font-semibold text-blue-300">Waiting for 1Shot relayer confirmation…</span>
              </div>
              <div className="text-xs text-white/40 font-mono space-y-1">
                <div>Plan: {s.plan.name} ({s.plan.price_usdc} USDC)</div>
                {s.sessionId && <div>Session: {s.sessionId}</div>}
                <div>TaskId: {s.taskId}</div>
                <div className="text-white/25 mt-1">Polling relayer every 3 seconds…</div>
              </div>
            </div>
          );
        })()}

        {/* Stage progress tracker */}
        {stepType === 'purchasing' && (() => {
          const s = step as Extract<Step, { type: 'purchasing' }>;
          const currentIdx = stages.indexOf(s.stage);
          return (
            <div className="mb-8 bg-blue-900/20 border border-blue-500/30 rounded-xl p-5">
              <div className="text-sm font-semibold text-blue-300 mb-3">
                Purchasing {s.plan.name} — {s.plan.price_usdc} USDC
              </div>
              <div className="space-y-2">
                {stages.map((st, i) => (
                  <div key={st} className={`flex items-center gap-3 text-sm ${
                    i < currentIdx ? 'text-green-400' : i === currentIdx ? 'text-white animate-pulse' : 'text-white/30'
                  }`}>
                    <span className="w-5 text-center">{i < currentIdx ? '✓' : i === currentIdx ? '⟳' : '○'}</span>
                    <span>{st}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => {
            const isPurchasing = stepType === 'purchasing' && (step as Extract<Step, { type: 'purchasing' }>).plan.id === plan.id;
            const isConfirming = stepType === 'confirming' && (step as Extract<Step, { type: 'confirming' }>).plan.id === plan.id;
            const anyBusy = stepType === 'purchasing' || stepType === 'confirming';
            const isPopular = 'popular' in plan && plan.popular;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col gap-4 transition-all ${
                  isPopular ? 'border-blue-400/60 bg-blue-900/20' : 'border-white/10 bg-white/5'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    BEST VALUE
                  </div>
                )}
                <div className="text-4xl">{plan.emoji}</div>
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-white/50 text-sm">{plan.description}</p>
                </div>
                <div className="mt-auto">
                  <div className="text-3xl font-bold">${plan.price_usdc}</div>
                  <div className="text-white/40 text-xs">USDC + relay fee</div>
                </div>

                {isPurchasing ? (
                  <div className="w-full py-3 rounded-xl bg-blue-900/60 text-blue-300 font-bold text-center text-sm animate-pulse">
                    {(step as Extract<Step, { type: 'purchasing' }>).stage}
                  </div>
                ) : isConfirming ? (
                  <div className="w-full py-3 rounded-xl bg-blue-900/60 text-blue-300 font-bold text-center text-sm animate-pulse">
                    Confirming via 1Shot…
                  </div>
                ) : (stepType === 'idle' || stepType === 'error') ? (
                  <button
                    onClick={connectWallet}
                    className="w-full py-3 rounded-xl bg-white text-slate-900 font-bold hover:bg-blue-100 transition-colors"
                  >
                    Connect Wallet
                  </button>
                ) : stepType === 'connecting' ? (
                  <button disabled className="w-full py-3 rounded-xl bg-white/10 text-white/40 font-bold">
                    Connecting…
                  </button>
                ) : (
                  <button
                    onClick={() => handleBuy(plan)}
                    disabled={anyBusy}
                    className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-40 font-bold transition-colors"
                  >
                    Buy {plan.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="border border-white/10 rounded-2xl p-6 bg-white/5">
          <h3 className="font-bold mb-4 text-white/80">How it works</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-white/50">
            {[
              { icon: '🦊', label: 'Connect MetaMask', desc: 'EIP-7715 permission request' },
              { icon: '💳', label: 'Select a plan', desc: 'x402 fetches relay info' },
              { icon: '✍️', label: 'Sign permission', desc: '1Shot relays on-chain' },
              { icon: '✅', label: 'Go online', desc: 'Firewall whitelist updated' },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center text-center gap-2">
                <span className="text-2xl">{icon}</span>
                <span className="font-semibold text-white/70">{label}</span>
                <span className="text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
