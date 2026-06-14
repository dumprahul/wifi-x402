'use client';

import { useState } from 'react';
import { PLANS } from '@/utils/constants';

type Step =
  | { type: 'idle' }
  | { type: 'requesting_permission' }
  | { type: 'sending_402' }
  | { type: 'sending_payment'; taskId?: string }
  | { type: 'success'; taskId: string; plan: typeof PLANS[number]; txSimulated?: boolean }
  | { type: 'error'; message: string };

export default function Home() {
  const [step, setStep] = useState<Step>({ type: 'idle' });
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[number] | null>(null);

  async function handleBuy(plan: typeof PLANS[number]) {
    setSelectedPlan(plan);

    try {
      // ── Step 1: Request ERC-7715 permissions via MetaMask ────────────────
      setStep({ type: 'requesting_permission' });

      const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!eth) throw new Error('MetaMask not found. Please install MetaMask.');

      // Switch to Base Sepolia
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x14a34' }] });
      } catch (switchErr: unknown) {
        // Chain not added yet — add it
        if ((switchErr as { code?: number })?.code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x14a34',
              chainName: 'Base Sepolia',
              rpcUrls: ['https://sepolia.base.org'],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            }],
          });
        }
      }

      const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[];
      const wallet = accounts[0];

      const expiryTimestamp = Math.floor(Date.now() / 1000) + plan.duration_seconds;

      // wallet_grantPermissions (ERC-7715) — MetaMask Smart Accounts Kit
      let permissionsContext: unknown;
      try {
        permissionsContext = await eth.request({
          method: 'wallet_grantPermissions',
          params: [{
            permissions: [{
              type: 'erc20-token-transfer',
              data: {
                address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC Base Sepolia
                allowance: plan.price_usdc,
              },
              required: true,
            }],
            expiry: expiryTimestamp,
            signer: {
              type: 'account',
              data: { id: wallet },
            },
          }],
        });
        console.log('[ERC-7715] Permissions granted:', permissionsContext);
      } catch (permErr: unknown) {
        // MetaMask may not support ERC-7715 yet — fall back to raw delegation stub
        console.warn('[ERC-7715] wallet_grantPermissions not supported, using delegation stub:', permErr);
        permissionsContext = {
          delegator: wallet,
          delegate: '0x0000000000000000000000000000000000000001',
          authority: {
            chainId: String(84532),
            caveats: [
              {
                type: 'erc20-token-transfer',
                value: {
                  token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                  allowance: plan.price_usdc,
                },
              },
              { type: 'expiry', value: expiryTimestamp },
            ],
          },
          signature: '0x',
        };
      }

      // ── Step 2: First POST → expect 402 ──────────────────────────────────
      setStep({ type: 'sending_402' });

      const res1 = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, wallet }),
      });

      if (res1.status !== 402) {
        const d = await res1.json();
        throw new Error(d.error || `Expected 402, got ${res1.status}`);
      }
      const paymentReq = await res1.json();
      console.log('[x402] 402 received:', paymentReq);

      // ── Step 3: Re-POST with X-Payment delegation ─────────────────────────
      setStep({ type: 'sending_payment' });

      const res2 = await fetch('/api/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment': JSON.stringify(permissionsContext),
        },
        body: JSON.stringify({ planId: plan.id, wallet }),
      });

      const result = await res2.json();
      if (!res2.ok && !result.success) throw new Error(result.error || 'Purchase failed');

      console.log('[x402] Success:', result);
      setStep({ type: 'success', taskId: result.taskId, plan, txSimulated: result.simulated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStep({ type: 'error', message: msg });
    }
  }

  function reset() {
    setStep({ type: 'idle' });
    setSelectedPlan(null);
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step.type === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-teal-900 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white/10 backdrop-blur rounded-3xl p-8 text-center border border-white/20 shadow-2xl">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-3xl font-bold text-white mb-2">Access Granted!</h2>
          <p className="text-emerald-200 mb-6">
            {step.plan.name} WiFi access · {step.plan.price_usdc} USDC
          </p>

          <div className="bg-black/30 rounded-2xl p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Plan</span>
              <span className="text-white font-medium">{step.plan.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Paid</span>
              <span className="text-green-300 font-medium">{step.plan.price_usdc} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Network</span>
              <span className="text-white">Base Sepolia</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Task ID</span>
              <span className="text-white font-mono text-xs truncate max-w-[140px]">{step.taskId}</span>
            </div>
            {step.txSimulated && (
              <div className="text-yellow-400 text-xs mt-2">⚠ Simulated (relayer not reachable in dev)</div>
            )}
          </div>

          <div className="text-xs text-emerald-300 mb-6 space-y-1">
            <div>ERC-7710 delegation submitted via 1Shot relayer</div>
            <div>Gas paid in USDC · No ETH needed</div>
          </div>

          <button
            onClick={reset}
            className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 rounded-2xl transition-colors"
          >
            Buy Another Plan
          </button>
        </div>
      </div>
    );
  }

  // ── Error screen ──────────────────────────────────────────────────────────
  if (step.type === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-red-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white/10 backdrop-blur rounded-3xl p-8 text-center border border-white/20">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-white mb-3">Something went wrong</h2>
          <p className="text-red-200 text-sm mb-6 bg-black/30 rounded-xl p-3 font-mono">{step.message}</p>
          <button onClick={reset} className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 rounded-2xl transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  const loadingMessages = {
    requesting_permission: { icon: '🔐', text: 'Requesting ERC-7715 permission in MetaMask…', sub: 'Approve the delegation in your wallet' },
    sending_402: { icon: '📡', text: 'Initiating x402 payment flow…', sub: 'Sending payment request' },
    sending_payment: { icon: '⚡', text: 'Submitting via 1Shot relayer…', sub: 'Gas paid in USDC · ERC-7710 delegation' },
  };

  const stepType = step.type;
  const isLoading = stepType === 'requesting_permission' || stepType === 'sending_402' || stepType === 'sending_payment';
  const loadingInfo = isLoading ? loadingMessages[stepType] : null;

  // ── Main plans page ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-1.5 mb-4">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-blue-300 text-xs font-medium">Base Sepolia Testnet</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">📡 Wifix402</h1>
          <p className="text-blue-200 text-lg">Pay-per-session WiFi access</p>
          <p className="text-slate-500 text-sm mt-1">x402 · ERC-7710 · 1Shot Relayer · No ETH needed</p>
        </div>

        {/* Plans */}
        <div className="space-y-3 mb-8">
          {PLANS.map(plan => {
            const isSelected = selectedPlan?.id === plan.id && isLoading;
            return (
              <button
                key={plan.id}
                onClick={() => !isLoading && handleBuy(plan)}
                disabled={isLoading}
                className={`w-full rounded-2xl p-5 flex items-center gap-4 transition-all text-left relative
                  ${isSelected
                    ? 'bg-blue-600/40 border-2 border-blue-400 shadow-lg shadow-blue-500/20'
                    : 'bg-white/8 border border-white/15 hover:bg-white/15 hover:border-white/30'
                  }
                  ${isLoading && !isSelected ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {'popular' in plan && plan.popular && (
                  <span className="absolute -top-2.5 right-4 bg-blue-500 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                    POPULAR
                  </span>
                )}

                <span className="text-3xl">{plan.emoji}</span>

                <div className="flex-1">
                  <div className="text-white font-semibold text-lg">{plan.name}</div>
                  <div className="text-slate-400 text-sm">{plan.description}</div>
                </div>

                <div className="text-right">
                  <div className="text-blue-300 font-bold text-xl">{plan.price_usdc}</div>
                  <div className="text-slate-500 text-xs">USDC</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Loading overlay card */}
        {loadingInfo && (
          <div className="bg-blue-900/40 border border-blue-400/30 rounded-2xl p-5 mb-6 flex items-center gap-4">
            <div className="text-3xl animate-pulse">{loadingInfo.icon}</div>
            <div>
              <div className="text-white font-medium">{loadingInfo.text}</div>
              <div className="text-blue-300 text-sm">{loadingInfo.sub}</div>
            </div>
          </div>
        )}

        {/* How it works */}
        {!isLoading && (
          <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-3">How it works</p>
            <div className="space-y-2.5">
              {[
                ['🔐', 'MetaMask grants ERC-7715 delegation permission'],
                ['📡', 'x402: POST → 402 → re-POST with X-Payment header'],
                ['⚡', '1Shot relayer submits ERC-7710 tx, gas paid in USDC'],
                ['✅', 'Access granted — no ETH, no subscriptions'],
              ].map(([icon, text]) => (
                <div key={text} className="flex items-center gap-3 text-sm text-slate-300">
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
