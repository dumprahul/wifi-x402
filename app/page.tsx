'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const FEATURES = [
  {
    icon: '⚡',
    title: 'x402 Payment Protocol',
    desc: 'HTTP 402 native payments. No checkout, no redirect. The server returns a payment requirement; your wallet signs it in seconds.',
    tag: 'RFC-standard',
  },
  {
    icon: '🔑',
    title: 'ERC-7710 Delegation',
    desc: 'MetaMask signs a scoped delegation — not a raw transaction. Caveats enforce exact amount, target, and expiry at the contract level.',
    tag: 'EIP-7715',
  },
  {
    icon: '🛸',
    title: '1Shot Permissionless Relay',
    desc: 'No gas wallet needed. 1Shot relayer redeems your delegation on-chain, pays the gas, and notifies via webhook when confirmed.',
    tag: 'Gasless',
  },
  {
    icon: '🔥',
    title: 'macOS Firewall Enforcement',
    desc: 'pfctl allowlist updated the moment your payment confirms. No VPN, no login — your IP is whitelisted automatically.',
    tag: 'pfctl',
  },
  {
    icon: '🗄️',
    title: 'Supabase Session Store',
    desc: 'Every payment, wallet, IP, and delegation stored in Postgres. Sessions expire on-time and trigger automatic firewall cleanup.',
    tag: 'Postgres',
  },
  {
    icon: '🔒',
    title: 'Zero Custody',
    desc: 'USDC flows from your wallet directly to the hotspot operator via smart contract. No intermediary ever holds your funds.',
    tag: 'Non-custodial',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Connect MetaMask', desc: 'One click — switches to Base Sepolia automatically. No separate account or sign-up.' },
  { step: '02', title: 'Pick a plan', desc: 'Server returns a 402 with relay info: targetAddress, feeCollector, and fee amount.' },
  { step: '03', title: 'Sign permission', desc: 'MetaMask shows an EIP-7715 permission dialog. You approve a scoped ERC-20 allowance — not a transfer.' },
  { step: '04', title: 'Go online', desc: '1Shot relayer executes redeemDelegations on-chain. Webhook fires → Supabase session → pfctl whitelist. Done.' },
];

const PLANS = [
  { emoji: '⚡', name: '1 Hour', price: '$0.01', units: 'USDC', desc: 'Quick session', id: 'plan-1h' },
  { emoji: '🌙', name: '1 Day', price: '$0.05', units: 'USDC', desc: 'All day access', id: 'plan-1d', popular: true },
  { emoji: '🚀', name: '1 Week', price: '$0.20', units: 'USDC', desc: 'Best value', id: 'plan-1w' },
];

