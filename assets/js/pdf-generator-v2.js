// 新しいPDF生成機能 - 文字折り返し対応版

// jsPDFライブラリの動的読み込み
async function loadJSPDFLibraryV2() {
  if (window.jsPDF) return window.jsPDF;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jsPDF);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// HTMLエスケープ関数
function escapeHtmlV2(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Supabase Functionsを経由して画像を取得する関数
async function fetchImageViaSupabaseV2(imageUrl) {
  try {
    
    // supabaseオブジェクトが存在するかチェック
    if (typeof supabase === 'undefined' || !supabase) {
      console.warn('⚠️ V2: supabaseオブジェクトが利用できません');
      return null;
    }
    
    
    const { data, error } = await supabase.functions.invoke('fetch-image', {
      body: { imageUrl: imageUrl }
    });

    if (error) {
      console.warn('⚠️ V2: Supabase Functions エラー:', error);
      return null;
    }

    if (data && data.success && data.dataUrl) {
      return data.dataUrl;
    } else {
      console.warn('⚠️ V2: Supabase Functions レスポンスエラー:', data);
      return null;
    }
  } catch (error) {
    console.warn('⚠️ V2: Supabase Functions 呼び出しエラー:', error);
    return null;
  }
}

// プロキシ経由で画像をBase64に変換（CORS回避）V2版
async function convertImageViaProxyV2(imageUrl) {
  try {

    // プロキシ経由でfetch（CORS回避）
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result);
      };
      reader.onerror = () => {
        console.error('❌ V2: FileReader エラー');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });

  } catch (error) {
    console.error('❌ V2: プロキシ経由変換エラー:', error);
    return null;
  }
}

// 画像をBase64エンコードする関数（複数のフォールバック方法）V2版
async function convertImageToBase64V2(imageUrl) {

  // 方法1: プロキシ経由（CORS回避）
  const proxyResult = await convertImageViaProxyV2(imageUrl);
  if (proxyResult) {
    return proxyResult;
  } else {
  }

  // 方法2: 直接変換（CORS制限あり）
  return new Promise((resolve) => {

    // 複数の方法で画像読み込みを試行
    let imageLoaded = false;

    // 方法1: crossOrigin = 'anonymous'で試行
    const tryWithCrossOrigin = () => {
      return new Promise((resolveCross, rejectCross) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            imageLoaded = true;
            resolveCross(base64);
          } catch (error) {
            console.warn('⚠️ V2: Canvas描画CORS エラー (crossOrigin):', error);
            rejectCross(error);
          }
        };
        img.onerror = rejectCross;
        img.src = imageUrl;
      });
    };

    // 方法2: crossOriginなしで試行
    const tryWithoutCrossOrigin = () => {
      return new Promise((resolveNoCross, rejectNoCross) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            imageLoaded = true;
            resolveNoCross(base64);
          } catch (error) {
            console.warn('⚠️ V2: Canvas描画エラー (no crossOrigin):', error);
            rejectNoCross(error);
          }
        };
        img.onerror = rejectNoCross;
        img.src = imageUrl;
      });
    };
    
    // まずcrossOriginで試行
    tryWithCrossOrigin()
      .then(base64 => {
        if (!imageLoaded) {
          imageLoaded = true;
          resolve(base64);
        }
      })
      .catch(() => {
        // crossOriginで失敗した場合、crossOriginなしで試行
        tryWithoutCrossOrigin()
          .then(base64 => {
            if (!imageLoaded) {
              imageLoaded = true;
              resolve(base64);
            }
          })
          .catch(() => {
            console.warn('⚠️ V2: 全ての画像読み込み方法が失敗:', imageUrl);
            resolve(null);
          });
      });
  });
}

