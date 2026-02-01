#!/bin/bash

# Anki card addition script
# Usage: ./anki-add.sh <word>

API_KEY="${ANKI_GEMINI_API_KEY}"
API_URL="https://anki-new-card.vercel.app/api/gemini"

if [ -z "$API_KEY" ]; then
  echo "Error: ANKI_GEMINI_API_KEY environment variable is not set"
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <word>"
  exit 1
fi

WORD="$1"

# Query the API
echo "Querying: $WORD"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{\"word\": \"$WORD\", \"apiKey\": \"$API_KEY\"}")

# Check if response is valid
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "Error: $(echo "$RESPONSE" | jq -r '.error // "Failed to get response"')"
  exit 1
fi

# Show raw result
echo "Result:"
echo "$RESPONSE" | jq '.'

# Format the meaning for Anki (HTML format)
# Format: meaning<br><span style="font-size: small;"><i> - example</i></span><br><br>...
MEANING=$(echo "$RESPONSE" | jq -r '
  .meanings | to_entries | map(
    .value.meaning +
    (if .value.example and .value.example != "" then
      "<br><span style=\"font-size: small;\"><i> - " + .value.example + "</i></span>"
    else "" end) +
    (if .key < (length - 1) then "<br><br>" else "" end)
  ) | join("")
')

read -p "Add to Anki? [Y/n] " -r REPLY
if [[ "$REPLY" =~ ^[Nn]$ ]]; then
  echo "Skipped."
  exit 0
fi

apy add-single "$WORD" "$MEANING"
apy sync
