'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L12.4 7.4L18 8.2L14 12.1L15 17.6L10 15L5 17.6L6 12.1L2 8.2L7.6 7.4L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'x402 Payment Protocol',
    desc: 'HTTP 402 native payments. No checkout, no redirect. Server demands payment inline — wallet signs in seconds.',
    tag: 'RFC-standard',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="10" cy="12" r="1.5" fill="currentColor"/>
      </svg>
    ),
    title: 'ERC-7710 Delegation',
    desc: 'Scoped smart contract delegation — not a raw transfer. Caveats enforce exact amount, target, and expiry at contract level.',
    tag: 'EIP-7715',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 6v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: '1Shot Permissionless Relay',
    desc: 'No gas wallet needed. 1Shot relayer executes your delegation on-chain, pays gas, and confirms via webhook.',
    tag: 'Gasless',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10h14M10 3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    title: 'Top-Up Billing',
    desc: 'Authorize a max. Pay only what you use. Stop any time — 1Shot settles the exact amount you consumed.',
    tag: 'Pay-as-you-go',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2C6 2 3 5 3 9c0 5.25 7 9 7 9s7-3.75 7-9c0-4-3-7-7-7z" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="10" cy="9" r="2" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    title: 'IP Firewall Enforcement',
    desc: 'pfctl allowlist updated the moment payment confirms. No VPN, no login — your IP is whitelisted instantly.',
    tag: 'pfctl',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3L3 7v6l7 4 7-4V7l-7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M3 7l7 4 7-4" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 11v6" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    title: 'Zero Custody',
    desc: 'USDC flows wallet-to-hotspot via smart contract. No intermediary. No platform risk. Non-custodial by design.',
    tag: 'Non-custodial',
  },
];

const HOW_IT_WORKS = [
  { n: '1', title: 'Authorize', desc: 'MetaMask signs an ERC-7710 scoped delegation — not a raw transfer. You set the maximum.' },
  { n: '2', title: 'Start', desc: 'x402 gate opens. Your IP is whitelisted. Internet access begins immediately.' },
  { n: '3', title: 'Use', desc: 'Browse freely. Live timer shows elapsed time and estimated charge in real-time.' },
  { n: '4', title: 'Stop', desc: '1Shot executes the delegation on-chain for the exact amount used. Never more.' },
];

