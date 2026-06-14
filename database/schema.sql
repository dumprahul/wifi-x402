-- ============================================================
-- Wifix402 — Programmable Internet Access Markets
-- ============================================================

-- HOTSPOT MANAGEMENT
CREATE TABLE IF NOT EXISTS hotspots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  router_mac TEXT UNIQUE NOT NULL,
  router_ip TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  bandwidth_mbps INTEGER,
  uptime_percent NUMERIC,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- PLANS (pricing tiers per hotspot)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id UUID NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  price_usdc NUMERIC NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  renewal_every_seconds INTEGER,
  max_bandwidth_mbps INTEGER,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- SESSIONS (active + historical)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id UUID NOT NULL REFERENCES hotspots(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  wallet TEXT NOT NULL,
  mac TEXT NOT NULL,
  ip TEXT NOT NULL,
  user_agent TEXT,
  delegation_hash TEXT,
  delegation_nonce BIGINT,
  task_id TEXT,
  transaction_hash TEXT,
  paid_amount NUMERIC NOT NULL,
  gas_paid_usdc NUMERIC,
  started_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  status TEXT DEFAULT 'pending',
  is_recurring BOOLEAN DEFAULT FALSE,
  renewal_count INTEGER DEFAULT 0,
  last_renewal_at BIGINT,
  next_renewal_at BIGINT,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- Remove duplicate session constraint to allow renewal sessions
CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet);
CREATE INDEX IF NOT EXISTS idx_sessions_mac_ip ON sessions(mac, ip);

-- DELEGATIONS (stored for renewal engine)
CREATE TABLE IF NOT EXISTS delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet TEXT NOT NULL,
  hotspot_id UUID NOT NULL REFERENCES hotspots(id),
  permissions_context JSONB NOT NULL,
  total_usdc_authorized NUMERIC NOT NULL,
  usdc_spent NUMERIC DEFAULT 0,
  created_at BIGINT NOT NULL,
  scope_expiry BIGINT,
  is_active BOOLEAN DEFAULT TRUE,
  used_count INTEGER DEFAULT 0,
  last_used_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_delegations_wallet_hotspot ON delegations(wallet, hotspot_id);

-- WEBHOOK EVENTS (audit trail)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  transaction_hash TEXT,
  received_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  processed BOOLEAN DEFAULT TRUE,
  processed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_webhook_task_id ON webhook_events(task_id);

-- FIREWALL RULES LOG
CREATE TABLE IF NOT EXISTS firewall_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  ip TEXT NOT NULL,
  mac TEXT NOT NULL,
  action TEXT NOT NULL,
  executed_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  pfctl_output TEXT
);

CREATE INDEX IF NOT EXISTS idx_firewall_ip ON firewall_logs(ip, executed_at);

-- REVENUE (aggregated stats)
CREATE TABLE IF NOT EXISTS revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotspot_id UUID NOT NULL REFERENCES hotspots(id),
  session_count INTEGER DEFAULT 0,
  total_usdc NUMERIC DEFAULT 0,
  average_session_duration_seconds INTEGER,
  date DATE DEFAULT CURRENT_DATE,
  UNIQUE (hotspot_id, date)
);
