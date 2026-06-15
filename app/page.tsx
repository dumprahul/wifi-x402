'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { BlurText } from '@/components/ui/blur-text';
import { FadeContent } from '@/components/ui/fade-content';
import { TiltCard } from '@/components/ui/tilt-card';
import { CountUp } from '@/components/ui/count-up';

const Aurora = dynamic(() => import('@/components/Aurora'), { ssr: false });

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2.5L12.4 7.4L18 8.2L14 12.1L15 17.6L10 15L5 17.6L6 12.1L2 8.2L7.6 7.4L10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>,
    title: 'x402 Protocol',
    desc: 'HTTP 402 native payments. No checkout, no redirect — server demands payment inline, wallet signs in seconds.',
    tag: 'RFC-standard',
    color: 'blue',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="8" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M7 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="10" cy="13" r="1.5" fill="currentColor"/></svg>,
    title: 'ERC-7710 Delegation',
    desc: 'Scoped smart contract delegation. Caveats enforce exact amount, target, and expiry at the contract level.',
    tag: 'EIP-7715',
    color: 'purple',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6"/><path d="M10 6v4l3 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
    title: '1Shot Relay',
    desc: 'No gas wallet needed. 1Shot executes your delegation on-chain, pays gas, and confirms via webhook.',
    tag: 'Gasless',
    color: 'emerald',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="4" y="4" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
    title: 'Top-Up Billing',
    desc: 'Authorize a max. Start when ready. Stop any time — 1Shot charges only the exact seconds consumed.',
    tag: 'Pay-as-you-go',
    color: 'amber',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2C6 2 3 5.1 3 9c0 5.3 7 9 7 9s7-3.7 7-9c0-3.9-3-7-7-7z" stroke="currentColor" strokeWidth="1.6"/><circle cx="10" cy="9" r="2" stroke="currentColor" strokeWidth="1.6"/></svg>,
    title: 'IP Firewall',
    desc: 'pfctl allowlist updated the moment payment confirms. No VPN, no login — your IP is whitelisted instantly.',
    tag: 'pfctl',
    color: 'orange',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 6v8l7 4 7-4V6l-7-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M3 6l7 4 7-4M10 10v8" stroke="currentColor" strokeWidth="1.6"/></svg>,
    title: 'Zero Custody',
    desc: 'USDC flows wallet-to-hotspot via smart contract. No intermediary ever holds your funds.',
    tag: 'Non-custodial',
    color: 'teal',
  },
];

const HOW = [
  { n: '01', title: 'Authorize', desc: 'MetaMask signs an ERC-7710 scoped delegation. You set the maximum — not a raw transfer.' },
  { n: '02', title: 'Start',     desc: 'x402 gate opens, your credential is verified. IP whitelisted. Internet begins immediately.' },
  { n: '03', title: 'Use',       desc: 'Browse freely. Live timer shows elapsed time and estimated charge in real-time.' },
  { n: '04', title: 'Stop & Pay', desc: '1Shot executes for the exact seconds used. Delegation ensures you never pay more.' },
];

const PLANS = [
  { name: '1 Hour', price: '0.01', desc: 'Quick session',  id: 'plan-1h', popular: false },
  { name: '1 Day',  price: '0.05', desc: 'All day access', id: 'plan-1d', popular: true  },
  { name: '1 Week', price: '0.20', desc: 'Best value',     id: 'plan-1w', popular: false },
];

