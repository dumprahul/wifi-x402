'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BlurText } from '@/components/ui/blur-text';
import { FadeContent } from '@/components/ui/fade-content';
import { TiltCard } from '@/components/ui/tilt-card';
import { CountUp } from '@/components/ui/count-up';

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 2.5L13.5 8H19.5L14.75 11.75L16.5 17.5L11 14L5.5 17.5L7.25 11.75L2.5 8H8.5L11 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'x402 Payment Protocol',
    desc: 'HTTP 402 native payments. No checkout, no redirect. Server demands payment inline — wallet signs in seconds.',
    tag: 'RFC-standard',
    color: 'blue',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="4" y="9" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M8 9V7a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="11" cy="14" r="1.5" fill="currentColor"/>
      </svg>
    ),
    title: 'ERC-7710 Delegation',
    desc: 'Scoped smart contract delegation. Caveats enforce exact amount, target, and expiry at the contract level.',
    tag: 'EIP-7715',
    color: 'purple',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M11 7v4l3 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    title: '1Shot Relay',
    desc: 'No gas wallet needed. 1Shot executes your delegation on-chain, pays gas, confirms via webhook.',
    tag: 'Gasless',
    color: 'emerald',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 2.5v19M2.5 11h19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <rect x="5.5" y="5.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
    ),
    title: 'Top-Up Billing',
    desc: 'Authorize a max. Start when ready. Stop any time — 1Shot charges only the exact seconds consumed.',
    tag: 'Pay-as-you-go',
    color: 'amber',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 2.5C7 2.5 4 5.5 4 9c0 5.5 7 10 7 10s7-4.5 7-10c0-3.5-3-6.5-7-6.5z" stroke="currentColor" strokeWidth="1.6"/>
        <circle cx="11" cy="9" r="2" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
    ),
    title: 'IP Firewall',
    desc: 'pfctl allowlist updated the moment payment confirms. No VPN, no login — IP whitelisted instantly.',
    tag: 'pfctl',
    color: 'orange',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 3L4 7v8l7 4 7-4V7l-7-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M4 7l7 4 7-4M11 11v8" stroke="currentColor" strokeWidth="1.6"/>
      </svg>
    ),
    title: 'Zero Custody',
    desc: 'USDC flows wallet-to-hotspot via smart contract. No intermediary ever holds your funds.',
    tag: 'Non-custodial',
    color: 'teal',
  },
];

const HOW = [
  { n: '01', title: 'Authorize', desc: 'MetaMask signs an ERC-7710 scoped delegation. You set the maximum — no raw transfers.' },
  { n: '02', title: 'Start', desc: 'x402 gate opens, credential verified. Your IP is whitelisted. Internet begins immediately.' },
  { n: '03', title: 'Use', desc: 'Browse freely. Live timer tracks elapsed time and estimates your charge in real-time.' },
  { n: '04', title: 'Stop & Pay', desc: '1Shot executes for the exact amount used. Delegation ensures you never pay more.' },
];

const PLANS = [
  { name: '1 Hour', price: '0.01', desc: 'Quick session', id: 'plan-1h', popular: false },
  { name: '1 Day', price: '0.05', desc: 'All day access', id: 'plan-1d', popular: true },
  { name: '1 Week', price: '0.20', desc: 'Best value', id: 'plan-1w', popular: false },
];