const TECH_STACK = [
  { name: 'x402 v2', color: 'text-blue-400' },
  { name: 'ERC-7710', color: 'text-purple-400' },
  { name: 'EIP-7715', color: 'text-cyan-400' },
  { name: '1Shot Relayer', color: 'text-green-400' },
  { name: 'Base Sepolia', color: 'text-blue-300' },
  { name: 'USDC', color: 'text-green-300' },
  { name: 'pfctl', color: 'text-orange-400' },
  { name: 'Supabase', color: 'text-emerald-400' },
  { name: 'Next.js 15', color: 'text-white' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      {/* Radial glow top */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* ── NAV ── */}
      <nav className="relative z-50 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5 backdrop-blur-sm bg-black/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-black text-sm">W</div>
          <span className="font-bold text-lg tracking-tight">Wifix402</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          <a href="#how" className="hover:text-white transition-colors">How it works</a>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
        </div>
        <Link href="/buy">
          <Button className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 h-9 text-sm rounded-lg">
            Buy Access →
          </Button>
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section className="relative px-6 md:px-12 pt-24 pb-20 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm mb-8 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Built for ETH Global · x402 + ERC-7710 + 1Shot Relayer
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-6">
            Pay-Per-Use WiFi.
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-300 bg-clip-text text-transparent">
              No Login. No Subscription.
            </span>
          </h1>

          <p className="text-white/50 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Wifix402 uses the x402 payment protocol, MetaMask ERC-7710 delegations, and the 1Shot permissionless relayer to sell WiFi access for cents — entirely on-chain, no gas wallet required.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/buy">
              <Button className="h-12 px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold text-base rounded-xl shadow-lg shadow-blue-500/20">
                Buy WiFi Access
              </Button>
            </Link>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="h-12 px-8 border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-base rounded-xl backdrop-blur-sm">
                View on GitHub ↗
              </Button>
            </a>
          </div>
        </div>

        {/* Hero visual — mock terminal / dashboard */}
        <div className="relative max-w-3xl mx-auto mt-16">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl shadow-black/50">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/30">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-3 text-white/30 text-xs font-mono">wifix402 — payment flow</span>
            </div>
            <div className="p-6 font-mono text-sm space-y-3 text-left">
              <div><span className="text-white/30">$ </span><span className="text-cyan-400">POST /api/purchase</span> <span className="text-white/30">→</span> <span className="text-yellow-400">402 Payment Required</span></div>
              <div className="ml-4 text-white/40">PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6MiwiYWNjZXB0cyI6...</div>
              <div className="ml-4 text-white/40">extra.targetAddress: 0x1c7D4B196Cb0C7B01d0...</div>
              <div className="ml-4 text-white/40">extra.feeAmount: 10000 <span className="text-white/25">(0.01 USDC)</span></div>
              <Separator className="bg-white/5" />
              <div><span className="text-white/30">🦊 </span><span className="text-purple-400">wallet_requestExecutionPermissions</span> <span className="text-white/30">→</span> <span className="text-green-400">granted</span></div>
              <div className="ml-4 text-white/40">periodAmount: 20000 atoms · expiry: +10min</div>
              <Separator className="bg-white/5" />
              <div><span className="text-white/30">$ </span><span className="text-cyan-400">POST /api/purchase</span> <span className="text-white/30">PAYMENT-SIGNATURE: ey...</span></div>
              <div className="ml-4 text-white/40">→ estimate7710Transaction: OK ($0.01 fee)</div>
              <div className="ml-4 text-white/40">→ send7710Transaction: <span className="text-green-400 animate-pulse">taskId: 0x4a2f...</span></div>
              <Separator className="bg-white/5" />
              <div><span className="text-white/30">🔔 </span><span className="text-green-400">Webhook type:0 confirmed</span> <span className="text-white/30">→ pfctl allow 192.168.1.42</span></div>
              <div className="ml-4"><span className="text-green-400">✓ Session active · 1 Hour · IP whitelisted</span></div>
            </div>
          </div>

          {/* Glow under the card */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-12 bg-blue-500/20 blur-2xl rounded-full" />
        </div>

        {/* Tech stack pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-16">
          {TECH_STACK.map(t => (
            <span key={t.name} className={`text-xs font-mono font-semibold px-3 py-1 rounded-full border border-white/10 bg-white/5 ${t.color}`}>
              {t.name}
            </span>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="relative px-6 md:px-12 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 mb-4">How it works</Badge>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
              Four steps. <span className="text-white/40">Fully on-chain.</span>
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">From wallet connect to internet access in under 30 seconds. No ETH needed — relay fee is paid in USDC.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative group">
                {/* Connector line */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-5 h-px bg-gradient-to-r from-white/10 to-transparent z-10" />
                )}
                <Card className="bg-white/3 border-white/8 hover:border-blue-500/30 hover:bg-white/5 transition-all duration-300 p-6 rounded-2xl h-full">
                  <div className="text-4xl font-black text-white/8 mb-3 font-mono">{step.step}</div>
                  <h3 className="font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{step.desc}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative px-6 md:px-12 py-24 bg-gradient-to-b from-transparent via-blue-950/10 to-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 mb-4">Technology</Badge>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
              Built on the cutting edge.
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">Every component is a production-grade primitive — not a demo hack.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <Card key={f.title} className="group bg-white/3 border-white/8 hover:border-blue-500/20 hover:bg-white/5 transition-all duration-300 rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{f.icon}</span>
                  <Badge variant="secondary" className="bg-white/8 text-white/40 text-xs border-0 font-mono">{f.tag}</Badge>
                </div>
                <div>
                  <h3 className="font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">{f.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative px-6 md:px-12 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 mb-4">Pricing</Badge>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
              Pay only for what you use.
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">Prices in USDC on Base. A small 1Shot relay fee (~$0.01) is added at checkout to cover gas.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <Card key={plan.id} className={`relative rounded-2xl p-6 flex flex-col gap-5 transition-all duration-300 ${
                plan.popular
                  ? 'bg-blue-600/15 border-blue-500/40 shadow-lg shadow-blue-500/10'
                  : 'bg-white/3 border-white/8 hover:border-white/15 hover:bg-white/5'
              }`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-blue-500/30">
                    MOST POPULAR
                  </div>
                )}
                <div className="text-4xl">{plan.emoji}</div>
                <div>
                  <div className="text-white/50 text-sm mb-1">{plan.desc}</div>
                  <div className="text-3xl font-black text-white">{plan.price}</div>
                  <div className="text-white/30 text-xs mt-1">{plan.units} + relay fee</div>
                </div>
                <div className="text-lg font-bold text-white/80">{plan.name}</div>
                <Link href="/buy" className="mt-auto">
                  <Button className={`w-full font-bold rounded-xl ${
                    plan.popular
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-white/8 hover:bg-white/15 text-white border border-white/10'
                  }`}>
                    Buy {plan.name}
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative px-6 md:px-12 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950/40 via-blue-900/20 to-transparent p-12 backdrop-blur-sm">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
              Ready to go online?
            </h2>
            <p className="text-white/40 text-lg mb-8">
              Connect MetaMask, pick a plan, sign once. Your IP is whitelisted in seconds.
            </p>
            <Link href="/buy">
              <Button className="h-12 px-10 bg-blue-600 hover:bg-blue-500 text-white font-bold text-base rounded-xl shadow-lg shadow-blue-500/25">
                Get WiFi Access Now →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 px-6 md:px-12 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-white/30 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-black text-xs">W</div>
            <span>Wifix402 — ETH Global Hackathon 2025</span>
          </div>
          <div className="flex items-center gap-6">
            <span>x402 + ERC-7710 + 1Shot</span>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub ↗</a>
            <Link href="/buy" className="hover:text-white transition-colors">Buy Access</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