// メインのPDF生成関数
async function generatePDFFromHTMLV2(doc, title, ingredients, steps, notes, imageUrl = null) {
  
  // 一時的なコンテナを作成
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    top: -10000px;
    left: -10000px;
    width: 800px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    line-height: 1.6;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
  `;

  // 画像をBase64エンコードして処理
  let recipeImageData = null;
  let processedImageUrl = null; // 初期値をnullに変更して、実際に変換された場合のみ使用

  // 画像がある場合はBase64エンコードを試行
  if (imageUrl && imageUrl.trim()) {
    
    try {
      // まずSupabase Functions経由で画像を取得
      if (typeof supabase !== 'undefined' && supabase) {
        const { data, error } = await supabase.functions.invoke('fetch-image', {
          body: { imageUrl: imageUrl }
        });

        if (!error && data && data.success && data.dataUrl) {
          processedImageUrl = data.dataUrl;
        } else {
          console.warn('⚠️ V2: Supabase Functions失敗 - error:', error, 'data:', data);
          processedImageUrl = await convertImageToBase64V2(imageUrl);
        }
      } else {
        processedImageUrl = await convertImageToBase64V2(imageUrl);
      }

      if (processedImageUrl && processedImageUrl.startsWith('data:')) {
      } else {
        console.warn('⚠️ V2: 画像のBase64エンコード失敗, 元のURLを使用');
        processedImageUrl = imageUrl; // フォールバックとして元のURLを使用
      }
    } catch (error) {
      console.warn('⚠️ V2: 画像処理エラー:', error);
    }
  } else {
  }

  // タイトル部分
  let titleSection = `
    <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #4a90e2; padding-bottom: 15px;">
      <h1 style="color: #2c3e50; margin: 0; font-size: 24px; font-weight: bold;">${escapeHtmlV2(title)}</h1>
    </div>
  `;

  // 画像がある場合は追加
  if (processedImageUrl && processedImageUrl.trim()) {
    titleSection = `
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="border-bottom: 2px solid #4a90e2; padding-bottom: 15px;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 24px; font-weight: bold;">${escapeHtmlV2(title)}</h1>
        </div>
      </div>
    `;
  } else {
  }

  // メモ部分
  let notesSection = '';
  if (notes && notes.trim()) {
    notesSection = `
      <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-left: 4px solid #4a90e2; border-radius: 4px; width: 100%; box-sizing: border-box;">
        <p style="margin: 0; color: #555; word-wrap: break-word; word-break: break-all; overflow-wrap: anywhere; white-space: normal; line-height: 1.6; width: 100%; box-sizing: border-box;">${escapeHtmlV2(notes)}</p>
      </div>
    `;
  }

  // 材料セクション
  const ingredientsSection = generateIngredientsV2(ingredients);

  // 手順セクション  
  const stepsSection = generateStepsV2(steps);

  // レイアウト部分 - 2カラム（材料35% + 作り方65%）
  const contentHTML = `
    <div style="display: flex; width: 100%; gap: 30px;">
      <div style="flex: 0 0 35%; min-width: 0;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px; font-size: 16px;">材料</h2>
        ${ingredientsSection}
      </div>
      <div style="flex: 1; min-width: 0;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px; font-size: 16px;">作り方</h2>
        ${stepsSection}
      </div>
    </div>
  `;

  const finalHTML = titleSection + notesSection + contentHTML;

  if (finalHTML.includes('data:image')) {
  } else {
    if (processedImageUrl && processedImageUrl.startsWith('data:')) {
    }
  }

  container.innerHTML = finalHTML;
  document.body.appendChild(container);

  // app-main-13の画像処理方法を適用
  const images = container.querySelectorAll('img');
  for (const img of images) {
    if (img.src && img.src.startsWith('http')) {
      
      // 複数の方法で画像読み込みを試行
      let imageLoaded = false;
      
      // 方法1: crossOrigin = 'anonymous'で試行
      try {
        await new Promise((resolve, reject) => {
          const testImg = new Image();
          testImg.crossOrigin = 'anonymous';
          testImg.onload = () => {
            img.crossOrigin = 'anonymous';
            imageLoaded = true;
            resolve();
          };
          testImg.onerror = reject;
          testImg.src = img.src;
        });
      } catch (error) {
        console.warn('⚠️ V2: crossOriginでの読み込み失敗:', img.src);
        
        // 方法2: crossOriginなしで試行
        try {
          await new Promise((resolve, reject) => {
            const testImg = new Image();
            testImg.onload = () => {
              imageLoaded = true;
              resolve();
            };
            testImg.onerror = reject;
            testImg.src = img.src;
          });
        } catch (error2) {
          console.warn('⚠️ V2: 通常読み込みでも失敗:', img.src);
        }
      }
      
      // 読み込みに失敗した場合はプレースホルダーに置換
      if (!imageLoaded) {
        console.warn('❌ V2: 外部画像の読み込み完全失敗、プレースホルダーに置換:', img.src);
        img.style.display = 'none';
        const placeholder = document.createElement('div');
        placeholder.style.cssText = `
          width: 100%;
          height: 150px;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          border: 2px dashed #a0a0a0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #666;
          font-size: 12px;
          margin: 10px 0;
          border-radius: 8px;
        `;
        placeholder.innerHTML = `
          <div style="font-size: 24px; margin-bottom: 8px;">📷</div>
          <div>画像（外部リンクのため表示できません）</div>
          <div style="font-size: 10px; margin-top: 4px; opacity: 0.7;">${img.src.length > 50 ? img.src.substring(0, 50) + '...' : img.src}</div>
        `;
        img.parentNode.insertBefore(placeholder, img);
      }
    }
  }

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true, // CORSを有効にして、可能な限り画像を読み込む
      allowTaint: true, // 汚染されたキャンバスを許可
      backgroundColor: '#ffffff',
      logging: false, // html2canvasのログを無効化
      imageTimeout: 30000,
      removeContainer: false,
      foreignObjectRendering: false,
      width: 800,
      height: container.scrollHeight,
      ignoreElements: (element) => {
        // プレースホルダーに置換された画像は無視しない
        if (element.tagName === 'IMG' && element.style.display === 'none') {
          return true;
        }
        return false;
      },
      onclone: (clonedDoc) => {
        // クローンされたドキュメントで画像の処理を再実行
        const clonedImages = clonedDoc.querySelectorAll('img');
        clonedImages.forEach(img => {
          if (img.src && img.src.startsWith('http') && img.style.display !== 'none') {
            // クローンされた画像にもcrossOriginを設定
            img.crossOrigin = 'anonymous';
          }
        });
      }
    });
    
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 295; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    
    let position = 0;
    
    doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      doc.addPage();
      doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    
  } catch (error) {
    console.error('PDF生成エラー:', error);
    throw new Error('PDF生成に失敗しました: ' + error.message);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

// 材料セクションの生成
function generateIngredientsV2(ingredients) {
  if (!ingredients || ingredients.length === 0) {
    return '<p style="color: #666; font-style: italic;">材料データがありません</p>';
  }
  
  const ingredientsList = ingredients.map(ing => {
    // 材料名の処理（先頭の番号を削除）
    const item = ing.item ? ing.item.replace(/^\d+\.?\s*/, '').trim() : '';
    
    // 分量と単位の処理（より柔軟に）
    const quantity = ing.quantity ? String(ing.quantity).trim() : '';
    const unit = ing.unit ? String(ing.unit).trim() : '';
    
    // 分量表示の組み立て
    let amount = '';
    if (quantity && unit) {
      // 数値と単位の間にスペースを入れる（例：150 g、2 個）
      amount = `${quantity} ${unit}`;
    } else if (quantity) {
      amount = quantity;
    } else if (unit) {
      amount = unit;
    }
    
    
    return `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px; 
        padding: 10px; 
        background: #f8f9fa; 
        border-radius: 4px; 
        border-left: 3px solid #28a745;
        width: 100%;
        box-sizing: border-box;
        gap: 15px;
      ">
        <div style="
          flex: 1;
          min-width: 0;
          word-wrap: break-word;
          overflow-wrap: break-word;
          white-space: normal;
          font-weight: 500;
        ">${escapeHtmlV2(item)}</div>
        <div style="
          flex-shrink: 0;
          min-width: 60px;
          text-align: right;
          color: #6c757d;
          font-weight: 500;
          white-space: nowrap;
        ">${escapeHtmlV2(amount)}</div>
      </div>
    `;
  }).join('');
  
  return `<div style="width: 100%;">${ingredientsList}</div>`;
}

// 手順セクションの生成
function generateStepsV2(steps) {
  
  if (!steps || steps.length === 0) {
    console.warn('⚠️ 手順データが空またはundefined:', steps);
    return '<p style="color: #666; font-style: italic;">手順データがありません</p>';
  }
  
  const stepsList = steps.map((step, index) => {
    // 手順が文字列の場合とオブジェクトの場合に対応
    let instruction = '';
    if (typeof step === 'string') {
      instruction = step;
    } else if (typeof step === 'object' && step !== null) {
      instruction = step.instruction || step.step || step.description || step.body || step.text || step.content || '';
    }
    
    
    // 手順テキストが空でも番号は表示
    const displayText = instruction || '[手順テキストが見つかりません]';
    
    return `
      <div style="
        margin-bottom: 12px; 
        padding: 12px; 
        background: #fff; 
        border: 1px solid #e9ecef; 
        border-radius: 4px; 
        border-left: 3px solid #007bff;
        width: 100%;
        box-sizing: border-box;
      ">
        <div style="
          display: flex;
          align-items: flex-start;
          width: 100%;
          gap: 8px;
        ">
          <div style="
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            margin-top: -2px;
          ">
            <span style="
              display: block;
              background: #007bff;
              color: white;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              text-align: center;
              line-height: 24px;
              font-size: 11px;
              font-weight: bold;
            ">${index + 1}</span>
          </div>
          <div style="
            flex: 1;
            min-width: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
            line-height: 1.5;
            font-size: 12px;
            color: #333;
            margin-top: 1px;
          ">${escapeHtmlV2(displayText)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  return `<div style="width: 100%;">${stepsList}</div>`;
}