const COLOR_MAP: Record<string, string> = {
  blue:    'bg-blue-50 text-blue-600 group-hover:bg-blue-600',
  purple:  'bg-purple-50 text-purple-600 group-hover:bg-purple-600',
  emerald: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600',
  amber:   'bg-amber-50 text-amber-600 group-hover:bg-amber-600',
  orange:  'bg-orange-50 text-orange-600 group-hover:bg-orange-600',
  teal:    'bg-teal-50 text-teal-600 group-hover:bg-teal-600',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-gray-900 overflow-x-hidden">

      {/* ── BACKGROUND BLOBS ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <motion.div
          animate={{ scale: [1, 1.04, 1], rotate: [0, 3, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: '-12%', right: '-8%',
            width: '70vw', height: '70vw', maxWidth: 960, maxHeight: 960,
            background: 'radial-gradient(ellipse at 55% 45%, #bfdbfe 0%, #c7d2fe 28%, #e0e7ff 58%, transparent 78%)',
            borderRadius: '62% 38% 46% 54% / 52% 61% 39% 48%',
            filter: 'blur(48px)', opacity: 0.65,
          }}
        />
        <motion.div
          animate={{ scale: [1, 1.06, 1], rotate: [0, -4, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          style={{
            position: 'absolute', bottom: '8%', left: '-12%',
            width: '55vw', height: '55vw', maxWidth: 750, maxHeight: 750,
            background: 'radial-gradient(ellipse at 42% 58%, #fed7aa 0%, #fde68a 32%, #fef3c7 62%, transparent 84%)',
            borderRadius: '42% 58% 54% 46% / 60% 40% 58% 42%',
            filter: 'blur(56px)', opacity: 0.45,
          }}
        />
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 6 }}
          style={{
            position: 'absolute', top: '42%', left: '38%',
            width: '28vw', height: '28vw', maxWidth: 420, maxHeight: 420,
            background: 'radial-gradient(ellipse, #a5f3fc 0%, #93c5fd 55%, transparent 80%)',
            borderRadius: '50%',
            filter: 'blur(64px)', opacity: 0.28,
          }}
        />
      </div>

      {/* ── GLASS NAV ── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-white/70 backdrop-blur-2xl shadow-lg shadow-gray-200/40 border-b border-white/60'
            : 'bg-white/20 backdrop-blur-xl border-b border-white/30'
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-10 h-16">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-sm shadow-md shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow">
              W
            </div>
            <span className="font-black text-gray-900 tracking-tight text-lg">Wifix<span className="text-blue-600">402</span></span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
            {['How it works', 'Features', 'Pricing'].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                className="hover:text-gray-900 transition-colors relative group">
                {item}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-blue-500 group-hover:w-full transition-all duration-300" />
              </a>
            ))}
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer"
              className="hover:text-gray-900 transition-colors flex items-center gap-1">
              GitHub
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 9L9 1M9 1H3M9 1v6"/></svg>
            </a>
          </div>

          <Link href="/buy">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="hidden md:flex h-9 px-5 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-full items-center gap-1.5 shadow-md shadow-gray-900/15 transition-colors"
            >
              Get Access
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 6h8M6 2l4 4-4 4"/></svg>
            </motion.button>
          </Link>
        </div>
      </motion.nav>

      {/* ── HERO ── */}
      <section className="relative pt-36 pb-20 px-6 md:px-10 text-center">
        <div className="max-w-5xl mx-auto">

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-200/80 bg-blue-50/80 backdrop-blur-sm text-blue-600 text-xs font-semibold tracking-wider mb-8 shadow-sm"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-ring" />
            METAMASK TOOLKIT HACKATHON · x402 + ERC-7710 + 1SHOT
          </motion.div>

          {/* Headline */}
          <h1 className="text-5xl md:text-[5.5rem] font-black tracking-tight leading-[1.06] mb-6">
            <BlurText text="WiFi access," className="block text-gray-900" delay={0.2} />
            <BlurText
              text="paid by delegation."
              delay={0.45}
              className="block"
              stepDuration={0.06}
            />
          </h1>

          {/* Gradient word overlay via inline style */}
          <style>{`
            h1 span:nth-child(2) span {
              background: linear-gradient(135deg, #2563eb 0%, #7c3aed 45%, #0891b2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
          `}</style>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.75 }}
            className="text-gray-500 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            No login. No subscription. No gas. Sign a scoped ERC-7710 delegation in MetaMask — 1Shot relays it on-chain. Pay only the seconds you actually use.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16"
          >
            <Link href="/buy">
              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="h-13 px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm rounded-full shadow-xl shadow-gray-900/20 transition-colors flex items-center gap-2"
              >
                Buy WiFi Access
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7h10M7 2l5 5-5 5"/></svg>
              </motion.button>
            </Link>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer">
              <motion.button
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="h-13 px-8 py-3.5 bg-white/80 backdrop-blur-sm text-gray-700 font-semibold text-sm rounded-full border border-gray-200 shadow-md shadow-gray-100/60 transition-colors hover:bg-white flex items-center gap-2"
              >
                View on GitHub
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0C2.686 0 0 2.686 0 6c0 2.652 1.722 4.9 4.11 5.694.3.054.41-.13.41-.288v-1.012c-1.668.362-2.02-.806-2.02-.806-.272-.692-.666-.876-.666-.876-.544-.372.04-.364.04-.364.602.042.92.618.92.618.536.918 1.406.652 1.748.5.054-.39.21-.652.382-.802-1.332-.152-2.732-.666-2.732-2.964 0-.654.234-1.19.618-1.608-.062-.152-.268-.762.058-1.588 0 0 .504-.162 1.65.616A5.752 5.752 0 016 2.9c.51.002 1.022.068 1.5.2 1.146-.778 1.648-.616 1.648-.616.328.826.122 1.436.06 1.588.384.418.616.954.616 1.608 0 2.304-1.402 2.81-2.738 2.96.216.186.408.55.408 1.11v1.644c0 .16.108.346.414.288C10.28 10.898 12 8.65 12 6c0-3.314-2.686-6-6-6z"/></svg>
              </motion.button>
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.05 }}
            className="flex flex-wrap items-center justify-center gap-10"
          >
            {[
              { prefix: '$', to: 0.001, decimals: 3, suffix: '', label: 'per minute' },
              { prefix: '~', to: 10, decimals: 0, suffix: 's', label: 'to connect' },
              { prefix: '', to: 0, decimals: 0, suffix: ' ETH gas', label: 'required' },
              { prefix: '', to: 100, decimals: 0, suffix: '%', label: 'on-chain' },
            ].map(({ prefix, to, decimals, suffix, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-black text-gray-900">
                  <CountUp from={0} to={to} decimals={decimals} prefix={prefix} suffix={suffix} duration={1.6} />
                </div>
                <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wider font-medium">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Hero card */}
        <FadeContent delay={0.3} direction="up" distance={40} className="relative max-w-2xl mx-auto mt-16">
          <div className="rounded-3xl bg-white/60 backdrop-blur-2xl border border-white/80 shadow-2xl shadow-gray-300/40 overflow-hidden">
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-gray-100/80 bg-gray-50/60">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-gray-400 text-xs font-mono tracking-wide">payment-flow.ts</span>
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
              <div className="h-3" />
              <div className="text-gray-400">{'// 2. MetaMask signs delegation'}</div>
              <div>
                <span className="text-purple-600 font-semibold">wallet_requestExecutionPermissions</span>
                <span className="text-gray-300"> → </span>
                <span className="text-green-600 font-semibold">granted</span>
              </div>
              <div className="text-gray-400 pl-4">periodAmount: 10000 atoms · expiry +10min</div>
              <div className="h-3" />
              <div className="text-gray-400">{'// 3. 1Shot relays on-chain'}</div>
              <div>
                <span className="text-blue-600 font-semibold">send7710Transaction</span>
                <span className="text-gray-300"> → </span>
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                  className="text-green-600 font-semibold"
                >
                  taskId: 0x4a2f...
                </motion.span>
              </div>
              <div className="h-3" />
              <div>
                <span className="text-green-600 font-semibold">✓ pfctl allow 192.168.1.42</span>
                <span className="text-gray-400"> · session active</span>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-10 bg-blue-300/25 blur-2xl rounded-full pointer-events-none" />
        </FadeContent>

        {/* Tech pills */}
        <FadeContent delay={0.5} direction="up" className="flex flex-wrap items-center justify-center gap-2 mt-12">
          {['x402 v2', 'ERC-7710', 'EIP-7715', '1Shot Relayer', 'Base Sepolia', 'USDC', 'Next.js 15', 'Supabase', 'pfctl'].map((t, i) => (
            <motion.span
              key={t}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2 + i * 0.04, duration: 0.4, ease: 'backOut' }}
              className="text-xs font-medium px-3.5 py-1.5 rounded-full bg-white/70 backdrop-blur-sm text-gray-500 border border-gray-200/80 hover:border-blue-300 hover:text-blue-600 transition-colors cursor-default shadow-sm"
            >
              {t}
            </motion.span>
          ))}
        </FadeContent>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="relative px-6 md:px-10 py-28">
        <div className="max-w-5xl mx-auto">
          <FadeContent direction="up" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold tracking-wider border border-indigo-100 mb-5">
              HOW IT WORKS
            </div>
            <h2 className="text-3xl md:text-[3.25rem] font-black tracking-tight text-gray-900 mb-4 leading-tight">
              Authorize. Start. Use. Stop.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Four steps. Fully on-chain. Under 30 seconds from MetaMask to internet.</p>
          </FadeContent>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {HOW.map((step, i) => (
              <FadeContent key={step.n} delay={i * 0.1} direction="up">
                <TiltCard tiltStrength={8} className="h-full">
                  <div className="relative rounded-2xl border border-gray-200/80 bg-white/70 backdrop-blur-sm hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/60 transition-all duration-300 p-6 h-full group">
                    {/* Connector */}
                    {i < HOW.length - 1 && (
                      <div className="hidden md:block absolute top-8 -right-2 w-4 h-px bg-gradient-to-r from-gray-300 to-transparent z-10" />
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
      <section id="features" className="relative px-6 md:px-10 py-28">
        {/* Section bg */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-transparent pointer-events-none" />
        <div className="relative max-w-6xl mx-auto">
          <FadeContent direction="up" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-semibold tracking-wider border border-purple-100 mb-5">
              TECHNOLOGY
            </div>
            <h2 className="text-3xl md:text-[3.25rem] font-black tracking-tight text-gray-900 mb-4 leading-tight">
              Built on the cutting edge.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Every component is a production-grade primitive — not a demo hack.</p>
          </FadeContent>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <FadeContent key={f.title} delay={i * 0.08} direction="up">
                <TiltCard tiltStrength={6} className="h-full">
                  <div className="group rounded-2xl border border-gray-200/80 bg-white/70 backdrop-blur-sm hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/50 transition-all duration-300 p-6 h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:text-white ${COLOR_MAP[f.color]}`}>
                        {f.icon}
                      </div>
                      <span className="text-[11px] font-mono font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
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
      <section id="pricing" className="relative px-6 md:px-10 py-28">
        <div className="max-w-4xl mx-auto">
          <FadeContent direction="up" className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold tracking-wider border border-green-100 mb-5">
              PRICING
            </div>
            <h2 className="text-3xl md:text-[3.25rem] font-black tracking-tight text-gray-900 mb-4 leading-tight">
              Pay only for what you use.
            </h2>
            <p className="text-gray-400 max-w-md mx-auto">Fixed plans or top-up by the second. USDC on Base. No subscription. No account.</p>
          </FadeContent>

          {/* Top-up highlight */}
          <FadeContent delay={0.1} direction="up">
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 backdrop-blur-sm p-5 mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-blue-800 mb-0.5">✦ Top-Up Mode — pay by the second</div>
                <div className="text-xs text-blue-600/80">Authorize a max · start when ready · stop any time · charged only what you used</div>
              </div>
              <Link href="/buy">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex-shrink-0 text-xs font-bold px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors whitespace-nowrap shadow-sm"
                >
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
                      : 'bg-white/70 backdrop-blur-sm border border-gray-200/80 hover:border-gray-300 hover:shadow-lg'
                  }`}>
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[11px] font-bold px-4 py-1 rounded-full shadow-lg shadow-blue-500/30">
                        MOST POPULAR
                      </div>
                    )}
                    <div>
                      <div className={`text-[11px] font-semibold uppercase tracking-widest mb-3 ${plan.popular ? 'text-gray-500' : 'text-gray-400'}`}>
                        {plan.desc}
                      </div>
                      <div className={`text-5xl font-black ${plan.popular ? 'text-white' : 'text-gray-900'}`}>
                        ${plan.price}
                      </div>
                      <div className={`text-xs mt-1 ${plan.popular ? 'text-gray-500' : 'text-gray-400'}`}>
                        USDC · fixed · + relay fee
                      </div>
                    </div>
                    <div className={`text-xl font-black ${plan.popular ? 'text-white' : 'text-gray-800'}`}>
                      {plan.name}
                    </div>
                    <Link href="/buy" className="mt-auto">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className={`w-full h-11 font-bold text-sm rounded-full transition-all ${
                          plan.popular
                            ? 'bg-white text-gray-900 hover:bg-gray-100 shadow-sm'
                            : 'bg-gray-900 text-white hover:bg-gray-700 shadow-md shadow-gray-900/15'
                        }`}
                      >
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
      <section className="relative px-6 md:px-10 py-28">
        <div className="max-w-3xl mx-auto">
          <FadeContent direction="up">
            <div className="relative rounded-3xl overflow-hidden p-12 md:p-16 text-center"
              style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a8a 55%, #0c4a6e 100%)' }}>
              {/* Animated orb */}
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-blue-400 blur-3xl rounded-full pointer-events-none"
              />
              <div className="relative">
                <div className="text-blue-300/70 text-xs font-bold tracking-widest uppercase mb-5">Ready to connect?</div>
                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-5 leading-tight">
                  WiFi for cents.<br />Settled on-chain.
                </h2>
                <p className="text-blue-200/50 mb-8 text-base leading-relaxed max-w-lg mx-auto">
                  Connect MetaMask, sign once, browse freely. Pay exactly what you use — powered by ERC-7710 scoped delegation.
                </p>
                <Link href="/buy">
                  <motion.button
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    className="h-12 px-10 bg-white hover:bg-blue-50 text-gray-900 font-bold text-sm rounded-full transition-all shadow-xl shadow-black/30"
                  >
                    Get WiFi Access →
                  </motion.button>
                </Link>
              </div>
            </div>
          </FadeContent>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-200/60 px-6 md:px-10 py-8 bg-white/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-gray-400 text-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-[10px]">W</div>
            <span className="font-semibold text-gray-600">Wifix402</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs">MetaMask Toolkit Hackathon</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <span className="font-mono text-gray-400">x402 + ERC-7710 + 1Shot</span>
            <a href="https://github.com/dumprahul/wifi-x402" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors flex items-center gap-1">
              GitHub <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 9L9 1M9 1H3M9 1v6"/></svg>
            </a>
            <Link href="/buy" className="hover:text-gray-700 transition-colors">Buy Access</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
