const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripDataUrlPrefix = (value: string) => {
  const s = String(value || "").trim();
  const m = s.match(/^data:[^;]+;base64,(.*)$/i);
  return (m ? m[1] : s).trim();
};

const extractJsonFromText = (raw: string) => {
  const text = String(raw || "").trim();
  if (!text) return "";

  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1).trim();

  return text;
};

const buildPrompt = (extractedText: string, fileName: string) => {
  return `
あなたは仕入れ担当者の業務アシスタントです。
以下は「納品予定一覧」などのPDFから抽出したテキストです。これを解析して、伝票ごとの入荷データをJSONで返してください。

【入力PDFファイル名】${fileName || "不明"}

【出力ルール】
- JSONのみを返してください。解説・前置きは禁止です。
- 数値(単価/数量/総合計)は number 型で返してください。無い場合は null。
- 日付は可能なら "YYYY/MM/DD"（時間があれば "YYYY/MM/DD HH:mm"）に統一してください。
- ページ番号(例: 1/2, 2/2)・フッター(例: 抽出条件→... など)・重複したヘッダーは無視してください。
- 同じ伝票Noが複数ページに分かれていても items を結合してください。

【出力フォーマット】
{
  "report": {
    "title": "帳票タイトル（例: 納品予定一覧）",
    "outputAt": "出力日（例: 2026/02/10 04:26）",
    "rangeFrom": "抽出範囲開始日（例: 2026/02/10）",
    "rangeTo": "抽出範囲終了日（例: 2026/02/10）"
  },
  "slips": [
    {
      "slipNo": "伝票No（例: 524355）",
      "vendor": "取引先名（例: 株式会社ｅｆｆ）",
      "slipDate": "伝票日付（YYYY/MM/DD）",
      "deliveryDate": "納品日（YYYY/MM/DD）",
      "total": 4414,
      "comment": "コメント（あれば）",
      "items": [
        {
          "no": 1,
          "code": "商品コード（あれば）",
          "name": "商品名",
          "unitPrice": 320,
          "deliveryQty": 1,
          "deliveryUnit": "PC",
          "spec": "規格・入数／単位（あれば）",
          "orderQty": 1,
          "orderUnit": "PC"
        }
      ]
    }
  ]
}

【抽出テキスト】
${extractedText}
`;
};

async function callAzureLayoutAnalyze(documentBase64: string) {
  const apiKey =
    Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_KEY") ||
    Deno.env.get("AZURE_DI_KEY") ||
    "";
  const endpoint =
    Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT") ||
    Deno.env.get("AZURE_DI_ENDPOINT") ||
    "";

  if (!apiKey || !endpoint) {
    throw new Error("Azure Document Intelligence のキー/エンドポイントが設定されていません");
  }

  const url = `${endpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base64Source: documentBase64,
    }),
  });

  if (res.status === 202) {
    const op = res.headers.get("Operation-Location");
    if (!op) throw new Error("Operation-Location が見つかりません");

    // Poll up to ~60s.
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const poll = await fetch(op, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
      });
      if (!poll.ok) {
        const t = await poll.text();
        throw new Error(`結果取得エラー: ${poll.status} ${t}`);
      }
      const j = await poll.json();
      const status = String(j?.status || "").toLowerCase();
      if (status === "succeeded") return j;
      if (status === "failed") {
        const msg = j?.error?.message || "Unknown";
        throw new Error(`解析が失敗しました: ${msg}`);
      }
    }
    throw new Error("解析がタイムアウトしました");
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Azure API エラー: ${res.status} ${t}`);
  }

  const j = await res.json();
  return j;
}

async function callGemini(prompt: string) {
  const apiKey = Deno.env.get("GOOGLE_API_KEY") || "";
  if (!apiKey) throw new Error("GOOGLE_API_KEY が設定されていません");

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 1,
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${t}`);
  }

  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { raw: j, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const fileBase64 = stripDataUrlPrefix(String(body?.fileBase64 || body?.pdfBase64 || ""));
    const fileName = String(body?.fileName || "");

    if (!fileBase64) {
      throw new Error("fileBase64 が必要です");
    }

    const azureResult = await callAzureLayoutAnalyze(fileBase64);
    const extractedText =
      azureResult?.analyzeResult?.content ||
      (azureResult?.analyzeResult?.pages
        ? azureResult.analyzeResult.pages
            .flatMap((p: any) => (p?.lines || []).map((l: any) => l?.content).filter(Boolean))
            .join("\n")
        : "");

    if (!extractedText || String(extractedText).trim().length === 0) {
      throw new Error("抽出テキストが空です");
    }

    const prompt = buildPrompt(extractedText, fileName);
    const { text: geminiText } = await callGemini(prompt);

    const jsonText = extractJsonFromText(geminiText);
    let data: unknown = null;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`JSON解析に失敗しました: ${(e as Error)?.message || String(e)}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("parse-delivery-pdf error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
