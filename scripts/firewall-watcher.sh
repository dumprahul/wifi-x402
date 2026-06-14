#!/bin/bash
# ============================================================
# Wifix402 — macOS Firewall Watcher
# Polls connected devices, checks Supabase via API, enforces pfctl
#
# Usage: sudo bash scripts/firewall-watcher.sh
# Requires: pfctl enabled, internet sharing on, jq installed
# ============================================================

API_BASE="${WIFIX402_API:-http://localhost:3000}"
TABLE="wifix402_allowed"
INTERVAL=10   # seconds between checks
BRIDGE="bridge100"   # macOS internet sharing interface (usually bridge100)

# Create PF table if it doesn't exist
ensure_table() {
  pfctl -t "$TABLE" -T show &>/dev/null || {
    echo "anchor \"wifix402\" { pass out on $BRIDGE from <$TABLE> to any }" | \
      pfctl -f - 2>/dev/null
    echo "[Firewall] Created PF table: $TABLE"
  }
}

# Get list of connected client IPs from ARP table on bridge interface
get_connected_ips() {
  arp -an | grep "$BRIDGE" | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | sort -u
}

check_and_enforce() {
  local ip="$1"
  local response
  response=$(curl -sf "${API_BASE}/api/firewall/check?ip=${ip}" 2>/dev/null)

  if [ -z "$response" ]; then
    echo "[Watcher] API unreachable for ${ip}"
    return
  fi

  local allowed
  allowed=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('allowed') else 'false')" 2>/dev/null)
  local plan
  plan=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('planName') or '')" 2>/dev/null)
  local remaining
  remaining=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('remainingSeconds',0))" 2>/dev/null)

  if [ "$allowed" = "true" ]; then
    pfctl -t "$TABLE" -T add "$ip" 2>/dev/null
    echo "[Watcher] ✅ ALLOW ${ip} | Plan: ${plan} | ${remaining}s remaining"
  else
    pfctl -t "$TABLE" -T delete "$ip" 2>/dev/null
    echo "[Watcher] 🚫 BLOCK ${ip} | No valid session"
  fi
}

echo "=========================================="
echo " Wifix402 Firewall Watcher"
echo " API: $API_BASE"
echo " PF Table: $TABLE"
echo " Interface: $BRIDGE"
echo " Interval: ${INTERVAL}s"
echo "=========================================="

ensure_table

while true; do
  echo ""
  echo "[$(date +%H:%M:%S)] Scanning connected devices..."
  IPS=$(get_connected_ips)

  if [ -z "$IPS" ]; then
    echo "[Watcher] No clients connected on $BRIDGE"
  else
    for ip in $IPS; do
      check_and_enforce "$ip"
    done
  fi

  sleep "$INTERVAL"
done
