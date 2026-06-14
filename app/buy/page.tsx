'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPublicClient, http, createWalletClient, custom } from 'viem';
import { baseSepolia } from 'viem/chains';
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils';
import Link from 'next/link';
import { PLANS, USDC_ADDRESS, CHAIN_ID_HEX, TOPUP_OPTIONS } from '@/utils/constants';
import { toRelayerJson } from '@/utils/relayer';

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan = typeof PLANS[number];
type TopupOpt = typeof TOPUP_OPTIONS[number];

type PurchaseStage =
  | 'Checking USDC balance...'
  | 'Fetching relay info...'
  | 'Sign permission in MetaMask...'
  | 'Submitting to 1Shot relayer...'
  | 'Waiting for confirmation...'
  | 'Activating session...';

type PlanStep =
  | { type: 'idle' }
  | { type: 'connecting' }
  | { type: 'ready'; address: string }
  | { type: 'purchasing'; plan: Plan; stage: PurchaseStage }
  | { type: 'confirming'; plan: Plan; taskId: string; sessionId?: string }
  | { type: 'success'; plan: Plan; sessionId?: string; txHash: string }
  | { type: 'error'; message: string };

type TopupStep =
  | { type: 'idle' }
  | { type: 'fetching-relay' }
  | { type: 'pick'; relayInfo: RelayInfo }
  | { type: 'delegating'; option: TopupOpt; relayInfo: RelayInfo }
  | { type: 'ready'; option: TopupOpt; sessionId: string }
  | { type: 'starting'; option: TopupOpt; sessionId: string }
  | { type: 'active'; option: TopupOpt; sessionId: string; startTime: number; maxSeconds: number }
  | { type: 'stopping'; sessionId: string; actualSeconds: number; actualUsdc: string; taskId: string }
  | { type: 'receipt'; sessionId: string; actualSeconds: number; actualUsdc: string; txHash: string | null }
  | { type: 'error'; message: string };

interface RelayInfo {
  targetAddress: string;
  feeCollector: string;
  feeAmountAtoms: string;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

const PLAN_STAGES: PurchaseStage[] = [
  'Checking USDC balance...',
  'Fetching relay info...',
  'Sign permission in MetaMask...',
  'Submitting to 1Shot relayer...',
  'Waiting for confirmation...',
  'Activating session...',
];

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuyPage() {
  const [tab, setTab] = useState<'plan' | 'topup'>('plan');
  const [address, setAddress] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);

