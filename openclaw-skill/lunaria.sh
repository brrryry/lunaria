#!/usr/bin/env bash
# Lunaria OpenClaw Bridge Helper CLI
# Allows OpenClaw to fetch financial data and execute actions on Lunaria.

set -e

if [ -z "$LUNARIA_URL" ]; then
  if curl -s --max-time 1 http://lunaria-backend:3001/api/agent/info >/dev/null 2>&1; then
    LUNARIA_URL="http://lunaria-backend:3001/api"
  elif curl -s --max-time 1 http://172.22.0.1:3001/api/agent/info >/dev/null 2>&1; then
    LUNARIA_URL="http://172.22.0.1:3001/api"
  else
    LUNARIA_URL="http://localhost:3001/api"
  fi
fi

API_KEY="${LUNARIA_AGENT_API_KEY:-lunaria_sec_53709a29af6c6dca6ef9050c4da79eb4}"

COMMAND="${1:-info}"

case "$COMMAND" in
  info)
    curl -s -H "x-api-key: $API_KEY" "$LUNARIA_URL/agent/info"
    ;;

  overview|networth|accounts)
    curl -s -H "x-api-key: $API_KEY" "$LUNARIA_URL/agent/overview"
    ;;

  transactions|tx)
    DAYS="${2:-7}"
    LIMIT="${3:-20}"
    curl -s -H "x-api-key: $API_KEY" "$LUNARIA_URL/agent/transactions?days=$DAYS&limit=$LIMIT"
    ;;

  budget)
    MONTH="${2:-}"
    curl -s -H "x-api-key: $API_KEY" "$LUNARIA_URL/agent/budget?month=$MONTH"
    ;;

  set-budget|budget-set)
    MONTH="$2"
    ARG3="$3"
    ARG4="${4:-}"
    ARG5="${5:-expense}"

    if [ -z "$MONTH" ] || [ -z "$ARG3" ]; then
      echo '{"error": "Usage: ./lunaria.sh set-budget <YYYY-MM> <category> <amount> [expense|income] OR ./lunaria.sh set-budget <YYYY-MM> \x27[{\"category\":\"Food\",\"amount\":500}]\x27"}'
      exit 1
    fi

    if [[ "$ARG3" =~ ^\[.* ]]; then
      PAYLOAD="{\"month\": \"$MONTH\", \"entries\": $ARG3}"
    else
      PAYLOAD="{\"month\": \"$MONTH\", \"category\": \"$ARG3\", \"amount\": $ARG4, \"type\": \"$ARG5\"}"
    fi

    curl -s -X POST \
      -H "Content-Type: application/json" \
      -H "x-api-key: $API_KEY" \
      -d "$PAYLOAD" \
      "$LUNARIA_URL/agent/budget"
    ;;

  briefing)
    curl -s -H "x-api-key: $API_KEY" "$LUNARIA_URL/agent/briefing"
    ;;

  categorize)
    TX_ID="$2"
    CATEGORY="$3"
    SUBCAT="${4:-}"
    APPLY_ALL="${5:-false}"

    if [ -z "$TX_ID" ] || [ -z "$CATEGORY" ]; then
      echo '{"error": "Usage: ./lunaria.sh categorize <transactionId> <category> [subCategory] [applyToMerchant]"}'
      exit 1
    fi

    curl -s -X POST \
      -H "Content-Type: application/json" \
      -H "x-api-key: $API_KEY" \
      -d "{\"transactionId\": \"$TX_ID\", \"category\": \"$CATEGORY\", \"subCategory\": \"$SUBCAT\", \"applyToMerchant\": $APPLY_ALL}" \
      "$LUNARIA_URL/agent/categorize"
    ;;

  *)
    echo "Usage: ./lunaria.sh [info|overview|transactions <days> <limit>|budget [YYYY-MM]|set-budget <YYYY-MM> <category> <amount>|briefing|categorize <id> <category>]"
    exit 1
    ;;
esac
