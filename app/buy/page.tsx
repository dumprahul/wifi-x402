'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPublicClient, http, createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { PLANS, USDC_ADDRESS, CHAIN_ID_HEX, TOPUP_OPTIONS } from '@/utils/constants';
import { toRelayerJson } from '@/utils/relayer';

const Aurora = dynamic(() => import('@/components/Aurora'), { ssr: false });

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

// ── Reusable glass card ───────────────────────────────────────────────────────

function GlassCard({ children, className = '', glow = false }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={`relative rounded-3xl bg-white/55 backdrop-blur-2xl border border-white/70 shadow-xl ${glow ? 'shadow-violet-200/40' : 'shadow-gray-200/30'} ${className}`}>
      {glow && <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-50/40 via-transparent to-cyan-50/30 pointer-events-none" />}
      <div className="relative">{children}</div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 20, color = 'border-gray-700' }: { size?: number; color?: string }) {
  return (
    <div
      className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`}
      style={{ width: size, height: size }}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuyPage() {
  const [tab, setTab] = useState<'plan' | 'topup'>('plan');
  const [address, setAddress] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const [planStep, setPlanStep] = useState<PlanStep>({ type: 'idle' });
  const [topupStep, setTopupStep] = useState<TopupStep>({ type: 'idle' });

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

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
      const pc = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
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
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_ID_HEX, chainName: 'Base', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }] });
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
      const pc = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
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
      if (rawBalance < totalNeeded) throw new Error(`Insufficient USDC.\nHave: ${(Number(rawBalance) / 1e6).toFixed(4)}\nNeed: ${(Number(totalNeeded) / 1e6).toFixed(4)}\n\nGet Base USDC from a DEX or bridge at bridge.base.org`);

      stage('Sign permission in MetaMask...');
      const wc = createWalletClient({ chain: base, transport: custom(window.ethereum!) });
      const wallet7715 = wc.extend(erc7715ProviderActions());
      const granted = await wallet7715.requestExecutionPermissions([{ chainId: base.id, to: targetAddress as `0x${string}`, permission: { type: 'erc20-token-periodic' as const, data: { tokenAddress: USDC_ADDRESS, periodAmount: BigInt(plan.price_units) + BigInt(feeAmount), periodDuration: 86400, justification: `Wifix402 — ${plan.name} WiFi access` }, isAdjustmentAllowed: true }, expiry: Math.floor(Date.now() / 1000) + 600 }]);
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
      const wc = createWalletClient({ chain: base, transport: custom(window.ethereum!) });
      const wallet7715 = wc.extend(erc7715ProviderActions());
      const maxAtoms = BigInt(option.maxAtoms) + BigInt(relayInfo.feeAmountAtoms);
      const granted = await wallet7715.requestExecutionPermissions([{ chainId: base.id, to: relayInfo.targetAddress as `0x${string}`, permission: { type: 'erc20-token-periodic' as const, data: { tokenAddress: USDC_ADDRESS, periodAmount: maxAtoms, periodDuration: 86400, justification: `Wifix402 top-up — up to ${option.label} (pay only what you use)` }, isAdjustmentAllowed: false }, expiry: Math.floor(Date.now() / 1000) + option.minutes * 60 + 300 }]);
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
    <div className="min-h-screen bg-[#f4f6ff] text-gray-900 overflow-x-hidden">

      {/* ── SAME AURORA BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] left-[10%] w-[600px] h-[500px] rounded-full bg-violet-400/25 blur-[120px] animate-float" />
          <div className="absolute top-[20%] right-[5%] w-[500px] h-[400px] rounded-full bg-cyan-400/20 blur-[100px] animate-float" style={{ animationDelay: '1.5s' }} />
          <div className="absolute bottom-[10%] left-[30%] w-[700px] h-[350px] rounded-full bg-fuchsia-400/18 blur-[130px] animate-float" style={{ animationDelay: '3s' }} />
          <div className="absolute top-[50%] left-[-5%] w-[400px] h-[400px] rounded-full bg-blue-400/15 blur-[90px] animate-float" style={{ animationDelay: '2s' }} />
        </div>
        <Aurora colorStops={['#7c3aed', '#06b6d4', '#a855f7']} amplitude={1.4} blend={0.7} speed={0.5} />
        <div className="absolute inset-0 bg-white/65" />
      </div>

      {/* ── SAME FLOATING PILL NAVBAR ── */}
      <div className="fixed top-5 left-0 right-0 z-50 flex justify-center px-4">
        <motion.nav
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className={`flex items-center gap-6 px-6 rounded-full border transition-all duration-500 ${
            scrolled
              ? 'bg-white/60 backdrop-blur-3xl border-white/70 shadow-2xl shadow-purple-200/30'
              : 'bg-white/35 backdrop-blur-2xl border-white/50 shadow-xl shadow-violet-100/25'
          }`}
          style={{ height: '52px' }}
        >
          <Link href="/" className="flex items-center flex-shrink-0">
            <span className="font-black text-black tracking-tight text-sm">Wifix402</span>
          </Link>

          <div className="w-px h-5 bg-gray-200/80" />

          <div className="hidden md:flex items-center gap-5 text-xs font-semibold text-black/70">
            <Link href="/#how-it-works" className="hover:text-black transition-colors">How it works</Link>
            <Link href="/#features" className="hover:text-black transition-colors">Features</Link>
            <Link href="/#pricing" className="hover:text-black transition-colors">Pricing</Link>
          </div>

          <div className="hidden md:block w-px h-5 bg-gray-200/80" />

          {address ? (
            <div className="flex items-center gap-2 text-xs font-mono text-black/60 bg-white/60 px-3 py-1.5 rounded-full border border-white/80 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {address.slice(0, 6)}…{address.slice(-4)}
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={ensureWallet}
              className="h-8 px-4 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-full transition-colors shadow-md flex items-center gap-1.5 flex-shrink-0"
            >
              Connect
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5h6M5 2l3 3-3 3"/></svg>
            </motion.button>
          )}
        </motion.nav>
      </div>

      {/* ── PAGE CONTENT ── */}
      <div className="relative z-10 pt-28 pb-20 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">

          {/* Page header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-200/80 bg-white/60 backdrop-blur-md text-violet-600 text-[11px] font-bold tracking-widest mb-5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              x402 · ERC-7710 · 1SHOT RELAYER · BASE MAINNET
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-black tracking-tight mb-3">Get WiFi Access</h1>
            <p className="text-gray-500 text-sm">Sign once with MetaMask. No gas. No login. Pay only what you use.</p>
          </motion.div>

          {/* Wallet balance bar */}
          <AnimatePresence>
            {address && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6"
              >
                {/* Slim pill wallet bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 rounded-2xl bg-white/40 backdrop-blur-2xl border border-white/60 shadow-lg shadow-gray-200/20">
                  <div className="flex items-center gap-3">
                    {/* Animated status dot */}
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                    </span>
                    <span className="font-mono text-gray-600 text-xs">{address.slice(0, 6)}…{address.slice(-4)}</span>
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50/80 px-2.5 py-1 rounded-full border border-blue-100/60">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4"/></svg>
                      Base
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {usdcBalance !== null ? (
                      <div className={`flex items-center gap-1.5 text-sm font-black ${Number(usdcBalance) > 0 ? 'text-gray-900' : 'text-red-500'}`}>
                        <span className="text-[10px] font-semibold text-gray-400">USDC</span>
                        {usdcBalance}
                      </div>
                    ) : (
                      <button onClick={() => fetchBalance(address)} className="text-xs text-violet-600 font-semibold hover:text-violet-800 transition-colors">
                        Load balance
                      </button>
                    )}
                    <button onClick={() => address && fetchBalance(address)} className="w-6 h-6 rounded-full bg-white/70 border border-gray-200/60 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center text-xs">↻</button>
                  </div>
                </div>
                {usdcBalance !== null && Number(usdcBalance) === 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 px-4 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200/60 text-amber-700 text-xs flex items-center gap-2">
                    <span>⚠</span>
                    <span>No USDC on Base — bridge at </span>
                    <a href="https://bridge.base.org" target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-amber-800">bridge.base.org</a>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── TAB SWITCHER ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex items-center justify-center mb-8"
          >
            <div className="flex bg-white/50 backdrop-blur-xl rounded-full p-1.5 border border-white/70 shadow-lg shadow-gray-200/30 gap-1">
              {(['plan', 'topup'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative px-7 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${
                    tab === t ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {t === 'plan' ? 'Fixed Plans' : 'Top-Up ✦'}
                </button>
              ))}
            </div>
          </motion.div>

          {/* ── PLAN TAB ── */}
          <AnimatePresence mode="wait">
            {tab === 'plan' && (
              <motion.div key="plan" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>

                {/* Error */}
                {planStep.type === 'error' && (
                  <GlassCard className="mb-6 p-5 border-red-200/60">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-red-500 text-sm">✕</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-red-700 mb-1 text-sm">Something went wrong</div>
                        <div className="text-red-600/70 text-xs whitespace-pre-wrap">{(planStep as Extract<PlanStep, { type: 'error' }>).message}</div>
                        <button className="mt-3 text-xs text-red-400 hover:text-red-600 underline" onClick={() => setPlanStep(address ? { type: 'ready', address } : { type: 'idle' })}>Dismiss</button>
                      </div>
                    </div>
                  </GlassCard>
                )}

                {/* Success */}
                {planStep.type === 'success' && (() => {
                  const s = planStep as Extract<PlanStep, { type: 'success' }>;
                  return (
                    <GlassCard className="mb-6 p-10 text-center" glow>
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="w-16 h-16 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-green-200/50">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14l6 6 10-10" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </motion.div>
                      <div className="text-2xl font-black text-gray-900 mb-2">Access Granted</div>
                      <p className="text-gray-500 text-sm mb-5"><strong className="text-gray-800">{s.plan.name}</strong> plan active · 1Shot relayed your delegation on-chain</p>
                      {s.txHash && <a href={`https://basescan.org/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-mono bg-blue-50 px-4 py-2 rounded-full border border-blue-100 transition-colors">View on Basescan ↗</a>}
                    </GlassCard>
                  );
                })()}

                {/* Confirming */}
                {planStep.type === 'confirming' && (() => {
                  const s = planStep as Extract<PlanStep, { type: 'confirming' }>;
                  return (
                    <GlassCard className="mb-6 p-6 border-blue-200/40">
                      <div className="flex items-center gap-3 mb-2">
                        <Spinner color="border-blue-500" />
                        <span className="font-semibold text-blue-700 text-sm">Waiting for 1Shot relay confirmation…</span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono pl-9">TaskId: {s.taskId}</div>
                    </GlassCard>
                  );
                })()}

                {/* Purchasing progress */}
                {planStep.type === 'purchasing' && (() => {
                  const s = planStep as Extract<PlanStep, { type: 'purchasing' }>;
                  const idx = PLAN_STAGES.indexOf(s.stage);
                  return (
                    <GlassCard className="mb-6 p-7">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">
                        Purchasing {s.plan.name} · ${s.plan.price_usdc} USDC
                      </div>
                      <div className="space-y-4">
                        {PLAN_STAGES.map((st, i) => (
                          <div key={st} className={`flex items-center gap-4 transition-all ${i < idx ? 'opacity-60' : i === idx ? 'opacity-100' : 'opacity-25'}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${
                              i < idx ? 'bg-green-500 text-white' : i === idx ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'
                            }`}>
                              {i < idx ? '✓' : i + 1}
                            </div>
                            <span className={`text-sm font-medium flex-1 ${i === idx ? 'text-gray-900' : 'text-gray-500'}`}>{st}</span>
                            {i === idx && <Spinner size={16} color="border-gray-500" />}
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  );
                })()}

                {/* Plan cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {PLANS.map((plan, i) => {
                    const isPurchasing = planStep.type === 'purchasing' && (planStep as Extract<PlanStep, { type: 'purchasing' }>).plan.id === plan.id;
                    const isConfirming = planStep.type === 'confirming' && (planStep as Extract<PlanStep, { type: 'confirming' }>).plan.id === plan.id;
                    const anyBusy = planStep.type === 'purchasing' || planStep.type === 'confirming';
                    const isPopular = 'popular' in plan && plan.popular;
                    const needsWallet = planStep.type === 'idle' || planStep.type === 'error' || planStep.type === 'connecting';

                    // Per-card accent palette
                    const accents = [
                      { pill: 'bg-sky-100 text-sky-600', icon: '#0ea5e9', glow: 'rgba(14,165,233,0.12)', border: 'hover:border-sky-300/60', btnHover: 'hover:bg-sky-900' },
                      { pill: 'bg-violet-100 text-violet-600', icon: '#7c3aed', glow: 'rgba(124,58,237,0.13)', border: 'hover:border-violet-300/60', btnHover: 'hover:bg-violet-900' },
                      { pill: 'bg-emerald-100 text-emerald-600', icon: '#10b981', glow: 'rgba(16,185,129,0.12)', border: 'hover:border-emerald-300/60', btnHover: '' },
                    ][i] ?? { pill: 'bg-gray-100 text-gray-600', icon: '#6b7280', glow: 'transparent', border: '', btnHover: '' };

                    const planIcons = [
                      // 1 Hour — lightning
                      <svg key="h" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M10.5 2L4 10h6l-2.5 6 8-9h-6l1-5z" stroke={accents.icon} strokeWidth="1.6" strokeLinejoin="round"/></svg>,
                      // 1 Day — sun
                      <svg key="d" width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="3.5" stroke={accents.icon} strokeWidth="1.6"/><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M4.2 13.8l1.4-1.4M12.4 5.6l1.4-1.4" stroke={accents.icon} strokeWidth="1.5" strokeLinecap="round"/></svg>,
                      // 1 Week — star/rocket
                      <svg key="w" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2c0 0 4 3 4 7.5S9 16 9 16s-4-2.5-4-6.5S9 2 9 2z" stroke={accents.icon} strokeWidth="1.6"/><circle cx="9" cy="9" r="2" stroke={accents.icon} strokeWidth="1.5"/></svg>,
                    ];

                    return (
                      <motion.div key={plan.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.09, duration: 0.45, ease: [0.22,1,0.36,1] }}
                        className="h-full">
                        {isPopular ? (
                          // Featured dark card
                          <div className="relative rounded-3xl overflow-hidden flex flex-col p-7 gap-5 h-full"
                            style={{ background: 'linear-gradient(145deg,#0f0f1a 0%,#1a0a2e 50%,#0a1628 100%)', border: '1px solid rgba(124,58,237,0.35)', boxShadow: '0 25px 60px -10px rgba(124,58,237,0.25), 0 0 0 1px rgba(255,255,255,0.05) inset' }}>
                            {/* Glow orb */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full blur-3xl pointer-events-none" style={{ background: 'radial-gradient(ellipse,rgba(139,92,246,0.4) 0%,transparent 70%)' }} />
                            {/* Best value badge */}
                            <div className="absolute -top-px left-1/2 -translate-x-1/2">
                              <div className="px-5 py-1 text-[10px] font-black tracking-widest text-white rounded-b-2xl" style={{ background: 'linear-gradient(90deg,#7c3aed,#06b6d4)' }}>BEST VALUE</div>
                            </div>
                            {/* Icon */}
                            <div className="relative mt-3 w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                              {planIcons[i]}
                            </div>
                            {/* Price */}
                            <div className="relative">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{plan.description}</div>
                              <div className="text-6xl font-black text-white leading-none" style={{ letterSpacing: '-0.03em' }}>${plan.price_usdc}</div>
                              <div className="text-xs text-gray-600 mt-1.5">USDC · one-time · no recurring</div>
                            </div>
                            <div className="relative text-2xl font-black text-white">{plan.name}</div>
                            {/* Features */}
                            <div className="relative space-y-1.5 flex-1">
                              {['Full speed access', 'x402 + ERC-7710', 'Gasless 1Shot relay'].map(f => (
                                <div key={f} className="flex items-center gap-2 text-xs text-gray-400">
                                  <span className="w-4 h-4 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-[9px]">✓</span>
                                  {f}
                                </div>
                              ))}
                            </div>
                            <div className="relative">
                              {isPurchasing || isConfirming ? (
                                <div className="w-full py-3.5 rounded-2xl text-center text-sm font-bold bg-white/10 text-white/50 animate-pulse flex items-center justify-center gap-2">
                                  <Spinner size={14} color="border-white/40" />
                                  {isPurchasing ? 'Processing…' : 'Confirming…'}
                                </div>
                              ) : needsWallet ? (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                  onClick={ensureWallet} disabled={planStep.type === 'connecting'}
                                  className="w-full h-12 font-black text-sm rounded-2xl transition-all shadow-xl text-white"
                                  style={{ background: 'linear-gradient(90deg,#7c3aed,#06b6d4)' }}>
                                  {planStep.type === 'connecting' ? 'Connecting…' : 'Connect MetaMask'}
                                </motion.button>
                              ) : (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                  onClick={() => handleBuyPlan(plan)} disabled={anyBusy}
                                  className="w-full h-12 font-black text-sm rounded-2xl transition-all shadow-xl text-white"
                                  style={{ background: 'linear-gradient(90deg,#7c3aed,#06b6d4)' }}>
                                  Get {plan.name}
                                </motion.button>
                              )}
                            </div>
                          </div>
                        ) : (
                          // Regular glass card
                          <motion.div whileHover={{ y: -4, boxShadow: `0 20px 50px -10px ${accents.glow}` }} transition={{ duration: 0.25 }}
                            className={`relative rounded-3xl bg-white/50 backdrop-blur-2xl border border-white/70 p-7 flex flex-col gap-5 h-full group cursor-default transition-colors duration-300 ${accents.border}`}
                            style={{ boxShadow: '0 4px 24px -4px rgba(0,0,0,0.06)' }}>
                            {/* Subtle top-left glow on hover */}
                            <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                              style={{ background: `radial-gradient(ellipse at 20% 20%, ${accents.glow} 0%, transparent 60%)` }} />
                            {/* Icon pill */}
                            <div className="relative flex items-center justify-between">
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${accents.pill} bg-opacity-60`}
                                style={{ background: `${accents.glow}` }}>
                                {planIcons[i]}
                              </div>
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${accents.pill}`}>{plan.description}</span>
                            </div>
                            {/* Price */}
                            <div className="relative">
                              <div className="text-6xl font-black text-gray-900 leading-none" style={{ letterSpacing: '-0.03em' }}>${plan.price_usdc}</div>
                              <div className="text-xs text-gray-400 mt-1.5">USDC · one-time · no recurring</div>
                            </div>
                            <div className="relative text-2xl font-black text-gray-800">{plan.name}</div>
                            {/* Features */}
                            <div className="relative space-y-1.5 flex-1">
                              {['Full speed access', 'x402 + ERC-7710', 'Gasless 1Shot relay'].map(f => (
                                <div key={f} className="flex items-center gap-2 text-xs text-gray-400">
                                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${accents.pill}`}>✓</span>
                                  {f}
                                </div>
                              ))}
                            </div>
                            <div className="relative mt-auto">
                              {isPurchasing || isConfirming ? (
                                <div className="w-full py-3.5 rounded-2xl text-center text-sm font-bold bg-gray-100 text-gray-400 animate-pulse flex items-center justify-center gap-2">
                                  <Spinner size={14} color="border-gray-400" />
                                  {isPurchasing ? 'Processing…' : 'Confirming…'}
                                </div>
                              ) : needsWallet ? (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                  onClick={ensureWallet} disabled={planStep.type === 'connecting'}
                                  className={`w-full h-12 bg-gray-900 text-white font-black text-sm rounded-2xl transition-all ${accents.btnHover}`}>
                                  {planStep.type === 'connecting' ? 'Connecting…' : 'Connect MetaMask'}
                                </motion.button>
                              ) : (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                  onClick={() => handleBuyPlan(plan)} disabled={anyBusy}
                                  className={`w-full h-12 bg-gray-900 text-white font-black text-sm rounded-2xl transition-all ${accents.btnHover}`}>
                                  Get {plan.name}
                                </motion.button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Protocol footer */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { tag: 'ERC-7710', step: '01', label: 'Sign delegation', sub: 'MetaMask issues a scoped permission via EIP-7715 — no private key, no raw transfer.' },
                    { tag: 'x402', step: '02', label: 'HTTP 402 gate', sub: 'Server responds 402. Your signed delegation is the payment credential — no checkout.' },
                    { tag: '1Shot', step: '03', label: 'Gasless relay', sub: '1Shot submits the delegation on-chain. Confirmed in seconds. Zero ETH from you.' },
                  ].map(({ tag, step, label, sub }) => (
                    <div key={step} className="relative rounded-2xl bg-white/50 backdrop-blur-xl border border-white/70 p-5 overflow-hidden hover:shadow-lg hover:border-gray-300/60 transition-all duration-300">
                      <div className="absolute top-0 right-0 px-3 py-1 text-[9px] font-black tracking-widest rounded-bl-2xl rounded-tr-2xl bg-gray-100 text-gray-600">{tag}</div>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white mb-4 bg-gray-900">{step}</div>
                      <div className="font-black text-gray-900 text-sm mb-1.5">{label}</div>
                      <div className="text-gray-400 text-[11px] leading-relaxed">{sub}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── TOPUP TAB ── */}
            {tab === 'topup' && (
              <motion.div key="topup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>

                {topupStep.type === 'error' && (
                  <GlassCard className="mb-6 p-5 border-red-200/60">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-500 text-sm">✕</span>
                      </div>
                      <div>
                        <div className="font-bold text-red-700 mb-1 text-sm">Something went wrong</div>
                        <div className="text-red-600/70 text-xs whitespace-pre-wrap">{(topupStep as Extract<TopupStep, { type: 'error' }>).message}</div>
                        <button className="mt-3 text-xs text-red-400 hover:text-red-600 underline" onClick={() => setTopupStep({ type: address ? 'fetching-relay' : 'idle' })}>Retry</button>
                      </div>
                    </div>
                  </GlassCard>
                )}

                {/* Idle / intro */}
                {(topupStep.type === 'idle' || topupStep.type === 'fetching-relay') && (
                  <div className="space-y-4">
                    {/* Explainer cards */}
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      {[
                        { n: '01', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="7" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, label: 'Authorize max', sub: 'ERC-7710 delegation · sign once', color: 'violet' },
                        { n: '02', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9h6M9 6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, label: 'Start session', sub: 'x402 gate opens · IP whitelisted', color: 'cyan' },
                        { n: '03', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, label: 'Stop & pay', sub: 'Exact seconds · never overcharged', color: 'fuchsia' },
                      ].map(({ n, icon, label, sub, color }) => (
                        <GlassCard key={n} className={`p-5 text-center border-${color}-100/40`} glow>
                          <div className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-${color}-50 text-${color}-500 shadow-sm`}>{icon}</div>
                          <div className="text-xs font-black text-gray-800 mb-1">{label}</div>
                          <div className="text-[10px] text-gray-400 leading-relaxed">{sub}</div>
                        </GlassCard>
                      ))}
                    </div>

                    <GlassCard className="p-4 flex items-center justify-between">
                      <div className="text-xs text-gray-500">Rate: <strong className="text-gray-800 font-black">$0.001 / min</strong> · billed per second · zero overpay</div>
                      <div className="text-[10px] text-violet-500 font-bold bg-violet-50 px-3 py-1 rounded-full border border-violet-100">ERC-7710</div>
                    </GlassCard>

                    {topupStep.type === 'idle' ? (
                      <motion.button
                        whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                        onClick={handleTopupConnect}
                        className="w-full h-14 bg-black hover:bg-gray-800 text-white font-black text-base rounded-2xl transition-all shadow-xl shadow-black/15 flex items-center justify-center gap-3"
                      >
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L2 6v6l7 4 7-4V6L9 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
                        Connect MetaMask to Start
                      </motion.button>
                    ) : (
                      <div className="flex items-center justify-center gap-3 py-6 text-gray-400">
                        <Spinner color="border-gray-400" />
                        <span className="text-sm">Fetching relay info…</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Pick duration */}
                {topupStep.type === 'pick' && (() => {
                  const { relayInfo } = topupStep as Extract<TopupStep, { type: 'pick' }>;
                  return (
                    <div className="space-y-4">
                      <div className="text-center mb-2">
                        <div className="text-lg font-black text-gray-900">How long do you need?</div>
                        <div className="text-xs text-gray-400 mt-1">Authorize a max · start when ready · pay only what you use</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {TOPUP_OPTIONS.map((opt, i) => (
                          <motion.button
                            key={opt.minutes}
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                            whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                            onClick={() => handleDelegate(opt, relayInfo)}
                            className="group relative rounded-3xl bg-white/55 backdrop-blur-xl border border-white/70 hover:border-violet-300/60 hover:shadow-xl hover:shadow-violet-100/40 p-7 text-left transition-all duration-300 overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-violet-50/0 to-cyan-50/0 group-hover:from-violet-50/50 group-hover:to-cyan-50/30 transition-all duration-300 rounded-3xl pointer-events-none" />
                            <div className="relative">
                              <div className="text-4xl font-black text-gray-900 mb-1 group-hover:text-violet-700 transition-colors">{opt.label}</div>
                              <div className="text-sm text-gray-400 mb-4">max <span className="font-bold text-gray-700">${opt.maxUsdc}</span> USDC</div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 bg-gray-100/80 px-2.5 py-1 rounded-full font-mono">$0.001/min</span>
                                <span className="text-gray-300 group-hover:text-violet-400 transition-colors text-lg">→</span>
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                      <div className="text-center text-[10px] text-gray-400 font-mono">
                        relay fee ~${(Number(relayInfo.feeAmountAtoms) / 1_000_000).toFixed(4)} USDC
                      </div>
                    </div>
                  );
                })()}

                {/* Delegating — sign in MetaMask */}
                {topupStep.type === 'delegating' && (() => {
                  const s = topupStep as Extract<TopupStep, { type: 'delegating' }>;
                  return (
                    <GlassCard className="p-12 text-center" glow>
                      <div className="relative w-16 h-16 mx-auto mb-6">
                        <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
                        <div className="absolute inset-2 rounded-full bg-violet-50 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="9" width="14" height="9" rx="2" stroke="#7c3aed" strokeWidth="1.8"/><path d="M7 9V7a3 3 0 016 0v2" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round"/></svg>
                        </div>
                      </div>
                      <div className="font-black text-gray-900 text-xl mb-2">Sign in MetaMask</div>
                      <div className="text-gray-500 text-sm mb-1">Authorizing up to <strong className="text-gray-800">{s.option.label}</strong></div>
                      <div className="text-gray-400 text-sm">max <strong>${s.option.maxUsdc}</strong> USDC · EIP-7715 scoped delegation</div>
                      <div className="mt-5 text-[10px] text-gray-300 font-mono">no gas needed · 1Shot relays on-chain</div>
                    </GlassCard>
                  );
                })()}

                {/* Ready to start */}
                {topupStep.type === 'ready' && (() => {
                  const s = topupStep as Extract<TopupStep, { type: 'ready' }>;
                  return (
                    <GlassCard className="p-8" glow>
                      <div className="flex items-center gap-2 mb-7">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                        </span>
                        <span className="font-black text-green-700 text-sm">Delegation signed — ready to start</span>
                      </div>

                      <div className="rounded-2xl bg-white/50 border border-gray-100/80 p-5 mb-7 space-y-3">
                        {[
                          { label: 'Max duration', value: s.option.label },
                          { label: 'Max charge', value: `$${s.option.maxUsdc} USDC` },
                          { label: 'Rate', value: '$0.001/min · billed per second' },
                          { label: 'You pay', value: 'Only what you use ✓' },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">{label}</span>
                            <span className="text-gray-900 font-bold text-sm">{value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="text-center text-xs text-gray-400 mb-5">Internet is <strong>OFF</strong> until you press Start.</div>

                      <motion.button
                        whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                        onClick={() => handleStart(s.option, s.sessionId)}
                        className="w-full h-16 bg-black hover:bg-gray-800 text-white font-black text-lg rounded-2xl transition-all shadow-xl shadow-black/15 flex items-center justify-center gap-3"
                      >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><polygon points="6,4 16,10 6,16" fill="currentColor"/></svg>
                        Start Session
                      </motion.button>
                    </GlassCard>
                  );
                })()}

                {/* Starting */}
                {topupStep.type === 'starting' && (
                  <GlassCard className="p-12 text-center" glow>
                    <div className="relative w-16 h-16 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-cyan-100" />
                      <div className="absolute inset-0 rounded-full border-4 border-t-cyan-500 animate-spin" />
                    </div>
                    <div className="font-black text-gray-900 text-xl mb-2">Opening x402 gate…</div>
                    <div className="text-gray-500 text-sm">Validating delegation · enabling internet access</div>
                  </GlassCard>
                )}

                {/* Active */}
                {topupStep.type === 'active' && (() => {
                  const s = topupStep as Extract<TopupStep, { type: 'active' }>;
                  const remaining = Math.max(0, s.maxSeconds - elapsed);
                  const pct = Math.min(100, (elapsed / s.maxSeconds) * 100);
                  const estUsdc = (elapsed * 16 / 1_000_000).toFixed(6);
                  const isLow = remaining < 60;
                  const isMed = remaining < 180;

                  return (
                    <div className="space-y-4">
                      <GlassCard className="p-8 overflow-hidden" glow>
                        {/* Active indicator */}
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                            </span>
                            <span className="text-green-700 font-black text-sm">Internet Active</span>
                          </div>
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/70 border border-gray-100 text-gray-600">{s.option.label} max</span>
                        </div>

                        {/* Giant timer */}
                        <div className="text-center mb-8">
                          <motion.div
                            key={elapsed}
                            className={`text-8xl font-black font-mono tracking-tighter tabular-nums ${isLow ? 'text-red-600' : 'text-gray-900'}`}
                          >
                            {fmt(elapsed)}
                          </motion.div>
                          <div className="text-gray-400 text-sm mt-2">
                            {fmt(remaining)} remaining
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-2 bg-gray-100 rounded-full mb-5 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${isLow ? 'bg-red-500' : isMed ? 'bg-amber-400' : 'bg-gradient-to-r from-violet-500 to-cyan-500'}`}
                            style={{ width: `${pct}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>

                        {/* Cost */}
                        <div className="flex justify-between items-center text-sm mb-8 bg-white/40 rounded-2xl p-4 border border-white/60">
                          <span className="text-gray-500">Estimated charge</span>
                          <span className="font-black text-gray-900 font-mono">${estUsdc} <span className="font-normal text-gray-400 text-xs">USDC</span></span>
                        </div>

                        {/* Stop button */}
                        <motion.button
                          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                          onClick={() => handleStop(s.sessionId, elapsed)}
                          className="w-full h-16 bg-red-600 hover:bg-red-500 text-white font-black text-lg rounded-2xl transition-all shadow-xl shadow-red-500/25 flex items-center justify-center gap-3"
                        >
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="4" y="4" width="10" height="10" rx="2" fill="currentColor"/></svg>
                          Stop & Pay
                        </motion.button>
                        <div className="text-center text-[11px] text-gray-400 mt-3">Only charged for time used · 1Shot settles on-chain</div>
                      </GlassCard>

                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Rate', value: '$0.001/min' },
                          { label: 'Max charge', value: `$${s.option.maxUsdc}` },
                          { label: 'Protocol', value: 'ERC-7710' },
                        ].map(({ label, value }) => (
                          <GlassCard key={label} className="p-4 text-center">
                            <div className="text-gray-400 text-[10px] mb-1.5 uppercase tracking-wider font-semibold">{label}</div>
                            <div className="text-gray-900 font-black text-sm">{value}</div>
                          </GlassCard>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Stopping */}
                {topupStep.type === 'stopping' && (() => {
                  const s = topupStep as Extract<TopupStep, { type: 'stopping' }>;
                  return (
                    <GlassCard className="p-12 text-center border-amber-200/50">
                      <div className="relative w-16 h-16 mx-auto mb-6">
                        <div className="absolute inset-0 rounded-full border-4 border-amber-100" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-amber-500 animate-spin" />
                        <div className="absolute inset-2 rounded-full bg-amber-50 flex items-center justify-center">
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3v6l4 2.5" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round"/><circle cx="9" cy="9" r="7" stroke="#d97706" strokeWidth="1.5"/></svg>
                        </div>
                      </div>
                      <div className="font-black text-gray-900 text-xl mb-2">Settling payment…</div>
                      <div className="text-gray-500 text-sm mb-4">
                        Used <strong className="text-gray-800">{fmt(s.actualSeconds)}</strong> · Charging <strong className="text-gray-800">${s.actualUsdc} USDC</strong>
                      </div>
                      <div className="text-xs text-amber-600 bg-amber-50 px-4 py-2 rounded-full inline-block border border-amber-100">1Shot executing delegation on-chain</div>
                      <div className="text-[10px] text-gray-300 mt-3 font-mono">TaskId: {s.taskId.slice(0, 22)}…</div>
                    </GlassCard>
                  );
                })()}

                {/* Receipt */}
                {topupStep.type === 'receipt' && (() => {
                  const s = topupStep as Extract<TopupStep, { type: 'receipt' }>;
                  return (
                    <GlassCard className="p-10 text-center" glow>
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="w-16 h-16 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-green-200/50">
                        <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14l6 6 10-10" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </motion.div>
                      <div className="text-2xl font-black text-gray-900 mb-2">Session Complete</div>
                      <div className="text-gray-500 text-sm mb-7">Payment settled on-chain · Internet access ended</div>

                      <div className="rounded-2xl bg-white/60 border border-gray-100/80 p-5 text-left space-y-3 mb-6">
                        {[
                          { label: 'Time used', value: fmt(s.actualSeconds), mono: true },
                          { label: 'Charged', value: `$${s.actualUsdc} USDC`, green: true },
                          { label: 'Protocol', value: 'x402 + ERC-7710 + 1Shot', small: true },
                        ].map(({ label, value, mono, green, small }) => (
                          <div key={label} className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">{label}</span>
                            <span className={`font-bold text-sm ${green ? 'text-green-600' : 'text-gray-900'} ${mono ? 'font-mono' : ''} ${small ? 'text-xs text-gray-400 font-normal' : ''}`}>{value}</span>
                          </div>
                        ))}
                      </div>

                      {s.txHash && (
                        <a href={`https://basescan.org/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-xs font-mono bg-blue-50 px-4 py-2 rounded-full border border-blue-100 transition-colors mb-6">
                          View tx on Basescan ↗
                        </a>
                      )}

                      <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={handleTopupConnect}
                        className="w-full h-12 bg-black hover:bg-gray-800 text-white font-bold text-sm rounded-2xl transition-all">
                        Start Another Session
                      </motion.button>
                    </GlassCard>
                  );
                })()}

                {/* Protocol steps footer */}
                {(topupStep.type === 'idle' || topupStep.type === 'fetching-relay' || topupStep.type === 'pick') && (
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {[
                      { tag: 'ERC-7710', step: '01', label: 'Sign delegation', sub: 'Authorize a max spend cap in MetaMask — never executed until you stop.' },
                      { tag: 'x402', step: '02', label: 'Start session', sub: 'Server issues an HTTP 402 gate. Your credential opens it — IP whitelisted instantly.' },
                      { tag: '1Shot', step: '03', label: 'Stop & settle', sub: 'Relayer executes on-chain for exact seconds used. Zero gas from you.' },
                    ].map(({ tag, step, label, sub }) => (
                      <div key={step} className="relative rounded-2xl bg-white/50 backdrop-blur-xl border border-white/70 p-5 overflow-hidden hover:shadow-lg hover:border-gray-300/60 transition-all duration-300">
                        <div className="absolute top-0 right-0 px-3 py-1 text-[9px] font-black tracking-widest rounded-bl-2xl rounded-tr-2xl bg-gray-100 text-gray-600">{tag}</div>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white mb-4 bg-gray-900">{step}</div>
                        <div className="font-black text-gray-900 text-sm mb-1.5">{label}</div>
                        <div className="text-gray-400 text-[11px] leading-relaxed">{sub}</div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