const PLANS = [
  { name: '1 Hour', price: '$0.01', desc: 'Quick session', id: 'plan-1h', popular: false },
  { name: '1 Day', price: '$0.05', desc: 'All day access', id: 'plan-1d', popular: true },
  { name: '1 Week', price: '$0.20', desc: 'Best value', id: 'plan-1w', popular: false },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">

      {/* ── BACKGROUND FLUID SHAPES ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Main blob top-right */}
        <div style={{
          position: 'absolute', top: '-10%', right: '-5%',
          width: '65vw', height: '65vw', maxWidth: 900, maxHeight: 900,
          background: 'radial-gradient(ellipse at 60% 40%, #bfdbfe 0%, #c7d2fe 30%, #e0e7ff 60%, transparent 80%)',
          borderRadius: '60% 40% 50% 50% / 50% 60% 40% 50%',
          filter: 'blur(40px)', opacity: 0.7,
        }} />
        {/* Warm blob bottom-left */}
        <div style={{
          position: 'absolute', bottom: '5%', left: '-10%',
          width: '50vw', height: '50vw', maxWidth: 700, maxHeight: 700,
          background: 'radial-gradient(ellipse at 40% 60%, #fed7aa 0%, #fde68a 35%, #fef3c7 65%, transparent 85%)',
          borderRadius: '40% 60% 50% 50% / 60% 40% 55% 45%',
          filter: 'blur(50px)', opacity: 0.5,
        }} />
        {/* Small cyan mid */}
        <div style={{
          position: 'absolute', top: '45%', left: '35%',
          width: '30vw', height: '30vw', maxWidth: 450, maxHeight: 450,
          background: 'radial-gradient(ellipse, #a5f3fc 0%, #93c5fd 50%, transparent 80%)',
          borderRadius: '50%',
          filter: 'blur(60px)', opacity: 0.35,
        }} />
      </div>

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-xl shadow-sm border-b border-gray-100' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-10 h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-xs shadow-sm">W</div>
            <span className="font-bold text-gray-900 tracking-tight">Wifix402</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-500">
            <a href="#how" className="hover:text-gray-900 transition-colors">How it works</a>
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">GitHub</a>
          </div>
          <Link href="/buy">
            <button className="h-9 px-5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-full transition-colors shadow-sm">
              Get Started →
            </button>
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-36 pb-24 px-6 md:px-10 text-center">
        <div className="max-w-4xl mx-auto">

          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-600 text-xs font-semibold tracking-wide mb-8 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            BUILT FOR ETH GLOBAL · x402 + ERC-7710 + 1SHOT
          </div>

          <h1 className="text-5xl md:text-[5.5rem] font-black tracking-tight leading-[1.05] text-gray-900 mb-7">
            WiFi access,
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #0891b2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              paid by delegation.
            </span>
          </h1>

          <p className="text-gray-500 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            No login. No subscription. No gas. Sign a scoped ERC-7710 delegation in MetaMask — 1Shot relays it on-chain. Pay only the seconds you use.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/buy">
              <button className="h-12 px-8 bg-gray-900 hover:bg-gray-700 text-white font-bold text-sm rounded-full transition-all shadow-lg shadow-gray-900/15 hover:shadow-gray-900/25 hover:-translate-y-0.5">
                Buy WiFi Access
              </button>
            </Link>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer">
              <button className="h-12 px-8 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-full border border-gray-200 transition-all shadow-sm hover:-translate-y-0.5">
                View on GitHub ↗
              </button>
            </a>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center justify-center gap-8 mt-16 text-center">
            {[
              { val: '$0.001', label: 'per minute' },
              { val: '~10s', label: 'to connect' },
              { val: '0 ETH', label: 'gas needed' },
              { val: '100%', label: 'on-chain' },
            ].map(({ val, label }) => (
              <div key={label}>
                <div className="text-2xl font-black text-gray-900">{val}</div>
                <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wider font-medium">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero card — flow diagram */}
        <div className="relative max-w-2xl mx-auto mt-16">
          <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-gray-200 shadow-2xl shadow-gray-300/40 overflow-hidden">
            <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-gray-100 bg-gray-50/80">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="ml-3 text-gray-400 text-xs font-mono">payment-flow.ts</span>
            </div>
            <div className="p-6 font-mono text-xs leading-relaxed text-left space-y-2">
              <div><span className="text-gray-400">// 1. Server demands payment</span></div>
              <div><span className="text-blue-600">POST</span> <span className="text-gray-700">/api/purchase</span> <span className="text-gray-400">→</span> <span className="text-amber-600 font-semibold">402 Payment Required</span></div>
              <div className="ml-4 text-gray-400">targetAddress: 0x1c7D4B196Cb0C7B01d...</div>
              <div className="h-px bg-gray-100 my-3" />
              <div><span className="text-gray-400">// 2. MetaMask signs delegation</span></div>
              <div><span className="text-purple-600">wallet_requestExecutionPermissions</span> <span className="text-gray-400">→</span> <span className="text-green-600 font-semibold">granted</span></div>
              <div className="ml-4 text-gray-400">periodAmount: 10000 atoms · expiry: +10min</div>
              <div className="h-px bg-gray-100 my-3" />
              <div><span className="text-gray-400">// 3. 1Shot relays on-chain</span></div>
              <div><span className="text-blue-600">send7710Transaction</span> <span className="text-gray-400">→</span> <span className="text-green-600 font-semibold animate-pulse">taskId: 0x4a2f...</span></div>
              <div className="h-px bg-gray-100 my-3" />
              <div><span className="text-gray-400">// 4. Access granted</span></div>
              <div><span className="text-green-600 font-semibold">✓ pfctl allow 192.168.1.42 · session active</span></div>
            </div>
          </div>
          {/* Shadow glow */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-10 bg-blue-400/20 blur-2xl rounded-full" />
        </div>

        {/* Tech pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-14">
          {['x402 v2', 'ERC-7710', 'EIP-7715', '1Shot Relayer', 'Base Sepolia', 'USDC', 'Next.js 15', 'Supabase'].map(t => (
            <span key={t} className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-default">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="relative px-6 md:px-10 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold tracking-wide border border-indigo-100 mb-5">
              HOW IT WORKS
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">
              Authorize. Start. Stop. Pay.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto text-base">
              Four steps. Fully on-chain. Under 30 seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.n} className="relative group">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-7 left-[calc(100%-0px)] w-full h-px bg-gradient-to-r from-gray-300 to-transparent z-10 pointer-events-none" />
                )}
                <div className="rounded-2xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition-all duration-300 p-6">
                  <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-black text-sm mb-4 group-hover:bg-blue-600 transition-colors">
                    {step.n}
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative px-6 md:px-10 py-24 bg-gray-50/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-semibold tracking-wide border border-purple-100 mb-5">
              TECHNOLOGY
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">
              Built on the cutting edge.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Every component is a production-grade primitive — not a demo hack.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-gray-200 bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/60 transition-all duration-300 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 group-hover:bg-blue-600 group-hover:text-white text-gray-600 flex items-center justify-center transition-all duration-300">
                    {f.icon}
                  </div>
                  <span className="text-xs font-mono font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">{f.tag}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative px-6 md:px-10 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold tracking-wide border border-green-100 mb-5">
              PRICING
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">
              Pay only for what you use.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Fixed plans or top-up by the second. USDC on Base. 1Shot relay fee added at checkout.</p>
          </div>

          {/* Top-up callout */}
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-blue-800 mb-0.5">✦ Top-Up Mode — pay by the second</div>
              <div className="text-xs text-blue-600">Authorize a max · start when ready · stop any time · 1Shot charges only what you used</div>
            </div>
            <Link href="/buy">
              <button className="flex-shrink-0 text-xs font-bold px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors whitespace-nowrap">
                Try Top-Up →
              </button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`relative rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300 ${
                plan.popular
                  ? 'bg-gray-900 border border-gray-800 shadow-2xl shadow-gray-900/20'
                  : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-lg'
              }`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">
                    MOST POPULAR
                  </div>
                )}
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${plan.popular ? 'text-gray-400' : 'text-gray-400'}`}>{plan.desc}</div>
                  <div className={`text-4xl font-black ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.price}</div>
                  <div className={`text-xs mt-1 ${plan.popular ? 'text-gray-500' : 'text-gray-400'}`}>USDC + relay fee</div>
                </div>
                <div className={`text-xl font-black ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.name}</div>
                <Link href="/buy" className="mt-auto">
                  <button className={`w-full h-10 font-bold text-sm rounded-full transition-all ${
                    plan.popular
                      ? 'bg-white text-gray-900 hover:bg-gray-100'
                      : 'bg-gray-900 text-white hover:bg-gray-700'
                  }`}>
                    Get {plan.name}
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative px-6 md:px-10 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative rounded-3xl overflow-hidden p-12 md:p-16" style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a8a 50%, #0c4a6e 100%)',
          }}>
            {/* Inner glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-blue-500/20 blur-3xl rounded-full" />
            <div className="relative">
              <div className="text-blue-300 text-xs font-semibold tracking-widest uppercase mb-5">Ready to connect?</div>
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-4 leading-tight">
                WiFi for cents.<br/>Settled on-chain.
              </h2>
              <p className="text-blue-200/60 mb-8 text-base">
                Connect MetaMask, sign once, browse freely. Pay exactly what you use — powered by ERC-7710 delegation.
              </p>
              <Link href="/buy">
                <button className="h-12 px-10 bg-white hover:bg-blue-50 text-gray-900 font-bold text-sm rounded-full transition-all shadow-lg hover:-translate-y-0.5">
                  Get WiFi Access Now →
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 px-6 md:px-10 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-gray-400 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-[10px]">W</div>
            <span className="text-gray-500 font-medium">Wifix402</span>
            <span className="text-gray-300">·</span>
            <span>ETH Global Hackathon 2025</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <span className="text-gray-400">x402 + ERC-7710 + 1Shot</span>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">GitHub ↗</a>
            <Link href="/buy" className="hover:text-gray-700 transition-colors">Buy Access</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
