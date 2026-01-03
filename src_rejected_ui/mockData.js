export const mockRecipes = [
    {
        id: 1,
        title: "濃厚きのこのリゾット",
        description: "アルボリオ米、新鮮なきのこ、パルメザンチーズで作る、濃厚で心温まるイタリアの定番料理。",
        image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&q=80&w=800",
        prepTime: "15分",
        cookTime: "30分",
        servings: 4,
        tags: ["イタリアン", "ディナー", "ベジタリアン"],
        ingredients: [
            { name: "アルボリオ米", quantity: "2", unit: "カップ" },
            { name: "マッシュルーム", quantity: "1", unit: "パック" },
            { name: "チキンブイヨン", quantity: "4", unit: "カップ" },
            { name: "白ワイン", quantity: "1/2", unit: "カップ" },
            { name: "玉ねぎ（みじん切り）", quantity: "1", unit: "個" },
            { name: "ニンニク（みじん切り）", quantity: "2", unit: "片" },
            { name: "パルメザンチーズ", quantity: "1/2", unit: "カップ" },
            { name: "バター", quantity: "2", unit: "大さじ" },
            { name: "パセリ（飾り用）", quantity: "", unit: "" }
        ],
        steps: [
            "大きな鍋でブイヨンを弱火で温めておきます。",
            "別のフライパンでバターを熱し、きのこを炒めて取り出しておきます。",
            "同じフライパンで玉ねぎとニンニクを透明になるまで炒め、米を加えて2〜3分炒めます。",
            "白ワインを加えてアルコールを飛ばしながら混ぜます。",
            "温かいブイヨンをお玉1杯ずつ加え、水分が吸収されるまで混ぜ続けます。",
            "米が柔らかくなりクリーミーになったら、きのこ、チーズ、残りのバターを混ぜ合わせます。",
            "塩コショウで味を調え、パセリを散らして完成です。"
        ]
    },
    {
        id: 2,
        title: "スパイシー・ガパオライス",
        description: "ホーリーバジルと唐辛子が効いた本格的な鶏肉のガパオ炒め。目玉焼きを乗せて。",
        image: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&q=80&w=800",
        prepTime: "10分",
        cookTime: "10分",
        servings: 2,
        tags: ["タイ料理", "辛い", "時短"],
        ingredients: [
            { name: "鶏ひき肉", quantity: "200", unit: "g" },
            { name: "ホーリーバジル", quantity: "1", unit: "束" },
            { name: "赤唐辛子", quantity: "2", unit: "本" },
            { name: "卵", quantity: "2", unit: "個" },
            { name: "ご飯", quantity: "2", unit: "膳" },
            { name: "ナンプラー", quantity: "1", unit: "大さじ" },
            { name: "オイスターソース", quantity: "1", unit: "小さじ" }
        ],
        steps: [
            "フライパンで唐辛子とニンニクを香りが出るまで炒めます。",
            "鶏ひき肉を加えて色が変わるまで炒めます。",
            "調味料を加えて味を馴染ませ、最後にバジルを加えてさっと炒めます。",
            "別のフライパンで目玉焼きを作ります。",
            "ご飯の上にガパオと目玉焼きを乗せて完成です。"
        ]
    },
    {
        id: 3,
        title: "クラシック・ビーフバーガー",
        description: "ジューシーな自家製ビーフパティ、新鮮なレタス、トマト、特製ソースの絶品バーガー。",
        image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=800",
        prepTime: "20分",
        cookTime: "15分",
        servings: 4,
        tags: ["アメリカン", "BBQ", "肉料理"],
        ingredients: [
            { name: "牛ひき肉パティ", quantity: "4", unit: "枚" },
            { name: "バンズ", quantity: "4", unit: "個" },
            { name: "レタス", quantity: "4", unit: "枚" },
            { name: "トマト", quantity: "1", unit: "個" },
            { name: "チェダーチーズ", quantity: "4", unit: "枚" },
            { name: "ピクルス", quantity: "8", unit: "枚" },
            { name: "特製ソース", quantity: "適量", unit: "" }
        ],
        steps: [
            "パティを塩コショウで味付けし、強火で両面を焼きます。",
            "焼き上がる直前にチーズを乗せて溶かします。",
            "バンズを軽くトーストします。",
            "バンズにソースを塗り、レタス、トマト、パティ、ピクルスを挟んで完成です。"
        ]
    },
    {
        id: 4,
        title: "フレッシュ・グリークサラダ",
        description: "きゅうり、トマト、オリーブ、フェタチーズをオレガノドレッシングで和えた爽やかなサラダ。",
        image: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&q=80&w=800",
        prepTime: "15分",
        cookTime: "0分",
        servings: 2,
        tags: ["ギリシャ料理", "サラダ", "ヘルシー"],
        ingredients: [
            { name: "きゅうり", quantity: "2", unit: "本" },
            { name: "トマト", quantity: "2", unit: "個" },
            { name: "フェタチーズ", quantity: "100", unit: "g" },
            { name: "黒オリーブ", quantity: "10", unit: "個" },
            { name: "赤玉ねぎ", quantity: "1/4", unit: "個" },
            { name: "オリーブオイル", quantity: "2", unit: "大さじ" },
            { name: "オレガノ", quantity: "少々", unit: "" }
        ],
        steps: [
            "野菜を一口大に切ります。",
            "ボウルに野菜とオリーブ、サイコロ状に切ったフェタチーズを入れます。",
            "オリーブオイルとオレガノを回しかけ、軽く混ぜ合わせて完成です。"
        ]
    }
];
