const AUTO_RESEARCH_PROVIDER = 'Groq Compound / Perplexity Sonar（自動振分）';

const PROGRESS_CONFIGS = {
    'product-generate': {
        title: 'AI商品開発を進行中',
        description: '調査は内容に応じてPerplexityを使い、OpenAIが統合・反証・修正を担当します。',
        steps: [
            { label: 'Web調査', provider: AUTO_RESEARCH_PROVIDER, description: '本場・海外・由来・安全性などの条件に合うとPerplexityを使用' },
            { label: '海外・本場比較', provider: 'Perplexity Sonar', description: '海外の専門ソースと本場の情報を比較' },
            { label: 'レシピ統合', provider: 'Groq GPT-OSS 120B', description: '調査結果を配合と工程へ整理' },
            { label: '食品科学検証', provider: 'Groq GPT-OSS 120B', description: '食感・火入れ・保存性の理屈を確認' },
            { label: '科学・安全性検証', provider: 'Groq Compound', description: '再現性と安全性を確認' },
            { label: '統合ドラフト', provider: 'OpenAI gpt-5.4-nano', description: '専門家の所見を商品レシピへ統合' },
            { label: '反証レビュー', provider: 'OpenAI gpt-5.4-mini', description: '見落としや矛盾、失敗しやすい点を批判的に検証' },
            { label: '最終修正', provider: 'OpenAI gpt-5.4-nano', description: '反証結果を反映した完成案を作成' },
        ],
    },
    'product-conversation': {
        title: 'AI商品案を再評価中',
        description: '追加質問を再調査し、必要に応じてPerplexityも使って回答と更新案をまとめます。',
        steps: [
            { label: 'Web調査', provider: AUTO_RESEARCH_PROVIDER, description: '追加質問の内容に応じて調査先を自動選択' },
            { label: '海外・本場比較', provider: 'Perplexity Sonar', description: '追加質問に関わる海外情報を比較' },
            { label: 'レシピ統合', provider: 'Groq GPT-OSS 120B', description: '現在案の見直し点を整理' },
            { label: '食品科学検証', provider: 'Groq GPT-OSS 120B', description: '工程と食感への影響を確認' },
            { label: '科学・安全性検証', provider: 'Groq Compound', description: '回答内容の再現性と安全性を確認' },
            { label: '最終クロスチェック', provider: 'OpenAI gpt-5.4-mini', description: '回答案を批判的に査読' },
            { label: '回答・更新案の統合', provider: 'OpenAI gpt-5.4-nano', description: '会話回答とレシピ更新案をまとめる' },
        ],
    },
    'improvement-generate': {
        title: 'AI改善提案を進行中',
        description: '料理文化・海外情報はPerplexityで確認し、OpenAIが監査・統合・反証を担当します。',
        steps: [
            { label: '料理文化調査', provider: 'Perplexity Sonar', description: '料理の由来・文脈・クラシックとの距離を確認' },
            { label: 'Web調査', provider: AUTO_RESEARCH_PROVIDER, description: '改善テーマに応じて調査先を自動選択' },
            { label: '海外・本場比較', provider: 'Perplexity Sonar', description: '海外・本場の標準と現行レシピを比較' },
            { label: 'レシピ統合', provider: 'Groq GPT-OSS 120B', description: '材料構成と改善方針を整理' },
            { label: '食品科学検証', provider: 'Groq GPT-OSS 120B', description: '工程の妥当性と食感への影響を確認' },
            { label: '科学・安全性検証', provider: 'Groq Compound', description: '温度・衛生・再現性を確認' },
            { label: '最終クロスチェック', provider: 'OpenAI gpt-5.4-mini', description: '改善案の矛盾や実務上の懸念を査読' },
            { label: '改善案の統合', provider: 'OpenAI gpt-5.4-nano', description: '各所見を保存可能な改善案へ統合' },
            { label: '反証レビュー', provider: 'OpenAI gpt-5.4-mini', description: '完成案の弱点を批判的に検証' },
            { label: '最終修正', provider: 'OpenAI gpt-5.4-nano', description: '反証結果を反映して完成' },
        ],
    },
    'improvement-conversation': {
        title: 'AI改善案を再評価中',
        description: '追加質問に合わせて、Perplexityの調査結果も含め改善案を再評価します。',
        steps: [
            { label: '料理文化調査', provider: 'Perplexity Sonar', description: '質問に関わる料理文脈を再確認' },
            { label: 'Web調査', provider: AUTO_RESEARCH_PROVIDER, description: '追加質問の内容に応じて調査先を自動選択' },
            { label: '海外・本場比較', provider: 'Perplexity Sonar', description: '海外情報と今回の質問を照合' },
            { label: 'レシピ統合', provider: 'Groq GPT-OSS 120B', description: '材料・工程の見直し点を整理' },
            { label: '食品科学検証', provider: 'Groq GPT-OSS 120B', description: '食感と安定性への影響を確認' },
            { label: '科学・安全性検証', provider: 'Groq Compound', description: '温度・衛生・再現性を確認' },
            { label: '最終クロスチェック', provider: 'OpenAI gpt-5.4-mini', description: '回答案を批判的に査読' },
            { label: '回答・更新案の統合', provider: 'OpenAI gpt-5.4-nano', description: '会話回答と更新内容をまとめる' },
        ],
    },
};

export const getRecipeAiProgressConfig = (mode) => (
    PROGRESS_CONFIGS[mode] || {
        title: 'AIエージェントを実行中',
        description: 'AIエージェントが調査と統合を進めています。',
        steps: [{ label: '調査と統合', provider: 'AI自動選択', description: '進行状況を確認中' }],
    }
);
