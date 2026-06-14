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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function atomsToUsdc(atoms: string | number | bigint) {
  return (Number(atoms) / 1_000_000).toFixed(4);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BuyPage() {
  const [tab, setTab] = useState<'plan' | 'topup'>('plan');
  const [address, setAddress] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);

  const [planStep, setPlanStep] = useState<PlanStep>({ type: 'idle' });
  const [topupStep, setTopupStep] = useState<TopupStep>({ type: 'idle' });

  // Live elapsed timer for active top-up
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restore wallet connection on mount ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    window.ethereum.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) {
          setAddress(list[0]);
          setPlanStep({ type: 'ready', address: list[0] });
        }
      }).catch(() => {});
  }, []);

  // ── Live timer for active topup ─────────────────────────────────────────────
  useEffect(() => {
    if (topupStep.type === 'active') {
      const { startTime } = topupStep;
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [topupStep.type]);

  // Auto-stop when max time reached
  useEffect(() => {
    if (topupStep.type !== 'active') return;
    const { maxSeconds, startTime, sessionId } = topupStep;
    if (elapsed >= maxSeconds) {
      handleStop(sessionId, elapsed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, topupStep.type]);

  // ── Poll plan-purchase relayer status ───────────────────────────────────────
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
        if (code === 200) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setPlanStep({ type: 'success', plan, sessionId, txHash });
        } else if (code === 400 || code === 500) {
          clearInterval(pollRef.current!); pollRef.current = null;
          setPlanStep({ type: 'error', message: `1Shot relay failed (${code}). Please try again.` });
        }
      } catch { /* keep polling */ }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [planStep]);

  // ── Poll topup stop confirmation ─────────────────────────────────────────────
  useEffect(() => {
    if (topupStep.type !== 'stopping') return;
    const { sessionId, actualSeconds, actualUsdc } = topupStep;
    // Poll every 5s — status endpoint calls 1Shot directly each time (no webhook needed)
    const stopPoll = setInterval(async () => {
      try {
        const res = await fetch(`/api/topup/status/${sessionId}`);
        const d = await res.json() as { state?: string; transactionHash?: string; actualChargedUsdc?: string };
        if (d.state === 'stopped') {
          clearInterval(stopPoll);
          setTopupStep({
            type: 'receipt',
            sessionId,
            actualSeconds,
            actualUsdc: d.actualChargedUsdc ?? actualUsdc,
            txHash: d.transactionHash ?? null,
          });
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(stopPoll);
  }, [topupStep]);

  // ── Utils ───────────────────────────────────────────────────────────────────
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
    if (!window.ethereum) {
      setPlanStep({ type: 'error', message: 'MetaMask not found. Install at metamask.io' });
      return null;
    }
    setPlanStep({ type: 'connecting' });
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const addr = accounts[0];
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
      } catch (e: unknown) {
        if ((e as { code?: number }).code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: CHAIN_ID_HEX, chainName: 'Base Sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://sepolia.base.org'], blockExplorerUrls: ['https://sepolia-explorer.base.org'] }],
          });
        }
      }
      setAddress(addr);
      setPlanStep({ type: 'ready', address: addr });
      fetchBalance(addr);
      return addr;
    } catch (err) {
      setPlanStep({ type: 'error', message: err instanceof Error ? err.message : 'Failed to connect' });
      return null;
    }
  }, [address, fetchBalance]);

  // ── Plan purchase ───────────────────────────────────────────────────────────
  const handleBuyPlan = useCallback(async (plan: Plan) => {
    const addr = await ensureWallet();
    if (!addr) return;

    const stage = (s: PurchaseStage) => setPlanStep({ type: 'purchasing', plan, stage: s });

    try {
      stage('Checking USDC balance...');
      const pc = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
      const rawBalance = await pc.readContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'balanceOf', args: [addr as `0x${string}`],
      }).catch(() => 0n) as bigint;
      setUsdcBalance((Number(rawBalance) / 1_000_000).toFixed(4));

      stage('Fetching relay info...');
      const res402 = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, wallet: addr }),
      });
      if (res402.status !== 402) throw new Error(`Expected 402, got ${res402.status}`);

      const header = res402.headers.get('payment-required');
      if (!header) throw new Error('No PAYMENT-REQUIRED header');
      const paymentRequired = JSON.parse(atob(header)) as {
        x402Version: number;
        accepts: Array<{ extra?: { targetAddress?: string; feeCollector?: string; feeAmount?: string } }>;
      };
      const extra = paymentRequired.accepts[0]?.extra ?? {};
      const { targetAddress, feeCollector, feeAmount } = extra;
      if (!targetAddress || !feeCollector || !feeAmount) throw new Error('Server 402 missing relay info');

      const totalNeeded = BigInt(plan.price_units) + BigInt(feeAmount);
      if (rawBalance < totalNeeded) {
        throw new Error(`Insufficient USDC.\nHave: ${(Number(rawBalance) / 1e6).toFixed(4)}\nNeed: ${(Number(totalNeeded) / 1e6).toFixed(4)}\n\nGet Base Sepolia USDC at faucet.circle.com`);
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
        payload: { delegations, delegator: addr, feeCollector, feeAmount },
      }));

      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': paymentSig },
        body: JSON.stringify({ planId: plan.id, wallet: addr }),
      });
      if (!res.ok) throw new Error(`Purchase failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { taskId?: string; sessionId?: string };

      stage('Waiting for confirmation...');
      setPlanStep({ type: 'confirming', plan, taskId: data.taskId ?? '', sessionId: data.sessionId });
    } catch (err) {
      console.error('[Plan/buy]', err);
      setPlanStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [ensureWallet]);

  // ── Top-Up: fetch relay info ─────────────────────────────────────────────────
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

  // ── Top-Up: sign delegation for chosen duration ──────────────────────────────
  const handleDelegate = useCallback(async (option: TopupOpt, relayInfo: RelayInfo) => {
    const addr = address;
    if (!addr || !window.ethereum) return;
    setTopupStep({ type: 'delegating', option, relayInfo });

    try {
      const wc = createWalletClient({ chain: baseSepolia, transport: custom(window.ethereum!) });
      const wallet7715 = wc.extend(erc7715ProviderActions());

      // Max amount = wifi cost + relay fee (user will only be charged actual usage ≤ this)
      const maxAtoms = BigInt(option.maxAtoms) + BigInt(relayInfo.feeAmountAtoms);

      const granted = await wallet7715.requestExecutionPermissions([{
        chainId: baseSepolia.id,
        to: relayInfo.targetAddress as `0x${string}`,
        permission: {
          type: 'erc20-token-periodic' as const,
          data: {
            tokenAddress: USDC_ADDRESS,
            periodAmount: maxAtoms,
            periodDuration: 86400,
            justification: `Wifix402 top-up — up to ${option.label} WiFi access (pay only what you use)`,
          },
          isAdjustmentAllowed: false,
        },
        expiry: Math.floor(Date.now() / 1000) + option.minutes * 60 + 300, // max duration + 5 min buffer
      }]);

      const context = granted[0]?.context;
      if (!context) throw new Error('MetaMask did not return permission context');
      const delegations = decodeDelegations(context).map(d => toRelayerJson(d));

      // Store delegation on server
      const res = await fetch('/api/topup/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: addr,
          minutes: option.minutes,
          delegations,
          feeCollector: relayInfo.feeCollector,
          feeAmountAtoms: relayInfo.feeAmountAtoms,
        }),
      });
      if (!res.ok) throw new Error(`Delegate failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { sessionId: string };

      setTopupStep({ type: 'ready', option, sessionId: data.sessionId });
    } catch (err) {
      console.error('[Topup/delegate]', err);
      setTopupStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [address]);

  // ── Top-Up: start session (x402 flow) ───────────────────────────────────────
  const handleStart = useCallback(async (option: TopupOpt, sessionId: string) => {
    setTopupStep({ type: 'starting', option, sessionId });
    try {
      // First hit → 402
      const res402 = await fetch('/api/topup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (res402.status !== 402) throw new Error(`Expected 402 on start, got ${res402.status}`);

      // Second hit → send credential
      const credential = btoa(JSON.stringify({ sessionId }));
      const res = await fetch('/api/topup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': credential },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error(`Start failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { startTime: number; maxSeconds: number };

      setTopupStep({ type: 'active', option, sessionId, startTime: data.startTime, maxSeconds: data.maxSeconds });
    } catch (err) {
      console.error('[Topup/start]', err);
      setTopupStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // ── Top-Up: stop session ─────────────────────────────────────────────────────
  const handleStop = useCallback(async (sessionId: string, currentElapsed: number) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      const res = await fetch('/api/topup/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error(`Stop failed (${res.status}): ${await res.text()}`);
      const data = await res.json() as { actualSeconds: number; actualChargedUsdc: string; taskId: string };
      setTopupStep({
        type: 'stopping',
        sessionId,
        actualSeconds: data.actualSeconds,
        actualUsdc: data.actualChargedUsdc,
        taskId: data.taskId,
      });
    } catch (err) {
      console.error('[Topup/stop]', err);
      setTopupStep({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  const isTopupErr = topupStep.type === 'error';
  const isPlanErr = planStep.type === 'error';

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
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Get WiFi Access</h1>
          <p className="text-white/40 text-sm">x402 · ERC-7710 delegation · 1Shot relay · USDC on Base</p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex bg-white/5 border border-white/8 rounded-2xl p-1 gap-1">
            <button
              onClick={() => setTab('plan')}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === 'plan' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:text-white/70'}`}
            >
              Fixed Plans
            </button>
            <button
              onClick={() => setTab('topup')}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === 'topup' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:text-white/70'}`}
            >
              Top-Up ✦
            </button>
          </div>
        </div>

        {/* Wallet info */}
        {address && (
          <div className="mb-8 rounded-2xl border border-white/8 bg-white/3 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-white/30 text-xs mb-1">Connected wallet</div>
              <div className="font-mono text-white/60 text-xs">{address}</div>
            </div>
            <div className="flex items-center gap-4">
              {usdcBalance !== null && (
                <div className="text-right">
                  <div className="text-white/30 text-xs mb-1">USDC Balance</div>
                  <div className={`font-bold text-sm ${Number(usdcBalance) > 0 ? 'text-green-400' : 'text-red-400'}`}>{usdcBalance} USDC</div>
                </div>
              )}
              <button onClick={() => address && fetchBalance(address)} className="text-white/20 hover:text-white/50 text-xs transition-colors">↻</button>
            </div>
            {usdcBalance !== null && Number(usdcBalance) === 0 && (
              <div className="w-full pt-3 border-t border-white/5 text-yellow-400/80 text-xs flex items-center gap-2">
                ⚠️ Get Base Sepolia USDC at{' '}
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-300">faucet.circle.com</a>
              </div>
            )}
          </div>
        )}

        {/* ── PLAN TAB ──────────────────────────────────────────────────────── */}
        {tab === 'plan' && (
          <div>
            {isPlanErr && (
              <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-950/20 p-5 text-red-300 text-sm whitespace-pre-wrap">
                <div className="font-bold mb-1 text-red-400">Something went wrong</div>
                {(planStep as Extract<PlanStep, { type: 'error' }>).message}
                <button className="mt-3 block text-xs text-red-400/60 hover:text-red-300 underline"
                  onClick={() => setPlanStep(address ? { type: 'ready', address } : { type: 'idle' })}>
                  Dismiss
                </button>
              </div>
            )}

            {planStep.type === 'success' && (() => {
              const s = planStep as Extract<PlanStep, { type: 'success' }>;
              return (
                <div className="mb-6 rounded-2xl border border-green-500/20 bg-green-950/20 p-8 text-center">
                  <div className="text-5xl mb-4">{s.plan.emoji}</div>
                  <div className="text-2xl font-black text-green-400 mb-2">Access Granted!</div>
                  <p className="text-white/50 mb-4"><strong className="text-white">{s.plan.name}</strong> is now active.</p>
                  {s.txHash && (
                    <a href={`https://sepolia.basescan.org/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline text-xs font-mono">
                      View tx on Basescan →
                    </a>
                  )}
                </div>
              );
            })()}

            {planStep.type === 'confirming' && (() => {
              const s = planStep as Extract<PlanStep, { type: 'confirming' }>;
              return (
                <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-950/15 p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    <span className="font-semibold text-blue-300">Waiting for 1Shot relay…</span>
                  </div>
                  <div className="text-xs text-white/30 font-mono">TaskId: {s.taskId}</div>
                </div>
              );
            })()}

            {planStep.type === 'purchasing' && (() => {
              const s = planStep as Extract<PlanStep, { type: 'purchasing' }>;
              const idx = PLAN_STAGES.indexOf(s.stage);
              return (
                <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-950/15 p-6">
                  <div className="text-sm font-semibold text-blue-300 mb-5">Purchasing {s.plan.name} · ${s.plan.price_usdc} USDC</div>
                  <div className="space-y-3">
                    {PLAN_STAGES.map((st, i) => (
                      <div key={st} className={`flex items-center gap-3 text-sm transition-all ${i < idx ? 'text-green-400' : i === idx ? 'text-white' : 'text-white/20'}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border text-xs font-bold ${i < idx ? 'border-green-500 bg-green-500/20 text-green-400' : i === idx ? 'border-blue-400 bg-blue-500/20 text-blue-400' : 'border-white/10 text-white/20'}`}>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {PLANS.map((plan) => {
                const isPurchasing = planStep.type === 'purchasing' && (planStep as Extract<PlanStep, { type: 'purchasing' }>).plan.id === plan.id;
                const isConfirming = planStep.type === 'confirming' && (planStep as Extract<PlanStep, { type: 'confirming' }>).plan.id === plan.id;
                const anyBusy = planStep.type === 'purchasing' || planStep.type === 'confirming';
                const isPopular = 'popular' in plan && plan.popular;

                return (
                  <Card key={plan.id} className={`relative rounded-2xl flex flex-col gap-5 p-6 transition-all duration-300 ${isPopular ? 'bg-blue-600/12 border-blue-500/35 shadow-lg shadow-blue-500/10' : 'bg-white/3 border-white/8 hover:border-white/15 hover:bg-white/5'}`}>
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">BEST VALUE</div>
                    )}
                    <div className="flex items-start justify-between">
                      <span className="text-4xl">{plan.emoji}</span>
                      {isPopular && <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">Popular</Badge>}
                    </div>
                    <div>
                      <div className="text-xl font-black">{plan.name}</div>
                      <div className="text-white/40 text-sm mt-1">{plan.description}</div>
                    </div>
                    <div className="mt-auto">
                      <div className="text-3xl font-black">${plan.price_usdc}</div>
                      <div className="text-white/25 text-xs mt-1">USDC · fixed price</div>
                    </div>
                    <Separator className="bg-white/5" />
                    {isPurchasing || isConfirming ? (
                      <div className="w-full py-3 rounded-xl text-center text-sm font-semibold animate-pulse bg-blue-900/40 text-blue-400">
                        {isPurchasing ? (planStep as Extract<PlanStep, { type: 'purchasing' }>).stage : 'Confirming…'}
                      </div>
                    ) : planStep.type === 'idle' || planStep.type === 'error' || planStep.type === 'connecting' ? (
                      <Button onClick={ensureWallet} disabled={planStep.type === 'connecting'} className="w-full bg-white text-slate-900 hover:bg-blue-50 font-bold rounded-xl h-11">
                        {planStep.type === 'connecting' ? 'Connecting…' : 'Connect MetaMask'}
                      </Button>
                    ) : (
                      <Button onClick={() => handleBuyPlan(plan)} disabled={anyBusy}
                        className={`w-full font-bold rounded-xl h-11 ${isPopular ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/8 hover:bg-white/15 text-white border border-white/10'}`}>
                        Buy {plan.name}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TOPUP TAB ─────────────────────────────────────────────────────── */}
        {tab === 'topup' && (
          <div>
            {isTopupErr && (
              <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-950/20 p-5 text-red-300 text-sm whitespace-pre-wrap">
                <div className="font-bold mb-1 text-red-400">Something went wrong</div>
                {(topupStep as Extract<TopupStep, { type: 'error' }>).message}
                <button className="mt-3 block text-xs text-red-400/60 hover:text-red-300 underline"
                  onClick={() => setTopupStep({ type: address ? 'fetching-relay' : 'idle' })}>
                  Retry
                </button>
              </div>
            )}

            {/* Explain top-up */}
            {(topupStep.type === 'idle' || topupStep.type === 'fetching-relay') && (
              <div className="mb-8 rounded-2xl border border-white/8 bg-white/2 p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-xl flex-shrink-0">⚡</div>
                  <div>
                    <div className="font-bold text-white mb-1">Pay only for what you use</div>
                    <div className="text-white/50 text-sm">Authorize a max amount. Start when ready. Stop whenever. 1Shot settles the exact amount on-chain — powered by ERC-7710 scoped delegation.</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  {[
                    { icon: '📋', label: 'Authorize max', sub: 'ERC-7710 delegation' },
                    { icon: '▶', label: 'Start session', sub: 'x402 gate opens' },
                    { icon: '⏹', label: 'Stop & pay', sub: 'Exact amount only' },
                  ].map(({ icon, label, sub }) => (
                    <div key={label} className="rounded-xl border border-white/5 bg-white/3 p-3">
                      <div className="text-xl mb-1.5">{icon}</div>
                      <div className="text-white/70 font-semibold">{label}</div>
                      <div className="text-white/30 mt-0.5">{sub}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 text-xs text-white/30 text-center">
                  Rate: $0.001 USDC/min · billed to the second · no subscription
                </div>
              </div>
            )}

            {/* IDLE — connect wallet */}
            {topupStep.type === 'idle' && (
              <div className="flex justify-center">
                <Button onClick={handleTopupConnect} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-xl h-12 text-base">
                  Connect MetaMask to Start
                </Button>
              </div>
            )}

            {/* FETCHING RELAY */}
            {topupStep.type === 'fetching-relay' && (
              <div className="flex items-center justify-center gap-3 py-8 text-white/40">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Fetching relay info from 1Shot…
              </div>
            )}

            {/* PICK duration */}
            {topupStep.type === 'pick' && (() => {
              const { relayInfo } = topupStep as Extract<TopupStep, { type: 'pick' }>;
              return (
                <div>
                  <div className="text-center mb-6">
                    <div className="text-white/50 text-sm mb-1">How long do you need?</div>
                    <div className="text-xs text-white/25">Authorize a max, pay only what you use</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {TOPUP_OPTIONS.map((opt) => (
                      <button
                        key={opt.minutes}
                        onClick={() => handleDelegate(opt, relayInfo)}
                        className="group rounded-2xl border border-white/10 bg-white/3 hover:border-blue-500/40 hover:bg-blue-600/10 p-5 text-center transition-all duration-200 flex flex-col items-center gap-2"
                      >
                        <div className="text-2xl font-black text-white">{opt.label}</div>
                        <div className="text-white/40 text-xs">max ${opt.maxUsdc}</div>
                        <div className="text-blue-400/60 text-xs group-hover:text-blue-400 transition-colors">$0.001/min</div>
                      </button>
                    ))}
                  </div>
                  <div className="text-center text-xs text-white/20">
                    relay fee ~{atomsToUsdc(relayInfo.feeAmountAtoms)} USDC · authorize in MetaMask next
                  </div>
                </div>
              );
            })()}

            {/* DELEGATING */}
            {topupStep.type === 'delegating' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'delegating' }>;
              return (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-950/15 p-8 text-center">
                  <div className="w-12 h-12 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <div className="font-bold text-blue-300 mb-2">Sign in MetaMask</div>
                  <div className="text-white/40 text-sm mb-4">Authorizing up to <strong className="text-white">{s.option.label}</strong> · max ${s.option.maxUsdc} USDC</div>
                  <div className="text-xs text-white/20">EIP-7715 scoped delegation · no gas needed</div>
                </div>
              );
            })()}

            {/* READY — delegated, waiting to start */}
            {topupStep.type === 'ready' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'ready' }>;
              return (
                <div className="rounded-2xl border border-green-500/20 bg-green-950/15 p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                    <span className="font-bold text-green-300">Delegation signed — ready to go</span>
                  </div>
                  <div className="bg-white/3 border border-white/8 rounded-xl p-4 mb-6 text-sm space-y-2">
                    <div className="flex justify-between text-white/50">
                      <span>Max duration</span>
                      <span className="text-white font-semibold">{s.option.label}</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                      <span>Max charge</span>
                      <span className="text-white font-semibold">${s.option.maxUsdc} USDC</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                      <span>Rate</span>
                      <span className="text-white/70">$0.001/min · billed to the second</span>
                    </div>
                    <div className="flex justify-between text-white/50">
                      <span>Actual charge</span>
                      <span className="text-green-400 font-semibold">Only what you use ✓</span>
                    </div>
                  </div>
                  <div className="text-xs text-white/25 mb-6 text-center">Internet off until you press Start. Press Stop any time to settle.</div>
                  <Button
                    onClick={() => handleStart(s.option, s.sessionId)}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-black rounded-xl h-14 text-lg shadow-lg shadow-green-500/20"
                  >
                    Start Session ▶
                  </Button>
                </div>
              );
            })()}

            {/* STARTING */}
            {topupStep.type === 'starting' && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-950/15 p-8 text-center">
                <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <div className="text-blue-300 font-bold">Opening x402 gate…</div>
                <div className="text-white/30 text-xs mt-2">Validating delegation credential · enabling internet access</div>
              </div>
            )}

            {/* ACTIVE — live timer */}
            {topupStep.type === 'active' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'active' }>;
              const remaining = Math.max(0, s.maxSeconds - elapsed);
              const pct = Math.min(100, (elapsed / s.maxSeconds) * 100);
              const estimatedAtoms = BigInt(elapsed) * 1n; // 1 atom/sec placeholder shown as USDC
              const estimatedUsdc = (elapsed * Number(16n) / 1_000_000).toFixed(6); // 16 atoms/sec
              const estUsdc = (elapsed * 16 / 1_000_000).toFixed(6);

              return (
                <div className="space-y-4">
                  {/* Main timer card */}
                  <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-green-300 font-semibold text-sm">Internet Active</span>
                      </div>
                      <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">{s.option.label} max</Badge>
                    </div>

                    {/* Big timer */}
                    <div className="text-center mb-6">
                      <div className="text-6xl md:text-7xl font-black font-mono text-white tracking-tight">{fmt(elapsed)}</div>
                      <div className="text-white/30 text-sm mt-2">elapsed · {fmt(remaining)} remaining</div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 bg-white/8 rounded-full mb-4 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${remaining < 60 ? 'bg-red-500' : remaining < 180 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Live cost estimate */}
                    <div className="flex justify-between items-center text-sm mb-6">
                      <span className="text-white/40">Estimated charge so far</span>
                      <span className="font-bold text-white">${estUsdc} <span className="text-white/40 font-normal">USDC</span></span>
                    </div>

                    {/* Stop button */}
                    <Button
                      onClick={() => handleStop(s.sessionId, elapsed)}
                      className="w-full bg-red-600 hover:bg-red-500 text-white font-black rounded-xl h-14 text-lg shadow-lg shadow-red-500/20"
                    >
                      Stop & Pay ⏹
                    </Button>
                    <div className="text-center text-xs text-white/20 mt-3">
                      Only charged for time used · 1Shot settles on-chain
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Rate', value: '$0.001/min' },
                      { label: 'Max charge', value: `$${s.option.maxUsdc}` },
                      { label: 'Protocol', value: 'ERC-7710' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-white/5 bg-white/2 p-3 text-center">
                        <div className="text-white/30 text-xs mb-1">{label}</div>
                        <div className="text-white font-semibold text-sm">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* STOPPING */}
            {topupStep.type === 'stopping' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'stopping' }>;
              return (
                <div className="rounded-2xl border border-yellow-500/20 bg-yellow-950/15 p-8 text-center">
                  <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <div className="font-bold text-yellow-300 mb-2">Settling payment…</div>
                  <div className="text-white/50 text-sm mb-4">
                    Used <strong className="text-white">{fmt(s.actualSeconds)}</strong> · Charging <strong className="text-white">${s.actualUsdc} USDC</strong>
                  </div>
                  <div className="text-xs text-white/20">1Shot executing delegation on-chain · Internet blocked</div>
                  <div className="text-xs text-white/15 mt-1">TaskId: {s.taskId}</div>
                </div>
              );
            })()}

            {/* RECEIPT */}
            {topupStep.type === 'receipt' && (() => {
              const s = topupStep as Extract<TopupStep, { type: 'receipt' }>;
              return (
                <div className="rounded-2xl border border-green-500/20 bg-green-950/15 p-8 text-center">
                  <div className="text-5xl mb-4">✅</div>
                  <div className="text-2xl font-black text-green-400 mb-2">Session Complete</div>
                  <div className="text-white/50 mb-6">Internet access ended · payment settled on-chain</div>

                  <div className="bg-white/4 border border-white/8 rounded-2xl p-5 text-left space-y-3 mb-6 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/40">Time used</span>
                      <span className="text-white font-bold font-mono">{fmt(s.actualSeconds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Charged</span>
                      <span className="text-green-400 font-bold">${s.actualUsdc} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Protocol</span>
                      <span className="text-white/60">x402 + ERC-7710 + 1Shot</span>
                    </div>
                  </div>

                  {s.txHash && (
                    <a href={`https://sepolia.basescan.org/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="block text-blue-400 hover:text-blue-300 underline text-xs font-mono mb-6">
                      View tx on Basescan →
                    </a>
                  )}

                  <Button
                    onClick={() => { fetchBalance(address!); setTopupStep({ type: 'fetching-relay' }); handleTopupConnect(); }}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl px-8"
                  >
                    Start Another Session
                  </Button>
                </div>
              );
            })()}
          </div>
        )}

        {/* How it works footer */}
        <div className="mt-10 rounded-2xl border border-white/5 bg-white/2 p-6">
          <div className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-5">
            {tab === 'topup' ? 'How top-up works (ERC-7710 delegation)' : 'How payment works'}
          </div>
          {tab === 'plan' ? (
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
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { icon: '✍️', label: 'Sign delegation', sub: 'Authorize max USDC' },
                { icon: '💾', label: 'Server stores it', sub: 'Not executed yet' },
                { icon: '▶', label: 'x402 start gate', sub: 'Credential proves auth' },
                { icon: '⏱', label: 'Use internet', sub: 'Timer runs live' },
                { icon: '🛸', label: '1Shot settles', sub: 'Exact amount only' },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="text-center">
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="text-white/70 text-xs font-semibold">{label}</div>
                  <div className="text-white/25 text-xs mt-0.5">{sub}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