  const [planStep, setPlanStep] = useState<PlanStep>({ type: 'idle' });
  const [topupStep, setTopupStep] = useState<TopupStep>({ type: 'idle' });

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    window.ethereum.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) { setAddress(list[0]); setPlanStep({ type: 'ready', address: list[0] }); }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (topupStep.type === 'active') {
      const { startTime } = topupStep;
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 500);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [topupStep.type]);

  useEffect(() => {
    if (topupStep.type !== 'active') return;
    const { maxSeconds, sessionId } = topupStep;
    if (elapsed >= maxSeconds) handleStop(sessionId, elapsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, topupStep.type]);

  useEffect(() => {
    if (planStep.type !== 'confirming') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const { taskId, plan, sessionId } = planStep;
    const poll = async () => {
      try {
        const res = await fetch(`/api/status/${taskId}`);
        const data = await res.json() as { status?: { status?: number; hash?: string; receipt?: { transactionHash?: string } } };
        const code = data.status?.status;
        const txHash = data.status?.receipt?.transactionHash ?? data.status?.hash ?? '';
        if (code === 200) { clearInterval(pollRef.current!); pollRef.current = null; setPlanStep({ type: 'success', plan, sessionId, txHash }); }
        else if (code === 400 || code === 500) { clearInterval(pollRef.current!); pollRef.current = null; setPlanStep({ type: 'error', message: `1Shot relay failed (${code}).` }); }
      } catch { /* keep polling */ }
    };
    poll(); pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [planStep]);

  useEffect(() => {
    if (topupStep.type !== 'stopping') return;
    const { sessionId, actualSeconds, actualUsdc } = topupStep;
    const stopPoll = setInterval(async () => {
      try {
        const res = await fetch(`/api/topup/status/${sessionId}`);
        const d = await res.json() as { state?: string; transactionHash?: string; actualChargedUsdc?: string };
        if (d.state === 'stopped') {
          clearInterval(stopPoll);
          setTopupStep({ type: 'receipt', sessionId, actualSeconds, actualUsdc: d.actualChargedUsdc ?? actualUsdc, txHash: d.transactionHash ?? null });
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(stopPoll);
  }, [topupStep]);

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

  const ensureWallet = useCallback(async (): Promise<string | null> => {
    if (address) return address;
    if (!window.ethereum) { setPlanStep({ type: 'error', message: 'MetaMask not found. Install at metamask.io' }); return null; }
    setPlanStep({ type: 'connecting' });
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
      setAddress(addr); setPlanStep({ type: 'ready', address: addr }); fetchBalance(addr);
      return addr;
    } catch (err) {
      setPlanStep({ type: 'error', message: err instanceof Error ? err.message : 'Failed to connect' });
      return null;
    }
  }, [address, fetchBalance]);

  const handleBuyPlan = useCallback(async (plan: Plan) => {
    const addr = await ensureWallet();
    if (!addr) return;
    const stage = (s: PurchaseStage) => setPlanStep({ type: 'purchasing', plan, stage: s });
    try {
      stage('Checking USDC balance...');
      const pc = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
      const rawBalance = await pc.readContract({ address: USDC_ADDRESS, abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }], functionName: 'balanceOf', args: [addr as `0x${string}`] }).catch(() => 0n) as bigint;
      setUsdcBalance((Number(rawBalance) / 1_000_000).toFixed(4));

      stage('Fetching relay info...');
      const res402 = await fetch('/api/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.id, wallet: addr }) });
      if (res402.status !== 402) throw new Error(`Expected 402, got ${res402.status}`);
      const header = res402.headers.get('payment-required');
      if (!header) throw new Error('No PAYMENT-REQUIRED header');
      const paymentRequired = JSON.parse(atob(header)) as { x402Version: number; accepts: Array<{ extra?: { targetAddress?: string; feeCollector?: string; feeAmount?: string } }> };
      const extra = paymentRequired.accepts[0]?.extra ?? {};
      const { targetAddress, feeCollector, feeAmount } = extra;
      if (!targetAddress || !feeCollector || !feeAmount) throw new Error('Server 402 missing relay info');

      const totalNeeded = BigInt(plan.price_units) + BigInt(feeAmount);
      if (rawBalance < totalNeeded) throw new Error(`Insufficient USDC.\nHave: ${(Number(rawBalance) / 1e6).toFixed(4)}\nNeed: ${(Number(totalNeeded) / 1e6).toFixed(4)}\n\nGet Base Sepolia USDC at faucet.circle.com`);

      stage('Sign permission in MetaMask...');
      const wc = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum!) });
      const wallet7715 = wc.extend(erc7715ProviderActions());
      const granted = await wallet7715.requestExecutionPermissions([{ chainId: baseSepolia.id, to: targetAddress as `0x${string}`, permission: { type: 'erc20-token-periodic' as const, data: { tokenAddress: USDC_ADDRESS, periodAmount: BigInt(plan.price_units) + BigInt(feeAmount), periodDuration: 86400, justification: `Wifix402 — ${plan.name} WiFi access` }, isAdjustmentAllowed: true }, expiry: Math.floor(Date.now() / 1000) + 600 }]);
      const context = granted[0]?.context;
      if (!context) throw new Error('MetaMask did not return a permission context');
      const delegations = decodeDelegations(context).map(d => toRelayerJson(d));

      stage('Submitting to 1Shot relayer...');
      const paymentSig = btoa(JSON.stringify({ x402Version: paymentRequired.x402Version, payload: { delegations, delegator: addr, feeCollector, feeAmount } }));
      const res = await fetch('/api/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': paymentSig }, body: JSON.stringify({ planId: plan.id, wallet: addr }) });
      if (!res.ok) throw new Error(`Purchase failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { taskId?: string; sessionId?: string };
      stage('Waiting for confirmation...');
      setPlanStep({ type: 'confirming', plan, taskId: data.taskId ?? '', sessionId: data.sessionId });
    } catch (err) {
      setPlanStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [ensureWallet]);

  const handleTopupConnect = useCallback(async () => {
    const addr = await ensureWallet();
    if (!addr) return;
    setTopupStep({ type: 'fetching-relay' });
    try {
      const res = await fetch('/api/topup/delegate');
      if (!res.ok) throw new Error('Failed to fetch relay info');
      const info = await res.json() as RelayInfo;
      setTopupStep({ type: 'pick', relayInfo: info });
    } catch (err) {
      setTopupStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [ensureWallet]);

  const handleDelegate = useCallback(async (option: TopupOpt, relayInfo: RelayInfo) => {
    const addr = address;
    if (!addr || !window.ethereum) return;
    setTopupStep({ type: 'delegating', option, relayInfo });
    try {
      const wc = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum!) });
      const wallet7715 = wc.extend(erc7715ProviderActions());
      const maxAtoms = BigInt(option.maxAtoms) + BigInt(relayInfo.feeAmountAtoms);
      const granted = await wallet7715.requestExecutionPermissions([{ chainId: baseSepolia.id, to: relayInfo.targetAddress as `0x${string}`, permission: { type: 'erc20-token-periodic' as const, data: { tokenAddress: USDC_ADDRESS, periodAmount: maxAtoms, periodDuration: 86400, justification: `Wifix402 top-up — up to ${option.label} (pay only what you use)` }, isAdjustmentAllowed: false }, expiry: Math.floor(Date.now() / 1000) + option.minutes * 60 + 300 }]);
      const context = granted[0]?.context;
      if (!context) throw new Error('MetaMask did not return permission context');
      const delegations = decodeDelegations(context).map(d => toRelayerJson(d));
      const res = await fetch('/api/topup/delegate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: addr, minutes: option.minutes, delegations, feeCollector: relayInfo.feeCollector, feeAmountAtoms: relayInfo.feeAmountAtoms }) });
      if (!res.ok) throw new Error(`Delegate failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { sessionId: string };
      setTopupStep({ type: 'ready', option, sessionId: data.sessionId });
    } catch (err) {
      setTopupStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [address]);

  const handleStart = useCallback(async (option: TopupOpt, sessionId: string) => {
    setTopupStep({ type: 'starting', option, sessionId });
    try {
      const res402 = await fetch('/api/topup/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      if (res402.status !== 402) throw new Error(`Expected 402 on start, got ${res402.status}`);
      const credential = btoa(JSON.stringify({ sessionId }));
      const res = await fetch('/api/topup/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': credential }, body: JSON.stringify({ sessionId }) });
      if (!res.ok) throw new Error(`Start failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { startTime: number; maxSeconds: number };
      setTopupStep({ type: 'active', option, sessionId, startTime: data.startTime, maxSeconds: data.maxSeconds });
    } catch (err) {
      setTopupStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const handleStop = useCallback(async (sessionId: string, currentElapsed: number) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      const res = await fetch('/api/topup/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      if (!res.ok) throw new Error(`Stop failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { actualSeconds: number; actualChargedUsdc: string; taskId: string };
      setTopupStep({ type: 'stopping', sessionId, actualSeconds: data.actualSeconds, actualUsdc: data.actualChargedUsdc, taskId: data.taskId });
    } catch (err) {
      setTopupStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '-5%', right: '-5%', width: '40vw', height: '40vw', maxWidth: 600, maxHeight: 600, background: 'radial-gradient(ellipse, #bfdbfe 0%, #c7d2fe 50%, transparent 80%)', borderRadius: '60% 40% 55% 45%', filter: 'blur(50px)', opacity: 0.5 }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '-5%', width: '30vw', height: '30vw', maxWidth: 400, maxHeight: 400, background: 'radial-gradient(ellipse, #fed7aa 0%, #fef3c7 60%, transparent 85%)', borderRadius: '45% 55% 50% 50%', filter: 'blur(40px)', opacity: 0.4 }} />
      </div>

      {/* Nav */}
      <nav className="relative z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 md:px-10 h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-xs shadow-sm">W</div>
            <span className="font-bold text-gray-900 tracking-tight">Wifix402</span>
          </Link>
          <div className="flex items-center gap-3">
            {address && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {address.slice(0, 6)}…{address.slice(-4)}
              </div>
            )}
            <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Base Sepolia</span>
          </div>
        </div>
      </nav>

      <div className="relative max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-2">Get WiFi Access</h1>
          <p className="text-gray-400 text-sm">x402 · ERC-7710 · 1Shot relay · USDC on Base · no ETH needed</p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
            <button onClick={() => setTab('plan')} className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === 'plan' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Fixed Plans
            </button>
            <button onClick={() => setTab('topup')} className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === 'topup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Top-Up ✦
            </button>
          </div>
        </div>

        {/* Wallet banner */}
        {address && (
          <div className="mb-6 rounded-2xl bg-white border border-gray-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-gray-400 text-xs mb-1">Connected wallet</div>
              <div className="font-mono text-gray-600 text-xs">{address}</div>
            </div>
            <div className="flex items-center gap-4">
              {usdcBalance !== null && (
                <div className="text-right">
                  <div className="text-gray-400 text-xs mb-1">USDC Balance</div>
                  <div className={`font-bold text-sm ${Number(usdcBalance) > 0 ? 'text-green-600' : 'text-red-500'}`}>{usdcBalance} USDC</div>
                </div>
              )}
              <button onClick={() => address && fetchBalance(address)} className="text-gray-300 hover:text-gray-500 text-sm transition-colors">↻</button>
            </div>
            {usdcBalance !== null && Number(usdcBalance) === 0 && (
              <div className="w-full pt-3 border-t border-gray-100 text-amber-600 text-xs flex items-center gap-2">
                ⚠️ No USDC — get Base Sepolia USDC at{' '}
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-700">faucet.circle.com</a>
              </div>
            )}
          </div>
        )}

        {/* ── PLAN TAB ── */}
        {tab === 'plan' && (
          <div>
            {planStep.type === 'error' && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 text-sm whitespace-pre-wrap">
                <div className="font-bold mb-1">Something went wrong</div>
                {(planStep as Extract<PlanStep, { type: 'error' }>).message}
                <button className="mt-3 block text-xs text-red-400 hover:text-red-600 underline" onClick={() => setPlanStep(address ? { type: 'ready', address } : { type: 'idle' })}>Dismiss</button>
              </div>
            )}

            {planStep.type === 'success' && (() => {
              const s = planStep as Extract<PlanStep, { type: 'success' }>;
              return (
                <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14l6 6 10-10" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="text-xl font-black text-green-700 mb-2">Access Granted</div>
                  <p className="text-green-600/70 text-sm mb-4"><strong>{s.plan.name}</strong> plan is now active. 1Shot relayed your delegation on-chain.</p>
                  {s.txHash && <a href={`https://sepolia.basescan.org/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline text-xs font-mono">View on Basescan →</a>}
                </div>
              );
            })()}

            {planStep.type === 'confirming' && (() => {
              const s = planStep as Extract<PlanStep, { type: 'confirming' }>;
              return (
                <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="font-semibold text-blue-700 text-sm">Waiting for 1Shot relay confirmation…</span>
                  </div>
                  <div className="text-xs text-blue-400 font-mono">TaskId: {s.taskId}</div>
                </div>
              );
            })()}

            {planStep.type === 'purchasing' && (() => {
              const s = planStep as Extract<PlanStep, { type: 'purchasing' }>;
              const idx = PLAN_STAGES.indexOf(s.stage);
              return (
                <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
                  <div className="text-sm font-semibold text-gray-700 mb-5">Purchasing {s.plan.name} · ${s.plan.price_usdc} USDC</div>
                  <div className="space-y-3">
                    {PLAN_STAGES.map((st, i) => (
                      <div key={st} className={`flex items-center gap-3 text-sm transition-all ${i < idx ? 'text-green-600' : i === idx ? 'text-gray-900' : 'text-gray-300'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${i < idx ? 'bg-green-100 text-green-600' : i === idx ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-300'}`}>
                          {i < idx ? '✓' : i + 1}
                        </div>
                        <span>{st}</span>
                        {i === idx && <div className="ml-auto w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {PLANS.map((plan) => {
                const isPurchasing = planStep.type === 'purchasing' && (planStep as Extract<PlanStep, { type: 'purchasing' }>).plan.id === plan.id;
                const isConfirming = planStep.type === 'confirming' && (planStep as Extract<PlanStep, { type: 'confirming' }>).plan.id === plan.id;
                const anyBusy = planStep.type === 'purchasing' || planStep.type === 'confirming';
                const isPopular = 'popular' in plan && plan.popular;

                return (
                  <div key={plan.id} className={`relative rounded-2xl flex flex-col gap-5 p-6 transition-all duration-300 border ${
                    isPopular ? 'bg-gray-900 border-gray-800 shadow-2xl shadow-gray-900/10' : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg'
                  }`}>
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">BEST VALUE</div>
                    )}
                    <div>
                      <div className={`text-xs font-medium uppercase tracking-wider mb-3 ${isPopular ? 'text-gray-400' : 'text-gray-400'}`}>{plan.description}</div>
                      <div className={`text-4xl font-black ${isPopular ? 'text-white' : 'text-gray-900'}`}>${plan.price_usdc}</div>
                      <div className={`text-xs mt-1 ${isPopular ? 'text-gray-500' : 'text-gray-400'}`}>USDC · fixed price</div>
                    </div>
                    <div className={`text-lg font-black ${isPopular ? 'text-white' : 'text-gray-900'}`}>{plan.name}</div>
                    <div className="mt-auto">
                      {isPurchasing || isConfirming ? (
                        <div className={`w-full py-3 rounded-xl text-center text-sm font-semibold animate-pulse ${isPopular ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {isPurchasing ? (planStep as Extract<PlanStep, { type: 'purchasing' }>).stage : 'Confirming…'}
                        </div>
                      ) : planStep.type === 'idle' || planStep.type === 'error' || planStep.type === 'connecting' ? (
                        <button onClick={ensureWallet} disabled={planStep.type === 'connecting'} className={`w-full h-11 font-bold text-sm rounded-full transition-all ${isPopular ? 'bg-white text-gray-900 hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                          {planStep.type === 'connecting' ? 'Connecting…' : 'Connect MetaMask'}
                        </button>
                      ) : (
                        <button onClick={() => handleBuyPlan(plan)} disabled={anyBusy} className={`w-full h-11 font-bold text-sm rounded-full transition-all ${isPopular ? 'bg-white text-gray-900 hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                          Get {plan.name}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TOPUP TAB ── */}
        {tab === 'topup' && (
          <div>
            {topupStep.type === 'error' && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 text-sm whitespace-pre-wrap">
                <div className="font-bold mb-1">Something went wrong</div>
                {(topupStep as Extract<TopupStep, { type: 'error' }>).message}
                <button className="mt-3 block text-xs text-red-400 hover:text-red-600 underline" onClick={() => setTopupStep({ type: address ? 'fetching-relay' : 'idle' })}>Retry</button>
              </div>
            )}

            {/* Explainer */}
            {(topupStep.type === 'idle' || topupStep.type === 'fetching-relay') && (
              <div className="mb-6 rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
                <div className="grid grid-cols-3 gap-4 text-center mb-6">
                  {[
                    { icon: '📋', label: 'Authorize max', sub: 'ERC-7710 delegation' },
                    { icon: '▶', label: 'Start session', sub: 'x402 gate opens' },
                    { icon: '⏹', label: 'Stop & pay', sub: 'Exact amount only' },
                  ].map(({ icon, label, sub }) => (
                    <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                      <div className="text-2xl mb-2">{icon}</div>
                      <div className="text-sm font-bold text-gray-800">{label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
                    </div>
                  ))}
                </div>
                <div className="text-center text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                  Rate: <strong className="text-gray-700">$0.001 USDC/min</strong> · billed to the second · authorize a max, pay only what you use
                </div>
              </div>
            )}

            {topupStep.type === 'idle' && (
              <div className="flex justify-center">
                <button onClick={handleTopupConnect} className="h-12 px-8 bg-gray-900 hover:bg-gray-700 text-white font-bold text-sm rounded-full transition-all shadow-lg hover:-translate-y-0.5">
                  Connect MetaMask to Start
                </button>
              </div>
            )}

            {topupStep.type === 'fetching-relay' && (
              <div className="flex items-center justify-center gap-3 py-10 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <span className="text-sm">Fetching relay info…</span>
              </div>
            )}

            {topupStep.type === 'pick' && (() => {
              const { relayInfo } = topupStep as Extract<TopupStep, { type: 'pick' }>;
              return (
                <div>
                  <div className="text-center mb-6">
                    <div className="text-gray-500 text-sm mb-1">How long do you need?</div>
                    <div className="text-xs text-gray-400">Authorize a max · pay only what you use</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {TOPUP_OPTIONS.map((opt) => (
                      <button key={opt.minutes} onClick={() => handleDelegate(opt, relayInfo)}
                        className="group rounded-2xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-lg hover:shadow-blue-50 p-5 text-center transition-all duration-200 flex flex-col items-center gap-2">
                        <div className="text-2xl font-black text-gray-900">{opt.label}</div>
                        <div className="text-gray-400 text-xs">max ${opt.maxUsdc}</div>
                        <div className="text-blue-400 text-xs group-hover:text-blue-600 transition-colors">$0.001/min →</div>
                      </button>
                    ))}
                  </div>
                  <div className="text-center text-xs text-gray-400">relay fee ~${(Number(relayInfo.feeAmountAtoms) / 1_000_000).toFixed(4)} USDC</div>
                </div>
              );
            })()}

            {topupStep.type === 'delegating' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'delegating' }>;
              return (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center">
                  <div className="w-12 h-12 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto mb-4" />
                  <div className="font-bold text-gray-900 mb-2">Sign in MetaMask</div>
                  <div className="text-gray-500 text-sm">Authorizing up to <strong>{s.option.label}</strong> · max ${s.option.maxUsdc} USDC</div>
                  <div className="text-xs text-gray-300 mt-3">EIP-7715 scoped delegation · no gas needed</div>
                </div>
              );
            })()}

            {topupStep.type === 'ready' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'ready' }>;
              return (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="font-semibold text-green-700 text-sm">Delegation signed — ready</span>
                  </div>
                  <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-6 text-sm space-y-3">
                    {[
                      { label: 'Max duration', value: s.option.label },
                      { label: 'Max charge', value: `$${s.option.maxUsdc} USDC` },
                      { label: 'Rate', value: '$0.001/min · billed per second' },
                      { label: 'You pay', value: 'Only what you use ✓' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-gray-400">{label}</span>
                        <span className="text-gray-900 font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 text-center mb-6">Internet is OFF until you press Start.</div>
                  <button onClick={() => handleStart(s.option, s.sessionId)}
                    className="w-full h-14 bg-gray-900 hover:bg-gray-700 text-white font-black text-base rounded-2xl transition-all shadow-lg hover:-translate-y-0.5">
                    Start Session ▶
                  </button>
                </div>
              );
            })()}

            {topupStep.type === 'starting' && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center">
                <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin mx-auto mb-4" />
                <div className="font-bold text-gray-900 mb-1">Opening x402 gate…</div>
                <div className="text-gray-400 text-sm">Validating delegation · enabling internet access</div>
              </div>
            )}

            {topupStep.type === 'active' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'active' }>;
              const remaining = Math.max(0, s.maxSeconds - elapsed);
              const pct = Math.min(100, (elapsed / s.maxSeconds) * 100);
              const estUsdc = (elapsed * 16 / 1_000_000).toFixed(6);

              return (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                        </span>
                        <span className="text-green-700 font-semibold text-sm">Internet Active</span>
                      </div>
                      <span className="text-xs font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-600">{s.option.label} max</span>
                    </div>

                    <div className="text-center mb-8">
                      <div className="text-7xl font-black font-mono text-gray-900 tracking-tight tabular-nums">{fmt(elapsed)}</div>
                      <div className="text-gray-400 text-sm mt-2">elapsed · {fmt(remaining)} remaining</div>
                    </div>

                    <div className="h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${remaining < 60 ? 'bg-red-500' : remaining < 180 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                    </div>

                    <div className="flex justify-between text-sm mb-8">
                      <span className="text-gray-400">Estimated charge</span>
                      <span className="font-bold text-gray-900">${estUsdc} USDC</span>
                    </div>

                    <button onClick={() => handleStop(s.sessionId, elapsed)}
                      className="w-full h-14 bg-red-600 hover:bg-red-500 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-red-500/20 hover:-translate-y-0.5">
                      Stop & Pay ⏹
                    </button>
                    <div className="text-center text-xs text-gray-400 mt-3">Only charged for time used · 1Shot settles on-chain</div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Rate', value: '$0.001/min' },
                      { label: 'Max charge', value: `$${s.option.maxUsdc}` },
                      { label: 'Protocol', value: 'ERC-7710' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                        <div className="text-gray-400 text-xs mb-1">{label}</div>
                        <div className="text-gray-900 font-semibold text-sm">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {topupStep.type === 'stopping' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'stopping' }>;
              return (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
                  <div className="w-10 h-10 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4" />
                  <div className="font-bold text-amber-800 mb-2">Settling payment…</div>
                  <div className="text-amber-700/70 text-sm mb-4">Used <strong>{fmt(s.actualSeconds)}</strong> · Charging <strong>${s.actualUsdc} USDC</strong></div>
                  <div className="text-xs text-amber-500">1Shot executing delegation on-chain · Internet blocked</div>
                  <div className="text-xs text-amber-400/60 mt-1 font-mono">TaskId: {s.taskId.slice(0, 22)}…</div>
                </div>
              );
            })()}

            {topupStep.type === 'receipt' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'receipt' }>;
              return (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14l6 6 10-10" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="text-xl font-black text-green-700 mb-2">Session Complete</div>
                  <div className="text-green-600/70 text-sm mb-6">Payment settled on-chain · Internet access ended</div>

                  <div className="bg-white rounded-xl border border-green-100 p-5 text-left space-y-3 text-sm mb-6">
                    {[
                      { label: 'Time used', value: fmt(s.actualSeconds), bold: true },
                      { label: 'Charged', value: `$${s.actualUsdc} USDC`, color: 'text-green-600' },
                      { label: 'Protocol', value: 'x402 + ERC-7710 + 1Shot', color: 'text-gray-400' },
                    ].map(({ label, value, bold, color }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-gray-400">{label}</span>
                        <span className={`font-semibold ${color ?? 'text-gray-900'} ${bold ? 'font-mono' : ''}`}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {s.txHash && (
                    <a href={`https://sepolia.basescan.org/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-700 underline text-xs font-mono mb-6">
                      View tx on Basescan →
                    </a>
                  )}
                  <button onClick={handleTopupConnect} className="bg-gray-900 hover:bg-gray-700 text-white font-bold text-sm px-8 py-3 rounded-full transition-all">
                    Start Another Session
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* How it works footer */}
        <div className="mt-10 rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-5">
            {tab === 'topup' ? 'Top-up: how ERC-7710 variable charging works' : 'How payment works'}
          </div>
          <div className={`grid gap-4 ${tab === 'topup' ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
            {(tab === 'plan' ? [
              { icon: '🦊', label: 'Connect MetaMask', sub: 'EIP-7715 permission' },
              { icon: '📋', label: 'x402 handshake', sub: '402 → relay info' },
              { icon: '✍️', label: 'Sign delegation', sub: 'ERC-7710 scoped' },
              { icon: '🛸', label: '1Shot confirms', sub: 'Gasless on-chain' },
            ] : [
              { icon: '✍️', label: 'Sign delegation', sub: 'Authorize max USDC' },
              { icon: '💾', label: 'Server stores it', sub: 'Not executed yet' },
              { icon: '▶', label: 'x402 start gate', sub: 'Credential proves auth' },
              { icon: '⏱', label: 'Use internet', sub: 'Timer runs live' },
              { icon: '🛸', label: '1Shot settles', sub: 'Exact amount only' },
            ]).map(({ icon, label, sub }) => (
              <div key={label} className="text-center">
                <div className="text-2xl mb-2">{icon}</div>
                <div className="text-gray-700 text-xs font-semibold">{label}</div>
                <div className="text-gray-400 text-xs mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
