# Wifix402

Pay-per-use internet access, settled in USDC on Base — no subscriptions, no card on file, no checkout. Connect your wallet, get online, pay only for what you use.

---

## The Problem

Public WiFi is broken in three ways.

**For users** — you either pay a flat subscription for access you don't fully use, hand over card details to a portal you've never heard of, or get locked into venue-specific voucher systems that expire whether you use them or not. There is no way to pay for exactly 12 minutes of internet at an airport or exactly 2 hours at a café. Granular, trustless, metered access doesn't exist.

**For hotspot operators** — collecting payments means integrating a payment processor, managing subscriptions, handling chargebacks, and paying processing fees. The infrastructure cost to monetize a small hotspot is disproportionate to what it earns. Most don't bother.

**For the broader web3 ecosystem** — there is no working example of programmable money meeting programmable access. Crypto payments exist, but they require gas, wallets with ETH, and manual transaction signing at each step. That's not a user experience anyone tolerates.

---

## Our Solution

Wifix402 makes internet access work like a metered utility — you pay in USDC for exactly the seconds you were online, settled on-chain, with no ETH required from the user.

The core insight is that three emerging standards — EIP-7715 (execution permissions), EIP-7702 (EOA smart account upgrade), and ERC-7710 (delegation redemption) — can be composed together to build a payment channel for internet access that is trustless, gasless from the user's side, and metered to the second.

Here's what that looks like in practice:

1. **User signs once.** MetaMask issues a scoped USDC spending permission with a hard cap and time limit. No raw approval. No private key exposure. At the same moment, the EOA is upgraded to a smart account via EIP-7702 — no deployment, no ETH, stateless.

2. **Server gates access via HTTP 402.** The hotspot endpoint responds with a standard `402 Payment Required` and a `PAYMENT-REQUIRED` header. The client attaches the signed delegation as `PAYMENT-SIGNATURE` and retries. No checkout, no redirect — the credential is the delegation itself.

3. **1Shot settles on-chain.** When the session ends, the server calculates exact usage (seconds × rate) and submits it to the 1Shot Permissionless Relayer. 1Shot calls `DelegationManager.redeemDelegations()` on Base Mainnet, transfers the precise USDC amount, and pays its own gas — the user needs zero ETH at any point.

The user is never charged more than they used. The operator receives USDC directly. Everything is verifiable on-chain.

---

## What We're Building

Wifix402 is the infrastructure layer for programmable internet access:

- **A metered access protocol** — sessions tracked per second, charged for actual usage, never the full cap
- **A gasless payment channel** — USDC on Base, settled via 1Shot, no ETH dependency
- **An open hotspot standard** — any operator can deploy a Wifix402-compatible hotspot; the payment logic is protocol-level, not vendor-specific
- **A composable primitive** — the delegation + 402 + relay pattern can extend to any access-gated service beyond WiFi

---

## Protocol Stack

```
User Wallet (MetaMask)
       │
       │  EIP-7715 — wallet_requestExecutionPermissions
       │  Signs a scoped USDC spending delegation (max cap, time-limited)
       │
       ▼
  Smart Account Layer
       │
       │  EIP-7702 — eth_signAuthorization
       │  EOA is upgraded to EIP7702StatelessDeleGator smart account
       │  Implementation: 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B (Base Mainnet)
       │
       ▼
  Wifix402 Server
       │
       │  x402 Protocol — HTTP 402 Payment Required
       │  /api/topup/start responds 402 with PAYMENT-REQUIRED header
       │  Client attaches delegation as PAYMENT-SIGNATURE and retries
       │
       ▼
  1Shot Permissionless Relayer
       │
       │  ERC-7710 — redeemDelegations()
       │  Relayer bundles: 7702 authorization + delegation redemption + USDC transfers
       │  Gas paid by relayer in USDC — user needs zero ETH
       │
       ▼
  Base Mainnet (Chain 8453)
```

---

## Key Standards

### EIP-7715 — Execution Permissions
MetaMask's `wallet_requestExecutionPermissions` issues a scoped ERC-20 delegation. The user approves a maximum USDC cap and a time window. No raw transfer approval, no private key exposure. Implemented via `@metamask/smart-accounts-kit`.

