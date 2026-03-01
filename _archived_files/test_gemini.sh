#!/bin/bash
API_KEY="${GOOGLE_API_KEY:-your_google_api_key_here}"
MODEL="gemini-2.0-flash"

echo "Testing Gemini API with model: $MODEL"

curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent?key=$API_KEY" \
-H 'Content-Type: application/json' \
-d '{
  "contents": [{
    "parts": [{"text": "Hello, can you hear me?"}]
  }]
}'
