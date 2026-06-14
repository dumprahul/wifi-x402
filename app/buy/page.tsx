'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPublicClient, http, createWalletClient, custom } from 'viem';
import { baseSepolia } from 'viem/chains';
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

const STAGES: PurchaseStage[] = [
  'Checking USDC balance...',
  'Fetching relay info...',
  'Sign permission in MetaMask...',
  'Submitting to 1Shot relayer...',
  'Waiting for confirmation...',
  'Activating session...',
];

export default function BuyPage() {
  const [step, setStep] = useState<Step>({ type: 'idle' });
  const [address, setAddress] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    window.ethereum.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) { setAddress(list[0]); setStep({ type: 'ready', address: list[0] }); }
      }).catch(() => {});
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
        const data = await res.json() as { status?: { status?: number; hash?: string; receipt?: { transactionHash?: string } } };
        const code = data.status?.status;
        const txHash = data.status?.receipt?.transactionHash ?? data.status?.hash ?? '';
        if (code === 200) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setStep({ type: 'success', plan, sessionId, txHash });
        } else if (code === 400 || code === 500) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setStep({ type: 'error', message: `1Shot relay failed (status ${code}). Please try again.` });
        }
      } catch { /* keep polling */ }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step]);

  const fetchBalance = useCallback(async (addr: string) => {
    try {
      const pc = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
      const bal = await pc.readContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf', args: [addr as `0x${string}`],
      }).catch(() => 0n) as bigint;
      setUsdcBalance((Number(bal) / 1_000_000).toFixed(4));
    } catch { /* non-critical */ }
  }, []);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) { setStep({ type: 'error', message: 'MetaMask not found. Install it at metamask.io' }); return; }
    setStep({ type: 'connecting' });
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const addr = accounts[0];
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
      } catch (e: unknown) {
        if ((e as { code?: number }).code === 4902) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_ID_HEX, chainName: 'Base Sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://sepolia.base.org'], blockExplorerUrls: ['https://sepolia-explorer.base.org'] }] });
        }
      }
      setAddress(addr);
      setStep({ type: 'ready', address: addr });
      fetchBalance(addr);
    } catch (err) {
      setStep({ type: 'error', message: err instanceof Error ? err.message : 'Failed to connect' });
    }
  }, [fetchBalance]);

  const handleBuy = useCallback(async (plan: Plan) => {
    if (!address || !window.ethereum) return;
    const stage = (s: PurchaseStage) => { console.log(`[1Shot] ${s}`); setStep({ type: 'purchasing', plan, stage: s }); };

    try {
      stage('Checking USDC balance...');
      const pc = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
      const rawBalance = await pc.readContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf', args: [address as `0x${string}`],
      }).catch(() => 0n) as bigint;

      setUsdcBalance((Number(rawBalance) / 1_000_000).toFixed(4));

      stage('Fetching relay info...');
      const res402 = await fetch('/api/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.id, wallet: address }) });
      if (res402.status !== 402) throw new Error(`Expected 402, got ${res402.status}: ${await res402.text()}`);

      const paymentRequiredHeader = res402.headers.get('payment-required');
      if (!paymentRequiredHeader) throw new Error('Server did not return PAYMENT-REQUIRED header');

      const paymentRequired = JSON.parse(atob(paymentRequiredHeader)) as {
        x402Version: number;
        accepts: Array<{ extra?: { targetAddress?: string; feeCollector?: string; feeAmount?: string } }>;
      };
      const extra = paymentRequired.accepts[0]?.extra ?? {};
      const { targetAddress, feeCollector, feeAmount } = extra;

      if (!targetAddress || !feeCollector || !feeAmount) throw new Error('Server 402 missing relay info');

      const totalNeeded = BigInt(plan.price_units) + BigInt(feeAmount);
      if (rawBalance < totalNeeded) {
        throw new Error(
          `Insufficient USDC.\nHave: ${(Number(rawBalance) / 1e6).toFixed(4)} USDC\nNeed: ${(Number(totalNeeded) / 1e6).toFixed(4)} USDC\n\nGet Base Sepolia USDC at faucet.circle.com`
        );
      }

      stage('Sign permission in MetaMask...');
      const wc = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum!) });
      const wallet7715 = wc.extend(erc7715ProviderActions());
      const periodAmount = BigInt(plan.price_units) + BigInt(feeAmount);

      const granted = await wallet7715.requestExecutionPermissions([{
        chainId: baseSepolia.id,
        to: targetAddress as `0x${string}`,
        permission: { type: 'erc20-token-periodic' as const, data: { tokenAddress: USDC_ADDRESS, periodAmount, periodDuration: 86400, justification: `Wifix402 — ${plan.name} WiFi access` }, isAdjustmentAllowed: true },
        expiry: Math.floor(Date.now() / 1000) + 600,
      }]);

      const context = granted[0]?.context;
      if (!context) throw new Error('MetaMask did not return a permission context');
      const delegations = decodeDelegations(context).map(d => toRelayerJson(d));

      stage('Submitting to 1Shot relayer...');
      const paymentSig = btoa(JSON.stringify({
        x402Version: paymentRequired.x402Version,
        payload: { delegations, delegator: address, feeCollector, feeAmount },
      }));

      const res = await fetch('/api/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': paymentSig }, body: JSON.stringify({ planId: plan.id, wallet: address }) });
      const text = await res.text();
      if (!res.ok) throw new Error(`Purchase failed (${res.status}): ${text}`);

      const data = JSON.parse(text) as { taskId?: string; sessionId?: string };
      stage('Waiting for confirmation...');
      setStep({ type: 'confirming', plan, taskId: data.taskId ?? '', sessionId: data.sessionId });
    } catch (err) {
      console.error('[Buy]', err);
      setStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [address]);

  const stepType = step.type;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/8 rounded-full blur-[100px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-50 flex items-center justify-between px-6 md:px-10 py-4 border-b border-white/5 backdrop-blur-sm bg-black/30">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-black text-xs">W</div>
          <span className="font-bold text-base tracking-tight">Wifix402</span>
        </Link>
        <div className="flex items-center gap-3">
          {address && (
            <div className="flex items-center gap-2 text-xs text-white/40 bg-white/5 border border-white/8 px-3 py-1.5 rounded-full font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {address.slice(0, 6)}…{address.slice(-4)}
            </div>
          )}
          <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-xs">Base Sepolia</Badge>
        </div>
      </nav>

      <div className="relative max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Get WiFi Access</h1>
          <p className="text-white/40 text-sm">x402 + ERC-7710 + 1Shot relay · No ETH required · USDC on Base</p>
        </div>

        {/* Wallet info panel */}
        {address && (
          <div className="mb-8 rounded-2xl border border-white/8 bg-white/3 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-white/30 text-xs mb-1">Connected wallet (EOA · EIP-7702)</div>
              <div className="font-mono text-white/60 text-xs">{address}</div>
            </div>
            <div className="flex items-center gap-4">
              {usdcBalance !== null && (
                <div className="text-right">
                  <div className="text-white/30 text-xs mb-1">USDC Balance</div>
                  <div className={`font-bold text-sm ${Number(usdcBalance) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {usdcBalance} USDC
                  </div>
                </div>
              )}
              <button onClick={() => address && fetchBalance(address)} className="text-white/20 hover:text-white/50 text-xs transition-colors">↻</button>
            </div>
            {usdcBalance !== null && Number(usdcBalance) === 0 && (
              <div className="w-full pt-3 border-t border-white/5 text-yellow-400/80 text-xs flex items-center gap-2">
                ⚠️ No USDC — get Base Sepolia USDC at{' '}
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-300">faucet.circle.com</a>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {stepType === 'error' && (
          <div className="mb-8 rounded-2xl border border-red-500/20 bg-red-950/20 p-5 text-red-300 text-sm whitespace-pre-wrap break-words">
            <div className="font-bold mb-1 text-red-400">Something went wrong</div>
            {(step as Extract<Step, { type: 'error' }>).message}
            <button className="mt-3 block text-xs text-red-400/60 hover:text-red-300 underline" onClick={() => setStep(address ? { type: 'ready', address } : { type: 'idle' })}>
              Dismiss and retry
            </button>
          </div>
        )}

        {/* Success */}
        {stepType === 'success' && (() => {
          const s = step as Extract<Step, { type: 'success' }>;
          return (
            <div className="mb-8 rounded-2xl border border-green-500/20 bg-green-950/20 p-8 text-center">
              <div className="text-6xl mb-4">{s.plan.emoji}</div>
              <div className="text-2xl font-black text-green-400 mb-2">Access Granted!</div>
              <p className="text-white/50 mb-5">
                <strong className="text-white">{s.plan.name}</strong> plan is now active. 1Shot relayed your delegation on-chain.
              </p>
              <div className="space-y-1.5 text-xs font-mono text-white/30">
                {s.sessionId && <div>Session ID: {s.sessionId}</div>}
                {s.txHash && (
                  <a href={`https://sepolia.basescan.org/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline block">
                    View on Basescan: {s.txHash.slice(0, 22)}…
                  </a>
                )}
              </div>
            </div>
          );
        })()}

        {/* Confirming */}
        {stepType === 'confirming' && (() => {
          const s = step as Extract<Step, { type: 'confirming' }>;
          return (
            <div className="mb-8 rounded-2xl border border-blue-500/20 bg-blue-950/15 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="font-semibold text-blue-300">Waiting for 1Shot relay confirmation…</span>
              </div>
              <div className="text-xs text-white/30 font-mono space-y-1">
                <div>Plan: {s.plan.name} · {s.plan.price_usdc} USDC</div>
                {s.sessionId && <div>Session: {s.sessionId}</div>}
                <div>TaskId: {s.taskId}</div>
                <div className="text-white/15 mt-2">Polling every 3s · Webhook will also activate session</div>
              </div>
            </div>
          );
        })()}

        {/* Stage tracker */}
        {stepType === 'purchasing' && (() => {
          const s = step as Extract<Step, { type: 'purchasing' }>;
          const idx = STAGES.indexOf(s.stage);
          return (
            <div className="mb-8 rounded-2xl border border-blue-500/20 bg-blue-950/15 p-6">
              <div className="text-sm font-semibold text-blue-300 mb-5">
                Purchasing {s.plan.name} · {s.plan.price_usdc} USDC
              </div>
              <div className="space-y-3">
                {STAGES.map((st, i) => (
                  <div key={st} className={`flex items-center gap-3 text-sm transition-all ${
                    i < idx ? 'text-green-400' : i === idx ? 'text-white' : 'text-white/20'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border text-xs font-bold ${
                      i < idx ? 'border-green-500 bg-green-500/20 text-green-400' :
                      i === idx ? 'border-blue-400 bg-blue-500/20 text-blue-400' :
                      'border-white/10 text-white/20'
                    }`}>
                      {i < idx ? '✓' : i === idx ? <span className="animate-pulse">·</span> : i + 1}
                    </div>
                    <span>{st}</span>
                    {i === idx && <div className="ml-auto w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {PLANS.map((plan) => {
            const isPurchasing = stepType === 'purchasing' && (step as Extract<Step, { type: 'purchasing' }>).plan.id === plan.id;
            const isConfirming = stepType === 'confirming' && (step as Extract<Step, { type: 'confirming' }>).plan.id === plan.id;
            const anyBusy = stepType === 'purchasing' || stepType === 'confirming';
            const isPopular = 'popular' in plan && plan.popular;

            return (
              <Card key={plan.id} className={`relative rounded-2xl flex flex-col gap-5 p-6 transition-all duration-300 ${
                isPopular
                  ? 'bg-blue-600/12 border-blue-500/35 shadow-lg shadow-blue-500/10'
                  : 'bg-white/3 border-white/8 hover:border-white/15 hover:bg-white/5'
              }`}>
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-blue-500/30">
                    BEST VALUE
                  </div>
                )}

                <div className="flex items-start justify-between">
                  <span className="text-4xl">{plan.emoji}</span>
                  {isPopular && <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">Popular</Badge>}
                </div>

                <div>
                  <div className="text-xl font-black text-white">{plan.name}</div>
                  <div className="text-white/40 text-sm mt-1">{plan.description}</div>
                </div>

                <div className="mt-auto">
                  <div className="text-3xl font-black text-white">${plan.price_usdc}</div>
                  <div className="text-white/25 text-xs mt-1">USDC + ~$0.01 relay fee</div>
                </div>

                <Separator className="bg-white/5" />

                {isPurchasing || isConfirming ? (
                  <div className={`w-full py-3 rounded-xl text-center text-sm font-semibold animate-pulse ${
                    isPurchasing ? 'bg-blue-900/60 text-blue-300' : 'bg-blue-900/40 text-blue-400'
                  }`}>
                    {isPurchasing
                      ? (step as Extract<Step, { type: 'purchasing' }>).stage
                      : 'Confirming via 1Shot…'}
                  </div>
                ) : stepType === 'idle' || stepType === 'error' ? (
                  <Button onClick={connectWallet} className="w-full bg-white text-slate-900 hover:bg-blue-50 font-bold rounded-xl h-11">
                    Connect MetaMask
                  </Button>
                ) : stepType === 'connecting' ? (
                  <Button disabled className="w-full bg-white/10 text-white/30 font-bold rounded-xl h-11">
                    Connecting…
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleBuy(plan)}
                    disabled={anyBusy}
                    className={`w-full font-bold rounded-xl h-11 ${
                      isPopular
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-white/8 hover:bg-white/15 text-white border border-white/10'
                    }`}
                  >
                    Buy {plan.name}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        {/* How it works mini */}
        <div className="rounded-2xl border border-white/5 bg-white/2 p-6">
          <div className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-5">How payment works</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: '🦊', label: 'Connect MetaMask', sub: 'EIP-7715 permission' },
              { icon: '📋', label: 'x402 handshake', sub: '402 → relay info' },
              { icon: '✍️', label: 'Sign delegation', sub: 'ERC-7710 scoped' },
              { icon: '🛸', label: '1Shot confirms', sub: 'Gasless on-chain' },
            ].map(({ icon, label, sub }) => (
              <div key={label} className="text-center">
                <div className="text-2xl mb-2">{icon}</div>
                <div className="text-white/70 text-xs font-semibold">{label}</div>
                <div className="text-white/25 text-xs mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
