# Wifix402

Programmable WiFi access marketplace — pay-per-use internet sessions settled on-chain via smart delegation, gasless relaying, and HTTP payment channels.

---

## What it does

Wifix402 lets users purchase WiFi access using USDC on Base. There are no subscriptions and no centralized payment processor. The user delegates a spending cap via their MetaMask wallet, the server gates internet access behind an HTTP 402 payment wall, and on-chain settlement happens automatically via a gasless relayer — the user never needs ETH for gas.

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
