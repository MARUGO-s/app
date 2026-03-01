const t=`import React, { useEffect } from 'react';
import './LevainGuide.css';

export const LevainGuide = ({ onBack }) => {
    // Scroll to top on mount
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="levain-guide-container">
            <header className="levain-guide-header">
                <h1>LEVAIN GUIDE</h1>
                <p className="subtitle">ルヴァン種 完全ガイド</p>
                <p className="subtitle">科学と技術の融合</p>
                <div className="divider"></div>
            </header>

            <main className="levain-guide-main">
                {/* セクション1: ルヴァン種とは */}
                <div className="levain-section">
                    <h2>ルヴァン種とは</h2>
                    <div className="levain-content">
                        <p>ルヴァン種（Levain）はフランス語で「発酵種」を意味し、小麦粉と水を混ぜて自然発酵させた天然酵母です。野生酵母と乳酸菌が共生する複雑な微生物エコシステムです。</p>

                        <h3>微生物的構成</h3>
                        <p>ルヴァン種に含まれる主要な微生物：</p>
                        <div className="highlight-box">
                            <strong>酵母（Yeast）：</strong> Saccharomyces cerevisiae, Saccharomyces pastorianus など<br />
                            <strong>乳酸菌（LAB）：</strong> Lactobacillus plantarum, Lactobacillus brevis など<br />
                            <strong>酢酸菌：</strong> Acetobacter aceti など
                        </div>

                        <h3>発酵の化学反応</h3>
                        <div className="science-box">
                            糖の分解（グルコース）：<br />
                            <div className="formula">C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂ + 熱<br />
                                (グルコース → エタノール + 二酸化炭素 + 熱)</div>

                            乳酸菌による乳酸発酵：<br />
                            <div className="formula">C₆H₁₂O₆ → 2C₃H₆O₃<br />
                                (グルコース → 乳酸)</div>
                        </div>

                        <h3>ルヴァン種の利点</h3>
                        <div className="highlight-box">
                            ✓ 複雑な香味成分の生成<br />
                            ✓ 自然な酸味と風味<br />
                            ✓ 長期保存性の向上<br />
                            ✓ 消化性の改善<br />
                            ✓ グルテン分解による構造改善<br />
                            ✓ ドライイーストより豊かな風味
                        </div>
                    </div>
                </div>

                {/* セクション2: ルヴァン種の作成 */}
                <div className="levain-section">
                    <h2>ルヴァン種の作成方法</h2>
                    <div className="levain-content">
                        <h3>初種（種起こし）- 7-10日間</h3>

                        <div className="timeline">
                            <div className="timeline-item">
                                <span className="timeline-label">【Day 1-2】 初期混合</span>
                                <p>準強力粉100g + 水100ml を混ぜて、常温（20-22℃）で放置</p>
                                <div className="highlight-box">
                                    <strong>科学的背景：</strong> 環境中の野生酵母と乳酸菌が小麦粉に付着しており、水を加えることで活動を開始します。この段階では雑菌が増殖する可能性もあります。
                                </div>
                            </div>

                            <div className="timeline-item">
                                <span className="timeline-label">【Day 3-4】 最初の給餌</span>
                                <p>元種の50%を取り出し、準強力粉50g + 水50ml を加える</p>
                                <p>（例：混合物100g → 50g取り出して、50g + 50mlを加える）</p>
                                <div className="highlight-box">
                                    <strong>理由：</strong> 初期段階の雑菌を減らし、望ましい微生物を優先的に増殖させるための「淘汰圧」です。酸性環境（pH 3.5-4.5）が形成され、悪玉菌が排除されます。
                                </div>
                            </div>

                            <div className="timeline-item">
                                <span className="timeline-label">【Day 5-6】 2回目の給餌</span>
                                <p>元種の50%を取り出し、準強力粉50g + 水50ml を加える</p>
                                <div className="success-box">
                                    ✓ 泡立ちが見え始めます<br />
                                    ✓ 独特の酸っぱい香りが強くなります<br />
                                    ✓ 酵母の活動が活発化
                                </div>
                            </div>

                            <div className="timeline-item">
                                <span className="timeline-label">【Day 7-10】 3回目以降の給餌</span>
                                <p>1日1回、元種の50%を取り出し、粉と水を1:1で加える</p>
                                <div className="highlight-box">
                                    <strong>完成の目安：</strong><br />
                                    • 泡立ちが活発（15分で倍になる程度）<br />
                                    • 香りが酸っぱく香ばしい<br />
                                    • 液体表面に泡が浮いている<br />
                                    • pH 3.5-4.0の範囲
                                </div>
                            </div>
                        </div>

                        <h3>推奨配合</h3>
                        <div className="comparison-table-container">
                            <table className="levain-table">
                                <thead>
                                    <tr>
                                        <th>段階</th>
                                        <th>粉量(g)</th>
                                        <th>水量(ml)</th>
                                        <th>塩(g)</th>
                                        <th>特徴</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>初種（種起こし用）</td>
                                        <td>100</td>
                                        <td>100</td>
                                        <td>0</td>
                                        <td>常温保存、毎日給餌</td>
                                    </tr>
                                    <tr>
                                        <td>本種（保存用）</td>
                                        <td>100</td>
                                        <td>100</td>
                                        <td>2</td>
                                        <td>冷蔵庫、週1回給餌</td>
                                    </tr>
                                    <tr>
                                        <td>パン作り用</td>
                                        <td>100</td>
                                        <td>100</td>
                                        <td>0</td>
                                        <td>常温、使用前に活性化</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* セクション3: 日常管理 */}
                <div className="levain-section">
                    <h2>ルヴァン種の日常管理</h2>
                    <div className="levain-content">
                        <h3>保存温度と発酵速度の関係</h3>
                        <div className="comparison-table-container">
                            <table className="levain-table">
                                <thead>
                                    <tr>
                                        <th>温度</th>
                                        <th>発酵速度</th>
                                        <th>特徴</th>
                                        <th>保存期間</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>5-8℃（冷蔵庫）</td>
                                        <td>非常に遅い</td>
                                        <td>活動が休止状態。長期保存に最適</td>
                                        <td>2-4週間</td>
                                    </tr>
                                    <tr>
                                        <td>15-18℃</td>
                                        <td>遅い</td>
                                        <td>冷蔵よりも活動的。秋冬向け</td>
                                        <td>1-2週間</td>
                                    </tr>
                                    <tr>
                                        <td>20-22℃（常温）</td>
                                        <td>中程度</td>
                                        <td>バランスの取れた発酵。春秋最適</td>
                                        <td>3-5日</td>
                                    </tr>
                                    <tr>
                                        <td>25-28℃</td>
                                        <td>速い</td>
                                        <td>酵母の活動が活発。夏向け</td>
                                        <td>2-3日</td>
                                    </tr>
                                    <tr>
                                        <td>30℃以上</td>
                                        <td>非常に速い</td>
                                        <td>酢酸菌が優先。風味がきつくなる</td>
                                        <td>1-2日</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h3>給餌スケジュール（冷蔵庫保存）</h3>
                        <div className="step-list">
                            <div className="step">
                                <strong>基本：週1回（金曜夜または土曜朝）</strong><br />
                                ルヴァン100gを取り出し、粉50g + 水50mlを加える
                            </div>
                            <div className="step">
                                <strong>活性化（使用前日）</strong><br />
                                冷蔵庫から出し、常温で8-12時間放置。泡立ちが活発になるまで待つ
                            </div>
                            <div className="step">
                                <strong>使用直前の確認</strong><br />
                                ピークの見分け方：スプーンで持ち上げると、粘りが強く、内部に気泡がみられる状態
                            </div>
                        </div>

                        <h3>科学的な給餌の原理</h3>
                        <div className="science-box">
                            <strong>栄養源の補給：</strong> 粉と水を足すことで、グルコース、タンパク質、ミネラルを提供<br />
                            <strong>老廃物の除去：</strong> 古い液体を部分的に捨てることで、アルコール発酵の副産物や有機酸を除去<br />
                            <strong>微生物バランスの維持：</strong> 定期的な給餌により、酵母と乳酸菌の比率を最適に保つ
                        </div>

                        <h3>塩の役割</h3>
                        <div className="highlight-box">
                            <strong>塩濃度2%（例：100mlの水に2g）</strong><br />
                            • 浸透圧により微生物の活動を緩和<br />
                            • 不要な菌の増殖を抑制<br />
                            • 風味の熟成を促進<br />
                            • 長期保存性の向上<br />
                            ⚠️ 注意：パン作り時に塩入りルヴァンを使用する場合は、レシピの塩量を調整
                        </div>
                    </div>
                </div>

                {/* セクション4: 活性化と準備 */}
                <div className="levain-section">
                    <h2>使用前の活性化プロセス</h2>
                    <div className="levain-content">
                        <h3>パン作り2日前から準備する場合</h3>
                        <div className="step-list">
                            <div className="step">
                                <strong>Day 1（2日前）朝 8:00</strong><br />
                                冷蔵庫のルヴァン種50gを取り出す→粉25g + 水25ml を加える→常温放置
                            </div>
                            <div className="step">
                                <strong>Day 1 昼 14:00</strong><br />
                                泡立ちを確認→粉25g + 水25ml を再度加える（2回目の給餌）
                            </div>
                            <div className="step">
                                <strong>Day 1 夜 20:00</strong><br />
                                ピークに達しているはず（泡が盛り上がった状態）→使用可能
                            </div>
                        </div>

                        <h3>ピークの見分け方（重要）</h3>
                        <div className="warning-box">
                            <strong>❌ 過発酵（遅すぎた）：</strong> 泡が萎んで液体が分離している状態<br />
                            影響：香りが酸っぱすぎてパンの風味が損なわれる<br />
                            <br />
                            <strong>⚠️ 注意：</strong> 見た目では分からなくても、pH（酸度）で判断するのが正確です。<br />
                            目安：pH 3.5-4.0が最適（pH試験紙で確認可能）
                        </div>

                        <h3>温度による活性化時間の推定</h3>
                        <div className="comparison-table-container">
                            <table className="levain-table">
                                <thead>
                                    <tr>
                                        <th>室温</th>
                                        <th>活性化時間</th>
                                        <th>給餌回数</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>18℃以下</td>
                                        <td>16-24時間</td>
                                        <td>1回</td>
                                    </tr>
                                    <tr>
                                        <td>20-22℃</td>
                                        <td>12-16時間</td>
                                        <td>2回</td>
                                    </tr>
                                    <tr>
                                        <td>24-26℃</td>
                                        <td>8-12時間</td>
                                        <td>2回</td>
                                    </tr>
                                    <tr>
                                        <td>28℃以上</td>
                                        <td>4-8時間</td>
                                        <td>2回</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* セクション5: トラブルシューティング */}
                <div className="levain-section">
                    <h2>トラブルシューティング</h2>
                    <div className="levain-content">
                        <h3>問題1：泡立たない</h3>
                        <div className="warning-box">
                            <strong>原因：</strong> 酵母の活動が不十分<br />
                            <strong>解決策：</strong><br />
                            1. 温度を確認（22℃が最適）<br />
                            2. 給餌頻度を増やす（1日2回に）<br />
                            3. 週1回、ルヴァン全体を新しい容器に移す（酸性物質の蓄積をリセット）<br />
                            4. 1-2週間様子を見る（新たな酵母の増殖を待つ）
                        </div>

                        <h3>問題2：カビが生えた</h3>
                        <div className="warning-box">
                            <strong>原因：</strong> pH管理の失敗または衛生状態の悪化<br />
                            <strong>対策：</strong><br />
                            ❌ そのルヴァン種は廃棄してください（回復不可）<br />
                            ✓ 新規で種起こしを開始
                        </div>

                        <h3>問題3：酸っぱい（酢のような香り）</h3>
                        <div className="warning-box">
                            <strong>原因：</strong> 酢酸菌が優位になっている、または過発酵<br />
                            <strong>解決策：</strong><br />
                            1. 給餌後、ピークを逃さず使用する<br />
                            2. 保存温度を低めに設定（15℃程度）<br />
                            3. 給餌時に古い液体をしっかり捨てる（80%程度取り出す）
                        </div>

                        <h3>問題4：液体が分離している</h3>
                        <div className="success-box">
                            実は正常です！これは「フールイッシュ」と呼ばれる現象<br />
                            <br />
                            <strong>原因：</strong> 酵母が発酵時に産生したアルコールが分離<br />
                            <strong>対応：</strong> 使用前に軽く混ぜるだけ。心配不要
                        </div>

                        <h3>問題5：粘度が低い（水っぽい）</h3>
                        <div className="highlight-box">
                            <strong>原因：</strong> 給餌の粉と水の比率がずれている<br />
                            <strong>解決策：</strong><br />
                            1. 次の給餌では粉の比率を増やす（1:0.8の比率に）<br />
                            2. または、ガーゼで水分を軽く吸い取る（毎日）<br />
                            3. 保存容器の湿度を低くする
                        </div>
                    </div>
                </div>

                {/* セクション6: 科学的な監視指標 */}
                <div className="levain-section">
                    <h2>科学的な監視と管理</h2>
                    <div className="levain-content">
                        <h3>pH管理（最重要）</h3>
                        <div className="highlight-box">
                            <strong>pH試験紙（4-8.0範囲）の使用推奨</strong><br />
                            <br />
                            • pH 7.0以上：酵母活動が不十分、雑菌の可能性<br />
                            • pH 4.5-5.5：健全な状態（初期段階）<br />
                            • pH 3.5-4.0：最適状態（パン作りに最適）<br />
                            • pH 3.0以下：過発酵、酸味が強い
                        </div>

                        <h3>微視的観察</h3>
                        <div className="comparison-table-container">
                            <table className="levain-table">
                                <thead>
                                    <tr>
                                        <th>観察項目</th>
                                        <th>健全な状態</th>
                                        <th>問題がある状態</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>色</td>
                                        <td>薄い茶色～クリーム色</td>
                                        <td>黒色、グレー、ピンク</td>
                                    </tr>
                                    <tr>
                                        <td>表面</td>
                                        <td>多くの小さな気泡</td>
                                        <td>大きな泡、凹み、カビ</td>
                                    </tr>
                                    <tr>
                                        <td>香り</td>
                                        <td>酸っぱい＋香ばしい</td>
                                        <td>腐臭、かび臭</td>
                                    </tr>
                                    <tr>
                                        <td>粘度</td>
                                        <td>ヨーグルト程度</td>
                                        <td>非常に水っぽい、またはどろどろ</td>
                                    </tr>
                                    <tr>
                                        <td>液体分離</td>
                                        <td>少量の液体がある程度</td>
                                        <td>大量の液体分離、分層</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h3>酸度と焼き上がりの関係</h3>
                        <div className="science-box">
                            <strong>pH 3.8-4.0（推奨）：</strong> 香りが複雑、クラストが薄く香ばしい<br />
                            <strong>pH 3.5以下（過発酵）：</strong> 酸味が目立つ、クラムが暗くなる可能性<br />
                            <strong>pH 4.5以上（未熟）：</strong> 香りが薄い、クラムが粗くなる傾向
                        </div>
                    </div>
                </div>

                {/* セクション7: プロのテクニック */}
                <div className="levain-section">
                    <h2>プロのテクニック</h2>
                    <div className="levain-content">
                        <h3>複数のルヴァン種を管理する理由</h3>
                        <div className="highlight-box">
                            <strong>戦略的な種分け：</strong><br />
                            • 保存用（冷蔵庫、塩入り）：長期保存向け、週1回給餌<br />
                            • 作業用（常温、塩なし）：毎日使用、毎日給餌<br />
                            • バックアップ用：冷凍保存（-20℃、3ヶ月まで可能）
                        </div>

                        <h3>季節別の温度管理</h3>
                        <div className="comparison-table-container">
                            <table className="levain-table">
                                <thead>
                                    <tr>
                                        <th>季節</th>
                                        <th>推奨温度</th>
                                        <th>給餌間隔</th>
                                        <th>ポイント</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>春（15-20℃）</td>
                                        <td>18-20℃</td>
                                        <td>1-2日</td>
                                        <td>気温変動に注意</td>
                                    </tr>
                                    <tr>
                                        <td>夏（25℃+）</td>
                                        <td>22-24℃</td>
                                        <td>毎日</td>
                                        <td>冷蔵庫が最適。酸が進みやすい</td>
                                    </tr>
                                    <tr>
                                        <td>秋（18-22℃）</td>
                                        <td>20-22℃</td>
                                        <td>1-2日</td>
                                        <td>最適な発酵条件。品質向上期</td>
                                    </tr>
                                    <tr>
                                        <td>冬（5-15℃）</td>
                                        <td>18℃（室内）</td>
                                        <td>2-3日</td>
                                        <td>冷蔵庫より常温放置が効率的</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h3>風味のコントロール</h3>
                        <div className="highlight-box">
                            <strong>酸味を抑えたい場合（マイルドなパン向け）：</strong><br />
                            ✓ ピークの早めの段階で使用（気泡が出始めた時点）<br />
                            ✓ 温度を24℃以上に保つ（発酵を短期化）<br />
                            ✓ 給餌頻度を増やす（栄養分を豊富に）<br />
                            <br />
                            <strong>酸味を増やしたい場合（フランスパン向け）：</strong><br />
                            ✓ ピークを過ぎた段階で使用<br />
                            ✓ 温度を18℃以下に保つ（ゆっくり発酵）<br />
                            ✓ 給餌頻度を減らす（栄養不足で酸が進む）
                        </div>

                        <h3>液種（ルヴァンリキッド）の作成</h3>
                        <div className="step-list">
                            <div className="step">
                                <strong>目的：</strong> 高加水のパン生地への混合を容易にする<br />
                                通常のルヴァン種（粉:水=1:1）→ 液種（粉:水=1:2 or 1:3）
                            </div>
                            <div className="step">
                                <strong>作成方法：</strong><br />
                                ルヴァン種100g + 粉50g + 水150ml を混ぜて、常温で12-24時間発酵<br />
                                給餌頻度は通常のルヴァン種より多く（1日1-2回）
                            </div>
                            <div className="step">
                                <strong>利点：</strong><br />
                                • 高加水生地への混合が容易<br />
                                • より速い発酵（表面積が大きいため）<br />
                                • 吸水性の異なるレシピに対応可能
                            </div>
                        </div>
                    </div>
                </div>

                {/* セクション8: 参考値 */}
                <div className="levain-section">
                    <h2>参考値とデータ</h2>
                    <div className="levain-content">
                        <h3>ルヴァン種の成分組成</h3>
                        <div className="highlight-box">
                            <strong>健全なルヴァン種100mlあたり：</strong><br />
                            • 酵母菌：1×10⁸ to 1×10⁹ CFU/ml<br />
                            • 乳酸菌：1×10⁹ to 1×10¹⁰ CFU/ml<br />
                            • pH：3.5-4.0<br />
                            • アルコール含有率：0.5-1.5%（重量比）<br />
                            • 乳酸含有率：0.3-0.8%（重量比）
                        </div>

                        <h3>パン作りへのルヴァン種の配合比率</h3>
                        <div className="comparison-table-container">
                            <table className="levain-table">
                                <thead>
                                    <tr>
                                        <th>パンのタイプ</th>
                                        <th>ルヴァン種の比率</th>
                                        <th>味わいの特徴</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>ロデブ</td>
                                        <td>15-25% (粉比)</td>
                                        <td>複雑な香り、適度な酸味</td>
                                    </tr>
                                    <tr>
                                        <td>バゲット</td>
                                        <td>5-15%</td>
                                        <td>軽やかな香り、マイルド</td>
                                    </tr>
                                    <tr>
                                        <td>チャバタ</td>
                                        <td>20-30%</td>
                                        <td>濃厚な香り、強い酸味</td>
                                    </tr>
                                    <tr>
                                        <td>ソードー</td>
                                        <td>30-50%</td>
                                        <td>非常に酸っぱい、複雑</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h3>発酵時間の推定式（簡易版）</h3>
                        <div className="formula">
                            発酵時間（時間）≈ 18 ÷ （温度 - 8）<br />
                            <br />
                            例：<br />
                            • 温度20℃：18 ÷ (20-8) = 1.5時間<br />
                            • 温度24℃：18 ÷ (24-8) = 1.125時間<br />
                            • 温度28℃：18 ÷ (28-8) = 0.9時間（約54分）
                        </div>
                    </div>
                </div>
            </main>

            <footer className="levain-footer">
                <p>« Maitriser le Levain, c'est comprendre la vie »</p>
                <p>ルヴァン種を制する者が、パンを制する</p>
            </footer>

            <button className="levain-back-button" onClick={onBack}>
                <span>←</span> 戻る
            </button>
        </div>
    );
};
`;export{t as default};
