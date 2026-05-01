import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getAuthToken, verifySupabaseJWT } from "../_shared/jwt.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const token = getAuthToken(req)
  if (!token) {
    return new Response(JSON.stringify({ error: "認証が必要です。再ログインしてください。" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  try {
    await verifySupabaseJWT(token)
  } catch {
    return new Response(JSON.stringify({ error: "トークンが無効または期限切れです。再ログインしてください。" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const { imageUrl } = await req.json()
    
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "画像URLが必要です" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // 画像を取得
    const response = await fetch(imageUrl)
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "画像の取得に失敗しました" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    // 画像データを取得
    const imageBuffer = await response.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))
    const mimeType = response.headers.get("content-type") || "image/jpeg"
    const dataUrl = `data:${mimeType};base64,${base64}`

    return new Response(JSON.stringify({
      success: true,
      dataUrl: dataUrl,
      mimeType: mimeType
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error) {
    console.error("画像取得エラー:", error)
    return new Response(JSON.stringify({
      error: "画像の取得中にエラーが発生しました",
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