const COLORS: Record<string, string> = {
  blue:    'bg-blue-50   text-blue-600   group-hover:bg-blue-600',
  purple:  'bg-purple-50 text-purple-600 group-hover:bg-purple-600',
  emerald: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600',
  amber:   'bg-amber-50  text-amber-600  group-hover:bg-amber-600',
  orange:  'bg-orange-50 text-orange-600 group-hover:bg-orange-600',
  teal:    'bg-teal-50   text-teal-600   group-hover:bg-teal-600',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f6ff] text-gray-900 overflow-x-hidden">

      {/* ── AURORA BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Neon blob orbs behind Aurora for rich colour depth */}
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] left-[10%] w-[600px] h-[500px] rounded-full bg-violet-400/25 blur-[120px] animate-float" />
          <div className="absolute top-[20%] right-[5%] w-[500px] h-[400px] rounded-full bg-cyan-400/20 blur-[100px] animate-float" style={{ animationDelay: '1.5s' }} />
          <div className="absolute bottom-[10%] left-[30%] w-[700px] h-[350px] rounded-full bg-fuchsia-400/18 blur-[130px] animate-float" style={{ animationDelay: '3s' }} />
          <div className="absolute top-[50%] left-[-5%] w-[400px] h-[400px] rounded-full bg-blue-400/15 blur-[90px] animate-float" style={{ animationDelay: '2s' }} />
        </div>
        <Aurora
          colorStops={['#7c3aed', '#06b6d4', '#a855f7']}
          amplitude={1.4}
          blend={0.7}
          speed={0.5}
        />
        {/* Heavy white overlay — keeps page white but lets neon glow bleed through */}
        <div className="absolute inset-0 bg-white/72" />
      </div>

      {/* ── FLOATING PILL NAVBAR ── */}
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
          {/* Logo — text only, no icon */}
          <Link href="/" className="flex items-center flex-shrink-0">
            <span className="font-black text-black tracking-tight text-sm">
              Wifix402
            </span>
          </Link>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200/80" />

          {/* Links */}
          <div className="hidden md:flex items-center gap-5 text-xs font-semibold text-black/70">
            {[['How it works', '#how-it-works'], ['Features', '#features'], ['Pricing', '#pricing']].map(([label, href]) => (
              <a key={label} href={href}
                className="hover:text-black transition-colors relative group">
                {label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-black group-hover:w-full transition-all duration-300" />
              </a>
            ))}
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer"
              className="hover:text-black transition-colors flex items-center gap-1">
              GitHub ↗
            </a>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-5 bg-gray-200/80" />

          {/* CTA */}
          <Link href="/buy">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="h-8 px-4 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-full transition-colors shadow-md flex items-center gap-1.5 flex-shrink-0"
            >
              Get Access
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5h6M5 2l3 3-3 3"/></svg>
            </motion.button>
          </Link>
        </motion.nav>
      </div>

      {/* ── HERO ── */}
      <section className="relative z-10 pt-40 pb-24 px-6 md:px-10 text-center">
        <div className="max-w-5xl mx-auto">

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-200/80 bg-white/60 backdrop-blur-md text-blue-600 text-[11px] font-bold tracking-widest mb-8 shadow-sm"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            METAMASK TOOLKIT HACKATHON · x402 + ERC-7710 + 1SHOT
          </motion.div>

          {/* Big brand name */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mb-5"
          >
            <span
              className="text-7xl md:text-[9rem] lg:text-[10.5rem] font-black tracking-tighter leading-none inline-block text-black"
              style={{ letterSpacing: '-0.04em' }}
            >
              Wifix402
            </span>
          </motion.div>

          {/* Sub-headline */}
          <div className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-gray-800 mb-6 leading-tight">
            <BlurText text="WiFi access, paid by delegation." delay={0.5} stepDuration={0.055} />
          </div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85 }}
            className="text-gray-500 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed"
          >
            No login. No subscription. No gas. Sign a scoped ERC-7710 delegation in MetaMask — 1Shot relays it on-chain. Pay only the seconds you actually use.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16"
          >
            <Link href="/buy">
              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="h-12 px-8 bg-gray-900 hover:bg-blue-600 text-white font-bold text-sm rounded-full shadow-xl shadow-gray-900/20 transition-colors flex items-center gap-2"
              >
                Buy WiFi Access
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7h10M7 2l5 5-5 5"/></svg>
              </motion.button>
            </Link>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer">
              <motion.button
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="h-12 px-8 bg-white/70 backdrop-blur-sm text-gray-700 font-semibold text-sm rounded-full border border-gray-200 shadow-md transition-colors hover:bg-white flex items-center gap-2"
              >
                View GitHub ↗
              </motion.button>
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.15 }}
            className="flex flex-wrap items-center justify-center gap-10 mb-16"
          >
            {[
              { prefix: '$', to: 0.001, dec: 3, suffix: '', label: 'per minute' },
              { prefix: '~', to: 10,    dec: 0, suffix: 's', label: 'to connect' },
              { prefix: '',  to: 0,     dec: 0, suffix: ' ETH gas', label: 'required' },
              { prefix: '',  to: 100,   dec: 0, suffix: '%', label: 'on-chain' },
            ].map(({ prefix, to, dec, suffix, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-black text-gray-900">
                  <CountUp from={0} to={to} decimals={dec} prefix={prefix} suffix={suffix} duration={1.8} />
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider font-semibold">{label}</div>
              </div>
            ))}
          </motion.div>

          {/* Hero terminal card */}
          <FadeContent delay={0.3} direction="up" distance={40}>
            <div className="relative max-w-2xl mx-auto">
              <div className="rounded-3xl bg-white/55 backdrop-blur-2xl border border-white/80 shadow-2xl shadow-blue-200/30 overflow-hidden">
                <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-gray-100/80 bg-white/50">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-3 text-gray-400 text-xs font-mono">payment-flow.ts</span>
                </div>
                <div className="p-6 font-mono text-xs leading-7 text-left space-y-0.5">
                  <div className="text-gray-400">{'// 1. Server demands payment'}</div>
                  <div>
                    <span className="text-blue-600 font-semibold">POST</span>
                    <span className="text-gray-600"> /api/purchase </span>
                    <span className="text-gray-300">→</span>
                    <span className="text-amber-600 font-semibold"> 402 Payment Required</span>
                  </div>
                  <div className="text-gray-400 pl-4">targetAddress: 0x1c7D4B196Cb0C7B01d...</div>
                  <div className="h-2" />
                  <div className="text-gray-400">{'// 2. MetaMask signs delegation'}</div>
                  <div>
                    <span className="text-purple-600 font-semibold">wallet_requestExecutionPermissions</span>
                    <span className="text-gray-300"> → </span>
                    <span className="text-green-600 font-semibold">granted</span>
                  </div>
                  <div className="text-gray-400 pl-4">periodAmount: 10000 atoms · expiry +10min</div>
                  <div className="h-2" />
                  <div className="text-gray-400">{'// 3. 1Shot relays on-chain'}</div>
                  <div>
                    <span className="text-blue-600 font-semibold">send7710Transaction</span>
                    <span className="text-gray-300"> → </span>
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                      className="text-green-600 font-semibold"
                    >
                      taskId: 0x4a2f…
                    </motion.span>
                  </div>
                  <div className="h-2" />
                  <div>
                    <span className="text-green-600 font-semibold">✓ pfctl allow 192.168.1.42</span>
                    <span className="text-gray-400"> · session active</span>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-2/3 h-10 bg-blue-300/20 blur-2xl rounded-full pointer-events-none" />
            </div>
          </FadeContent>

          {/* Tech pills */}
          <FadeContent delay={0.5} direction="up" className="flex flex-wrap items-center justify-center gap-2 mt-12">
            {['x402 v2', 'ERC-7710', 'EIP-7715', '1Shot Relayer', 'Base Sepolia', 'USDC', 'Next.js 15', 'Supabase', 'pfctl'].map((t, i) => (
              <motion.span
                key={t}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.3 + i * 0.05, duration: 0.35, ease: 'backOut' }}
                className="text-[11px] font-semibold px-3.5 py-1.5 rounded-full bg-white/65 backdrop-blur-sm text-gray-500 border border-gray-200/80 hover:border-blue-300 hover:text-blue-600 hover:bg-white transition-colors cursor-default shadow-sm"
              >
                {t}
              </motion.span>
            ))}
          </FadeContent>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="relative z-10 px-6 md:px-10 py-28">
        <div className="max-w-5xl mx-auto">
          <FadeContent direction="up" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50/80 backdrop-blur-sm text-indigo-600 text-[11px] font-bold tracking-widest border border-indigo-100 mb-5 shadow-sm">
              HOW IT WORKS
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 mb-4 leading-tight">
              Authorize. Start. Use. Stop.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Four steps. Fully on-chain. Under 30 seconds from MetaMask to internet.</p>
          </FadeContent>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {HOW.map((step, i) => (
              <FadeContent key={step.n} delay={i * 0.1} direction="up">
                <TiltCard tiltStrength={8} className="h-full">
                  <div className="relative rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl hover:bg-white/75 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/60 transition-all duration-300 p-6 h-full group">
                    {i < HOW.length - 1 && (
                      <div className="hidden md:block absolute top-8 -right-2 w-4 h-px bg-gradient-to-r from-gray-200 to-transparent z-10" />
                    )}
                    <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-black text-xs mb-5 group-hover:bg-blue-600 transition-colors shadow-sm">
                      {step.n}
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </TiltCard>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="relative z-10 px-6 md:px-10 py-28">
        <div className="max-w-6xl mx-auto">
          <FadeContent direction="up" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-50/80 backdrop-blur-sm text-purple-600 text-[11px] font-bold tracking-widest border border-purple-100 mb-5 shadow-sm">
              TECHNOLOGY
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">
              Built on the cutting edge.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Every component is a production-grade primitive — not a demo hack.</p>
          </FadeContent>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <FadeContent key={f.title} delay={i * 0.08} direction="up">
                <TiltCard tiltStrength={7} className="h-full">
                  <div className="group rounded-2xl border border-white/80 bg-white/55 backdrop-blur-xl hover:bg-white/75 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/40 transition-all duration-300 p-6 h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:text-white ${COLORS[f.color]}`}>
                        {f.icon}
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-gray-400 bg-white/80 px-2.5 py-1 rounded-full border border-gray-100/80">
                        {f.tag}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">{f.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                  </div>
                </TiltCard>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative z-10 px-6 md:px-10 py-28">
        <div className="max-w-4xl mx-auto">
          <FadeContent direction="up" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-green-50/80 backdrop-blur-sm text-green-700 text-[11px] font-bold tracking-widest border border-green-100 mb-5 shadow-sm">
              PRICING
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">
              Pay only for what you use.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Fixed plans or top-up by the second. USDC on Base. No subscription.</p>
          </FadeContent>

          <FadeContent delay={0.1} direction="up">
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 backdrop-blur-sm p-5 mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-blue-800 mb-0.5">✦ Top-Up Mode — pay by the second</div>
                <div className="text-xs text-blue-600/80">Authorize a max · start when ready · stop any time · charged only what you used</div>
              </div>
              <Link href="/buy">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex-shrink-0 text-xs font-bold px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors shadow-sm whitespace-nowrap">
                  Try Top-Up →
                </motion.button>
              </Link>
            </div>
          </FadeContent>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan, i) => (
              <FadeContent key={plan.id} delay={0.15 + i * 0.1} direction="up">
                <TiltCard tiltStrength={plan.popular ? 5 : 8} className="h-full">
                  <div className={`relative rounded-2xl p-6 flex flex-col gap-5 h-full transition-all duration-300 ${
                    plan.popular
                      ? 'bg-gray-900 border border-gray-800 shadow-2xl shadow-gray-900/25'
                      : 'bg-white/55 backdrop-blur-xl border border-white/80 hover:bg-white/75 hover:border-gray-300 hover:shadow-lg'
                  }`}>
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-lg shadow-blue-500/30">
                        MOST POPULAR
                      </div>
                    )}
                    <div>
                      <div className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${plan.popular ? 'text-gray-500' : 'text-gray-400'}`}>{plan.desc}</div>
                      <div className={`text-5xl font-black ${plan.popular ? 'text-white' : 'text-gray-900'}`}>${plan.price}</div>
                      <div className={`text-xs mt-1 ${plan.popular ? 'text-gray-500' : 'text-gray-400'}`}>USDC · fixed · + relay fee</div>
                    </div>
                    <div className={`text-xl font-black ${plan.popular ? 'text-white' : 'text-gray-800'}`}>{plan.name}</div>
                    <Link href="/buy" className="mt-auto">
                      <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className={`w-full h-11 font-bold text-sm rounded-full transition-all ${
                          plan.popular ? 'bg-white text-gray-900 hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-700 shadow-md shadow-gray-900/15'
                        }`}>
                        Get {plan.name}
                      </motion.button>
                    </Link>
                  </div>
                </TiltCard>
              </FadeContent>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 px-6 md:px-10 py-24">
        <FadeContent direction="up" className="max-w-3xl mx-auto">
          <div className="relative rounded-3xl overflow-hidden p-12 md:p-16 text-center"
            style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a8a 55%, #0c4a6e 100%)' }}>
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.28, 0.15] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-blue-400 blur-3xl rounded-full pointer-events-none"
            />
            <div className="relative">
              <div className="text-blue-300/60 text-[11px] font-bold tracking-widest uppercase mb-5">Ready to connect?</div>
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-5 leading-tight">
                WiFi for cents.<br />Settled on-chain.
              </h2>
              <p className="text-blue-200/50 mb-8 text-base leading-relaxed max-w-md mx-auto">
                Connect MetaMask, sign once, browse freely. Pay exactly what you use — powered by ERC-7710 scoped delegation.
              </p>
              <Link href="/buy">
                <motion.button whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.97 }}
                  className="h-12 px-10 bg-white hover:bg-blue-50 text-gray-900 font-bold text-sm rounded-full shadow-xl shadow-black/30 transition-all">
                  Get WiFi Access →
                </motion.button>
              </Link>
            </div>
          </div>
        </FadeContent>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-white/60 px-6 md:px-10 py-8 bg-white/30 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-[10px]">W</div>
            <span className="font-bold text-gray-700">Wifix<span className="text-blue-600">402</span></span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">MetaMask Toolkit Hackathon</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <span className="font-mono">x402 + ERC-7710 + 1Shot</span>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">GitHub ↗</a>
            <Link href="/buy" className="hover:text-gray-700 transition-colors">Buy Access</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