### EIP-7702 — EOA Smart Account Upgrade
Before the delegation is redeemed, the user signs a 7702 authorization pointing their EOA to the `EIP7702StatelessDeleGator` implementation. This temporarily upgrades the EOA to a smart account for the duration of the transaction. The stateless design means no `initialize()` call is needed — the implementation infers ownership from the EOA address itself.

### ERC-7710 — Delegation Redemption
The server calls `DelegationManager.redeemDelegations()` on-chain via 1Shot. Executions are USDC transfers — one to the 1Shot fee collector, one to the hotspot wallet. The delegation enforces that only the exact charged amount (actual seconds × rate) is transferred, never the full delegated cap.

### x402 — HTTP 402 Payment Protocol
The `/api/topup/start` endpoint responds with HTTP 402 and a `PAYMENT-REQUIRED` header containing base64-encoded JSON describing the payment terms. The client attaches the signed delegation as `PAYMENT-SIGNATURE` and retries the request. No checkout flow, no redirect, no card details.

### 1Shot Permissionless Relayer
All on-chain execution is handled by the [1Shot API](https://1shotapi.com). The server calls `relayer_send7710Transaction` with the delegation context, the USDC executions, and the EIP-7702 authorization tuple. 1Shot submits the transaction to Base Mainnet and charges gas in USDC from the delegation itself — the user needs no ETH at any point.

---

## Architecture

```
app/
├── page.tsx                     # Landing page
├── buy/page.tsx                 # Buy flow — wallet connect, plan selection, delegation signing
└── api/
    ├── topup/
    │   ├── delegate/route.ts    # POST: store delegation + 7702 auth | GET: fetch relay info
    │   ├── start/route.ts       # x402 gate — responds 402 then activates session
    │   ├── stop/route.ts        # Calculate usage, submit to 1Shot, block IP
    │   └── status/[sessionId]   # Poll 1Shot task status
    ├── purchase/route.ts        # One-shot fixed-duration plan purchase
    └── webhook/1shot/route.ts   # 1Shot webhook — finalizes session on tx confirmation

utils/
├── constants.ts    # Chain config, contract addresses, pricing
├── relayer.ts      # 1Shot JSON-RPC client (getCapabilities, send7710Transaction, ...)
└── chain.ts        # viem public client, USDC balance helpers

lib/
├── topup-sessions.ts   # Supabase CRUD for session lifecycle
└── supabase.ts         # Supabase client

components/
└── Aurora.tsx      # WebGL Aurora background (OGL + simplex noise)
```

---

## Session Lifecycle

```
delegated → active → stopping → stopped
```

1. **delegated** — user signs EIP-7715 permission + EIP-7702 authorization; both stored in Supabase
2. **active** — x402 gate passed; IP allowed through firewall; timer starts
3. **stopping** — user stops session; actual seconds calculated; 1Shot tx submitted
4. **stopped** — 1Shot webhook fires with tx hash; session finalized

The user is only charged for actual usage time, never the full delegated cap.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS, Framer Motion |
| Wallet | MetaMask — EIP-7715 via `@metamask/smart-accounts-kit` |
| Chain | Base Mainnet (Chain ID 8453) |
| Token | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Smart Account | EIP7702StatelessDeleGator `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` |
| Delegation Manager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| Relayer | 1Shot API — `https://relayer.1shotapi.com/relayers` |
| Database | Supabase (Postgres) |

---

## Environment Variables

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

CHAIN_ID=8453
RPC_URL=https://mainnet.base.org
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

HOTSPOT_WALLET=         # Address that receives USDC payments
HOTSPOT_PRIVATE_KEY=    # Server wallet private key — never commit this
FIREWALL_TABLE=wifix402_allowed
```

---

## Run Locally

```bash
npm install
# copy and fill in your keys
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Pricing

Top-up sessions: **~$0.001 USDC / minute** (16 atoms/second).

Fixed plans: 1 Hour / 1 Day / 1 Week.
