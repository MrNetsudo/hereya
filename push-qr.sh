#!/bin/bash
# Run this after starting expo: ./push-qr.sh <exp://tunnel-url>
URL="${1}"
if [ -z "$URL" ]; then
  echo "Usage: ./push-qr.sh exp://your-tunnel-url"
  exit 1
fi
curl -s -X POST https://netsudo.com/admin/loci/qr \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\",\"secret\":\"LociQR2026!\"}" && echo "✅ QR updated on netsudo.com/loci/"
