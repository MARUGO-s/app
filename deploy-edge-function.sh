#!/bin/bash

# Supabase Edge Function デプロイスクリプト

echo "🚀 Supabase Edge Function をデプロイ中..."

# 環境変数を設定
export SUPABASE_ACCESS_TOKEN="your-access-token-here"
export SUPABASE_PROJECT_ID="ctxyawinblwcbkovfsyj"

# APIキーを環境変数として設定
supabase secrets set VISION_API_KEY="AIzaSyBLjZEslyQG9JtJiVfLsc0zG9VTMPOGjs4"
supabase secrets set GEMINI_API_KEY="AIzaSyBNgqPMcJiVSysDAaXKzCOv08IGUeuEAwg"

# Edge Functionをデプロイ
supabase functions deploy screenshot-recipe --project-ref $SUPABASE_PROJECT_ID

echo "✅ デプロイ完了！"
echo "📝 使用方法:"
echo "   sb.functions.invoke('screenshot-recipe', { body: { url: 'https://example.com' } })"