// レシピブック生成（簡易版）
async function generateRecipeBookPDFV2(recipes) {
  const { jsPDF } = await loadJSPDFLibraryV2();
  const doc = new jsPDF();
  
  // カバーページ
  await generateRecipeBookCoverV2(doc, recipes);
  
  // 各レシピページ
  for (let i = 0; i < recipes.length; i++) {
    if (i > 0) {
      doc.addPage();
    }
    
    // レシピデータの処理
    let ingredients = [];
    if (recipes[i].ingredients && Array.isArray(recipes[i].ingredients)) {
      ingredients = recipes[i].ingredients;
    } else if (recipes[i].ingredients && typeof recipes[i].ingredients === 'string') {
      try {
        ingredients = JSON.parse(recipes[i].ingredients);
      } catch (e) {
        ingredients = [];
      }
    }
    
    let steps = [];
    if (recipes[i].steps && Array.isArray(recipes[i].steps)) {
      steps = recipes[i].steps;
    } else if (recipes[i].steps && typeof recipes[i].steps === 'string') {
      try {
        steps = JSON.parse(recipes[i].steps);
      } catch (e) {
        steps = [];
      }
    }
    
    await generatePDFFromHTMLV2(
      doc, 
      recipes[i].title || '無題のレシピ',
      ingredients,
      steps,
      recipes[i].notes || recipes[i].description || '',
      recipes[i].image_url || recipes[i].imageUrl || null
    );
  }
  
  // PDFをダウンロード
  const fileName = `レシピブック_v2_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// カバーページ生成
async function generateRecipeBookCoverV2(doc, recipes) {
  
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: -2000px;
    left: -2000px;
    width: 800px;
    height: 600px;
    font-family: Arial, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 40px;
    box-sizing: border-box;
    z-index: -1;
    visibility: hidden;
  `;
  
  container.innerHTML = `
    <h1 style="font-size: 48px; margin: 0 0 20px 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">レシピブック</h1>
    <h2 style="font-size: 24px; margin: 0 0 40px 0; font-weight: normal; opacity: 0.9;">Recipe Collection</h2>
    <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px;">
      <p style="font-size: 18px; margin: 0 0 10px 0;">収録レシピ数: ${recipes.length}品</p>
      <p style="font-size: 16px; margin: 0; opacity: 0.8;">作成日: ${new Date().toLocaleDateString('ja-JP')}</p>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // 要素が完全にレンダリングされるまで待機
  await new Promise(resolve => setTimeout(resolve, 200));
  
  let canvas = null;
  try {
    canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: null,
      logging: true,
      useCORS: true,
      allowTaint: true,
      width: 800,
      height: 600
    });
    
    
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210;
    let imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    // A4サイズに収まるように高さを制限
    const maxHeight = 280; // A4の実用可能高さ（mm）
    if (imgHeight > maxHeight) {
      imgHeight = maxHeight;
    }
    
    doc.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    
  } catch (error) {
    console.error('表紙生成エラー:', error);
    // エラーが発生した場合はシンプルな表紙を生成
    doc.setFontSize(24);
    doc.text('レシピブック', 105, 100, { align: 'center' });
    doc.setFontSize(16);
    doc.text(`収録レシピ数: ${recipes.length}件`, 105, 120, { align: 'center' });
    doc.text(`作成日: ${new Date().toLocaleDateString('ja-JP')}`, 105, 140, { align: 'center' });
  }
  
  // html2canvas処理が完全に完了してから要素を削除
  if (canvas) {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  } else {
    // エラーの場合も要素を削除
    setTimeout(() => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }, 1000);
  }
}

// 目次生成
async function generateRecipeBookTOCV2(doc, recipes) {
  
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: -2000px;
    left: -2000px;
    width: 800px;
    min-height: 1000px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    line-height: 1.6;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
    z-index: -1;
    visibility: hidden;
  `;
  
  let htmlContent = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="font-size: 24px; color: #2c3e50; font-weight: bold; border-bottom: 2px solid #3498db; padding-bottom: 10px; display: inline-block;">目次</h1>
    </div>
    <div style="display: flex; gap: 20px; max-width: 800px; margin: 0 auto;">
      <div style="flex: 1;">
  `;

  // レシピを2列に分割
  const halfLength = Math.ceil(recipes.length / 2);
  
  // 左列
  recipes.slice(0, halfLength).forEach((recipe, index) => {
    htmlContent += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #ecf0f1;">
        <span style="font-size: 9px; color: #2c3e50;">${index + 1}. ${escapeHtmlV2(recipe.title)}</span>
        <span style="font-size: 7px; color: #7f8c8d;">${recipe.category || 'その他'}</span>
      </div>
    `;
  });

  htmlContent += `
      </div>
      <div style="flex: 1;">
  `;

  // 右列
  recipes.slice(halfLength).forEach((recipe, index) => {
    htmlContent += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #ecf0f1;">
        <span style="font-size: 9px; color: #2c3e50;">${halfLength + index + 1}. ${escapeHtmlV2(recipe.title)}</span>
        <span style="font-size: 7px; color: #7f8c8d;">${recipe.category || 'その他'}</span>
      </div>
    `;
  });

  htmlContent += `
      </div>
    </div>
  `;
  
  container.innerHTML = htmlContent;
  document.body.appendChild(container);
  
  // 要素が完全にレンダリングされるまで待機
  await new Promise(resolve => setTimeout(resolve, 200));
  
  let canvas = null;
  try {
    canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: true,
      useCORS: true,
      allowTaint: true,
      width: 800,
      height: container.scrollHeight,
      scrollX: 0,
      scrollY: 0
    });
    
    
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    
    // 目次をシンプルに1ページに配置（サイズ調整）
    const maxPageHeight = 280; // A4の実用可能高さ（mm）
    const finalHeight = Math.min(imgHeight, maxPageHeight);
    
    doc.addImage(imgData, 'PNG', 0, 0, imgWidth, finalHeight);
    
    
  } catch (error) {
    console.error('目次生成エラー:', error);
    // エラーが発生した場合はシンプルな目次を生成（2列表示）
    doc.setFontSize(16);
    doc.text('目次', 105, 30, { align: 'center' });
    doc.setFontSize(8);
    
    const halfLength = Math.ceil(recipes.length / 2);
    
    // 左列
    recipes.slice(0, halfLength).forEach((recipe, index) => {
      doc.text(`${index + 1}. ${recipe.title}`, 20, 50 + (index * 8));
    });
    
    // 右列
    recipes.slice(halfLength).forEach((recipe, index) => {
      doc.text(`${halfLength + index + 1}. ${recipe.title}`, 110, 50 + (index * 8));
    });
  }
  
  // html2canvas処理が完全に完了してから要素を削除
  if (canvas) {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  } else {
    // エラーの場合も要素を削除
    setTimeout(() => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }, 1000);
  }
}

// ブラウザ環境でのグローバル関数登録
if (typeof window !== 'undefined') {
  window.generatePDFFromHTMLV2 = generatePDFFromHTMLV2;
  window.generateRecipeBookCoverV2 = generateRecipeBookCoverV2;
  window.generateRecipeBookTOCV2 = generateRecipeBookTOCV2;
  window.generateRecipeBookPDFV2 = generateRecipeBookPDFV2;
  window.loadJSPDFLibraryV2 = loadJSPDFLibraryV2;
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadJSPDFLibraryV2,
    generatePDFFromHTMLV2,
    generateRecipeBookPDFV2,
    generateRecipeBookCoverV2,
    generateRecipeBookTOCV2,
    generateIngredientsV2,
    generateStepsV2
  };
}