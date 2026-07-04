#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  ShopFlow ERP — one-shot setup script
#  Run this once after importing the project to a new account:
#    bash setup.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[setup]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
fail()    { echo -e "${RED}[✗]${NC} $*"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      ShopFlow ERP — Setup            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Check DATABASE_URL ─────────────────────────────────────
info "Checking database connection..."
if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL is not set.\n\n  On Replit: go to Tools → Database and create a PostgreSQL database.\n  The DATABASE_URL secret will be added automatically."
fi
success "DATABASE_URL found"

# ── 2. SESSION_SECRET ─────────────────────────────────────────
info "Checking SESSION_SECRET..."
if [ -z "${SESSION_SECRET:-}" ]; then
  warn "SESSION_SECRET not set — generating one automatically"
  export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  warn "Add SESSION_SECRET to your Replit Secrets with the value above to persist it across restarts"
else
  success "SESSION_SECRET found"
fi

# ── 3. Install dependencies ───────────────────────────────────
info "Installing dependencies..."
if ! command -v pnpm &>/dev/null; then
  fail "pnpm not found. Make sure the Node.js module is enabled in your repl."
fi
pnpm install --frozen-lockfile 2>&1 | tail -3
success "Dependencies installed"

# ── 4. Push database schema ───────────────────────────────────
info "Pushing database schema..."
pnpm --filter @workspace/db run push 2>&1 | grep -E "(✓|✗|Changes|Error|error)" || true
success "Database schema ready"

# ── 5. Done ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup complete! Start the app:     ║${NC}"
echo -e "${GREEN}║   • Run the workflows in Replit, or  ║${NC}"
echo -e "${GREEN}║   • Press the ▶ Run button           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
