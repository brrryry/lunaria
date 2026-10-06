#!/usr/bin/env bash
# ==============================================================================
# Lunaria -> Dockge NAS Deployment Script
# Targets: bryan-nas.gkhomenetwork.lan (/volume1/docker/stacks/lunaria)
#
# Usage:
#   bash scripts/deploy-nas.sh                     # Default deploy (uses ~/.ssh/nas if present)
#   bash scripts/deploy-nas.sh --with-env          # Deploy and sync local .env to NAS
#   bash scripts/deploy-nas.sh -i ~/.ssh/custom_key# Custom SSH key
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
NAS_USER="${NAS_USER:-bryan}"
NAS_HOST="${NAS_HOST:-bryan-nas.gkhomenetwork.lan}"
NAS_PORT="${NAS_PORT:-22}"
NAS_PATH="${NAS_PATH:-/volume1/docker/stacks/lunaria}"

# Auto-detect ~/.ssh/nas if no identity key is specified
DEFAULT_KEY=""
if [ -f "$HOME/.ssh/nas" ]; then
  DEFAULT_KEY="$HOME/.ssh/nas"
fi
SSH_KEY="${SSH_KEY:-$DEFAULT_KEY}"

SYNC_ENV=false

while [ $# -gt 0 ]; do
  case "$1" in
    --with-env)
      SYNC_ENV=true
      shift
      ;;
    -i)
      shift
      SSH_KEY="$1"
      shift
      ;;
    -i=*|--identity=*)
      SSH_KEY="${1#*=}"
      shift
      ;;
    --user=*)
      NAS_USER="${1#*=}"
      shift
      ;;
    --host=*)
      NAS_HOST="${1#*=}"
      shift
      ;;
    --path=*)
      NAS_PATH="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--with-env] [-i <key> | --identity=<key>] [--user=<user>] [--host=<host>] [--path=<path>]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_OPTS=(-p "${NAS_PORT}" -o StrictHostKeyChecking=no)
if [ -n "${SSH_KEY}" ] && [ -f "${SSH_KEY}" ]; then
  SSH_OPTS+=(-i "${SSH_KEY}")
fi

echo "========================================================"
echo " Lunaria Deployment -> Dockge NAS Stack"
echo " Target: ${NAS_USER}@${NAS_HOST}:${NAS_PATH}"
if [ -n "${SSH_KEY}" ]; then
  echo " SSH Key: ${SSH_KEY}"
fi
echo "========================================================"

# ------------------------------------------------------------------------------
# 1. Connectivity Check
# ------------------------------------------------------------------------------
echo "📡 Testing SSH connectivity to ${NAS_USER}@${NAS_HOST}..."
if ! ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=5 "${NAS_USER}@${NAS_HOST}" "echo 'Connected as \$(whoami)'"; then
  echo "❌ Error: Could not connect to ${NAS_USER}@${NAS_HOST}."
  exit 1
fi

# ------------------------------------------------------------------------------
# 2. Ensure Stack Directory on NAS
# ------------------------------------------------------------------------------
echo "📁 Ensuring remote stack directory: ${NAS_PATH}..."
ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" "mkdir -p '${NAS_PATH}'"

# ------------------------------------------------------------------------------
# 3. Stream & Synchronize Files to NAS
# (Uses tar streaming to bypass Synology DSM custom rsync permission limitations)
# ------------------------------------------------------------------------------
echo "📦 Packaging and streaming Lunaria files to ${NAS_PATH}..."

TAR_EXCLUDES=(
  --exclude='node_modules'
  --exclude='.git'
  --exclude='.turbo'
  --exclude='.next'
  --exclude='dist'
  --exclude='mobile'
  --exclude='tests'
  --exclude='*.log'
  --exclude='.env.local'
  --exclude='.env.*.local'
)

if [ "$SYNC_ENV" = false ]; then
  TAR_EXCLUDES+=(--exclude='.env')
  echo "🔒 Preserving remote .env on NAS (pass --with-env to overwrite)"
else
  echo "⚠️  --with-env flag passed: Syncing local .env to NAS"
fi

tar -czf - \
  "${TAR_EXCLUDES[@]}" \
  -C "${REPO_ROOT}" . \
  | ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" "tar -xzf - -C '${NAS_PATH}'"

echo "✅ Files successfully transferred."

# ------------------------------------------------------------------------------
# 4. Trigger Docker Build & Compose Up on NAS
# ------------------------------------------------------------------------------
echo "🚀 Building and launching containers on NAS via Docker Compose..."

ssh "${SSH_OPTS[@]}" "${NAS_USER}@${NAS_HOST}" "
  cd '${NAS_PATH}'

  # Warn if .env is missing in the stack directory
  if [ ! -f .env ]; then
    echo '⚠️  WARNING: No .env file found in ${NAS_PATH}!'
    if [ -f .env.example ]; then
      echo '   Creating default .env from .env.example...'
      cp .env.example .env
      echo '   Please edit ${NAS_PATH}/.env with production credentials.'
    fi
  fi

  docker compose up -d --build --remove-orphans
  echo ''
  echo '📊 Container Status:'
  docker compose ps
"

echo "========================================================"
echo "🎉 Deployment complete!"
echo "   Dockge Stack Location: ${NAS_PATH}"
echo "   Access your stack in the Dockge Web UI on your NAS."
echo "========================================================"
