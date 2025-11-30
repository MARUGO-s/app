// PDF生成機能 - 完全再構築版

// jsPDFライブラリの動的読み込み
async function loadJSPDFLibrary() {
  if (window.jsPDF) return window.jsPDF;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jsPDF);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// 日本語フォントの設定
function loadJapaneseFont(doc) {
  doc.setFont('helvetica');
  return doc;
}

// HTMLエスケープ関数
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Supabase Functionsを経由して画像を取得する関数
async function fetchImageViaSupabase(imageUrl) {
  try {
    
    // supabaseオブジェクトが存在するかチェック
    if (typeof supabase === 'undefined' || !supabase) {
      console.warn('⚠️ supabaseオブジェクトが利用できません、直接Base64エンコードにフォールバック');
      return await convertImageToBase64(imageUrl);
    }
    
    
    const { data, error } = await supabase.functions.invoke('fetch-image', {
      body: { imageUrl: imageUrl }
    });

    if (error) {
      console.warn('⚠️ Supabase Functions エラー:', error);
      return null;
    }

    if (data && data.success && data.dataUrl) {
      return data.dataUrl;
    } else {
      console.warn('⚠️ Supabase Functions レスポンスエラー:', data);
      return null;
    }
  } catch (error) {
    console.warn('⚠️ Supabase Functions 呼び出しエラー:', error);
    return null;
  }
}

// プロキシ経由で画像をBase64に変換（CORS回避）
async function convertImageViaProxy(imageUrl) {
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
        console.error('❌ FileReader エラー');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });

  } catch (error) {
    console.error('❌ プロキシ経由変換エラー:', error);
    return null;
  }
}

// 画像をBase64エンコードする関数（複数のフォールバック方法）
async function convertImageToBase64(imageUrl) {

  // 方法1: プロキシ経由（CORS回避）
  const proxyResult = await convertImageViaProxy(imageUrl);
  if (proxyResult) {
    return proxyResult;
  }

  // 方法2: 直接変換（CORS制限あり）
  return new Promise((resolve) => {

    // HTTPSに変換を試行
    let finalUrl = imageUrl;
    if (imageUrl.startsWith('http://')) {
      finalUrl = imageUrl.replace('http://', 'https://');
    }

    const img = new Image();

    // CORSエラーを回避するため、crossOriginを設定
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        resolve(base64);
      } catch (error) {
        console.warn('⚠️ Canvas描画CORS エラー:', error);
        resolve(null);
      }
    };

    img.onerror = (error) => {
      console.warn('⚠️ 画像読み込みエラー:', imageUrl, error);
      resolve(null);
    };

    // 最終的なURLで画像を読み込み
    img.src = finalUrl;
  });
}

// HTMLからPDFを生成
async function generatePDFFromHTML(doc, title, ingredients, steps, notes, imageUrl = null) {
  
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    width: 2000px;
    font-family: Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
    word-wrap: break-word;
    word-break: break-all;
    overflow-wrap: anywhere;
    white-space: normal;
    hyphens: auto;
    -webkit-hyphens: auto;
    -moz-hyphens: auto;
    -ms-hyphens: auto;
  `;
  
  // タイトルと画像
  let titleHTML = `
    <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #4a90e2; padding-bottom: 15px;">
      <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">${escapeHtml(title)}</h1>
    </div>
  `;
  
  // 画像がある場合は追加
  if (imageUrl && imageUrl.trim()) {
    titleHTML = `
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="${escapeHtml(imageUrl)}" alt="レシピ画像" style="max-width: 100%; max-height: 300px; object-fit: cover; border-radius: 8px; margin-bottom: 15px;">
        <div style="border-bottom: 2px solid #4a90e2; padding-bottom: 15px;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">${escapeHtml(title)}</h1>
        </div>
      </div>
    `;
  } else {
  }
  
  // メモ（説明）
  let notesHTML = '';
  if (notes && notes.trim()) {
    notesHTML = `
      <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-left: 4px solid #4a90e2; border-radius: 4px;">
        <p style="margin: 0; color: #555;">${escapeHtml(notes)}</p>
      </div>
    `;
  }
  
  // 材料と手順のレイアウト
  const ingredientsHTML = generateIngredientsHTML(ingredients);
  const stepsHTML = generateStepsHTML(steps);
  
  const contentHTML = `
    <div style="display: table; width: 100%; table-layout: fixed; box-sizing: border-box;">
      <div style="display: table-cell; width: 25%; vertical-align: top; padding-right: 25px; box-sizing: border-box;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px; font-size: 14px;">材料</h2>
        ${ingredientsHTML}
      </div>
      <div style="display: table-cell; width: 75%; vertical-align: top; box-sizing: border-box;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px; font-size: 14px;">作り方</h2>
        ${stepsHTML}
      </div>
    </div>
  `;
  
  tempContainer.innerHTML = titleHTML + notesHTML + contentHTML;
  document.body.appendChild(tempContainer);
  
  // 生成されたHTMLの内容をログ出力
  
  // 画像の重複原因を調査
  const images = tempContainer.querySelectorAll('img');
  
  // 各画像の詳細情報をログ出力
  images.forEach((img, index) => {
      src: img.src,
      alt: img.alt,
      className: img.className,
      id: img.id,
      parentElement: img.parentElement?.tagName,
      parentClassName: img.parentElement?.className,
      isVisible: img.offsetWidth > 0 && img.offsetHeight > 0,
      display: window.getComputedStyle(img).display,
      visibility: window.getComputedStyle(img).visibility
    });
  });
  
  // 重複する画像を除外し、正しい画像を選択
  const validImages = Array.from(images).filter(img => {
    if (!img.src) return false;
    
    // data:で始まるBase64画像を除外
    if (img.src.startsWith('data:')) {
      return false;
    }
    
    // 非表示の画像を除外
    if (img.style.display === 'none' || img.offsetWidth === 0 || img.offsetHeight === 0) {
      return false;
    }
    
    // recipe.r10s.jpの画像のみを対象とする
    if (img.src.includes('recipe.r10s.jp')) {
      return true;
    }
    
    // その他の画像は除外
    return false;
  });
  
  
  // 重複するURLを除外（最初のもののみを保持）
  const uniqueImages = [];
  const seenUrls = new Set();
  
  validImages.forEach(img => {
    if (!seenUrls.has(img.src)) {
      seenUrls.add(img.src);
      uniqueImages.push(img);
    } else {
    }
  });
  
  
  // 最初の画像を選択
  let selectedImage = null;
  if (uniqueImages.length > 0) {
    selectedImage = uniqueImages[0];
  } else {
  }
  
  // 選択された画像のみを処理
  if (selectedImage) {
    
    if (selectedImage.src && selectedImage.src.startsWith('http')) {
      try {
        // まずSupabase Functions経由で画像を取得
        let base64Image = await fetchImageViaSupabase(selectedImage.src);
        
        // Supabase Functionsが失敗した場合は直接Base64エンコードを試行
        if (!base64Image) {
          base64Image = await convertImageToBase64(selectedImage.src);
        }
        
        if (base64Image) {
          selectedImage.src = base64Image;
        } else {
          console.warn('⚠️ 画像のBase64エンコード失敗:', selectedImage.src);
          // プレースホルダーに置換
          selectedImage.style.display = 'none';
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
            <div>画像（読み込みできませんでした）</div>
          `;
          selectedImage.parentNode.insertBefore(placeholder, selectedImage);
        }
      } catch (error) {
        console.warn('⚠️ 画像処理エラー:', error);
        // プレースホルダーに置換
        selectedImage.style.display = 'none';
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
          <div>画像（読み込みできませんでした）</div>
        `;
        selectedImage.parentNode.insertBefore(placeholder, selectedImage);
      }
    } else {
    }
  }
  
  try {
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: true,
      imageTimeout: 30000,
      removeContainer: false,
      foreignObjectRendering: false,
      ignoreElements: (element) => {
        if (element.tagName === 'IMG') {
          if (element.style.display === 'none') {
            return true;
          }
          // data:で始まるBase64画像を除外
          if (element.src && element.src.startsWith('data:')) {
            return true;
          }
        }
        return false;
      },
      onclone: (clonedDoc) => {
        const clonedImages = clonedDoc.querySelectorAll('img');
        clonedImages.forEach((img, index) => {
          if (img.src && img.src.startsWith('http') && img.style.display !== 'none') {
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
    if (document.body.contains(tempContainer)) {
      document.body.removeChild(tempContainer);
    }
  }
}

// 材料のHTMLを生成
function generateIngredientsHTML(ingredients) {
  if (!ingredients || ingredients.length === 0) {
    return '<p style="color: #666; font-style: italic;">材料データがありません</p>';
  }
  
  const ingredientsList = ingredients.map(ing => {
    const item = ing.item ? ing.item.replace(/^\d+\.?\s*/, '').trim() : '';
    const quantity = ing.quantity || '';
    const unit = ing.unit || '';
    const amount = [quantity, unit].filter(Boolean).join(' ');
    
    return `
      <div style="display: flex; margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #28a745; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word; white-space: normal; gap: 15px;">
        <div style="flex: 1; min-width: 0; font-weight: 500; word-wrap: break-word; word-break: break-all; overflow-wrap: anywhere; white-space: normal; box-sizing: border-box; hyphens: auto; -webkit-hyphens: auto; -moz-hyphens: auto; -ms-hyphens: auto;">${escapeHtml(item)}</div>
        <div style="min-width: 80px; text-align: right; color: #6c757d; font-weight: 500; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word; white-space: normal; flex-shrink: 0;">${escapeHtml(amount)}</div>
      </div>
    `;
  }).join('');
  
  return `<div>${ingredientsList}</div>`;
}

// 手順のHTMLを生成
function generateStepsHTML(steps) {
  if (!steps || steps.length === 0) {
    return '<p style="color: #666; font-style: italic;">手順データがありません</p>';
  }
  
  const stepsList = steps.map((step, index) => {
    const instruction = step.instruction || step.step || step.description || step.body || '';
    return `
      <div style="margin-bottom: 12px; padding: 10px; background: #fff; border: 1px solid #e9ecef; border-radius: 4px; border-left: 3px solid #007bff; width: 100%; box-sizing: border-box; display: block;">
        <div style="display: flex; align-items: flex-start; width: 100%; gap: 10px;">
          <div style="flex-shrink: 0; width: 20px; height: 20px;">
            <span style="display: block; background: #007bff; color: white; width: 20px; height: 20px; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: bold;">${index + 1}</span>
          </div>
          <div style="flex: 1; min-width: 0; word-wrap: break-word; word-break: break-all; overflow-wrap: anywhere; white-space: pre-line; line-height: 1.5; font-size: 12px; color: #333;">${escapeHtml(instruction)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  return `<div style="width: 100%;">${stepsList}</div>`;
}

// レシピブックPDF生成
async function generateRecipeBookPDF(recipes) {
  const { jsPDF } = await loadJSPDFLibrary();
  const doc = new jsPDF();
  
  // カバーページ
  await generateRecipeBookCover(doc, recipes);
  
  // 目次
  await generateRecipeBookTOC(doc, recipes);
  
  // 各レシピページ
  for (let i = 0; i < recipes.length; i++) {
    if (i > 0) {
      doc.addPage();
    }
    await generateRecipePage(doc, recipes[i], i + 1, recipes.length);
  }
  
  // PDFをダウンロード
  const fileName = `レシピブック_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// レシピブックカバーページ
async function generateRecipeBookCover(doc, recipes) {
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    width: 1600px;
    height: 800px;
    font-family: Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 40px;
    box-sizing: border-box;
  `;
  
  tempContainer.innerHTML = `
    <h1 style="font-size: 48px; margin: 0 0 20px 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">レシピブック</h1>
    <h2 style="font-size: 24px; margin: 0 0 40px 0; font-weight: normal; opacity: 0.9;">Recipe Collection</h2>
    <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; backdrop-filter: blur(10px);">
      <p style="font-size: 18px; margin: 0 0 10px 0;">収録レシピ数: ${recipes.length}品</p>
      <p style="font-size: 16px; margin: 0; opacity: 0.8;">作成日: ${new Date().toLocaleDateString('ja-JP')}</p>
    </div>
  `;
  
  await convertHTMLToPDF(doc, tempContainer);
}

// レシピブック目次
async function generateRecipeBookTOC(doc, recipes) {
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    width: 1600px;
    font-family: Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
    word-wrap: break-word;
    word-break: break-all;
    overflow-wrap: anywhere;
    white-space: normal;
    hyphens: auto;
    -webkit-hyphens: auto;
    -moz-hyphens: auto;
    -ms-hyphens: auto;
  `;
  
  const tocItems = recipes.map((recipe, index) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee;">
      <span style="font-weight: 500;">${index + 1}. ${escapeHtml(recipe.title || '無題のレシピ')}</span>
      <span style="color: #666;">${index + 1}</span>
    </div>
  `).join('');
  
  tempContainer.innerHTML = `
    <h1 style="text-align: center; color: #2c3e50; margin-bottom: 30px; border-bottom: 2px solid #4a90e2; padding-bottom: 15px;">目次</h1>
    <div>${tocItems}</div>
  `;
  
  await convertHTMLToPDF(doc, tempContainer);
}

// レシピページ生成
async function generateRecipePage(doc, recipe, pageNumber, totalPages) {
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    width: 2000px;
    font-family: Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
    word-wrap: break-word;
    word-break: break-all;
    overflow-wrap: anywhere;
    white-space: normal;
    hyphens: auto;
    -webkit-hyphens: auto;
    -moz-hyphens: auto;
    -ms-hyphens: auto;
  `;
  
  // タイトルと画像
  let titleHTML = `
    <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #4a90e2; padding-bottom: 15px;">
      <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">${escapeHtml(recipe.title || '無題のレシピ')}</h1>
      <p style="color: #666; margin: 10px 0 0 0;">ページ ${pageNumber} / ${totalPages}</p>
    </div>
  `;
  
  // 画像がある場合は追加
  if (recipe.image_url && recipe.image_url.trim()) {
    titleHTML = `
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="${escapeHtml(recipe.image_url)}" alt="レシピ画像" style="max-width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 15px;">
        <div style="border-bottom: 2px solid #4a90e2; padding-bottom: 15px;">
          <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">${escapeHtml(recipe.title || '無題のレシピ')}</h1>
          <p style="color: #666; margin: 10px 0 0 0;">ページ ${pageNumber} / ${totalPages}</p>
        </div>
      </div>
    `;
  }
  
  // 材料データの処理
  let ingredients = [];
  if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
    ingredients = recipe.ingredients;
  } else if (recipe.ingredients && typeof recipe.ingredients === 'string') {
    try {
      ingredients = JSON.parse(recipe.ingredients);
    } catch (e) {
      ingredients = [];
    }
  }
  
  // 手順データの処理
  let steps = [];
  if (recipe.steps && Array.isArray(recipe.steps)) {
    steps = recipe.steps;
  } else if (recipe.steps && typeof recipe.steps === 'string') {
    try {
      steps = JSON.parse(recipe.steps);
    } catch (e) {
      steps = [];
    }
  }
  
  // 材料と手順のレイアウト
  const ingredientsHTML = generateIngredientsHTML(ingredients);
  const stepsHTML = generateStepsHTML(steps);
  
  const contentHTML = `
    <div style="display: table; width: 100%; table-layout: fixed; box-sizing: border-box;">
      <div style="display: table-cell; width: 25%; vertical-align: top; padding-right: 25px; box-sizing: border-box;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px; font-size: 14px;">材料</h2>
        ${ingredientsHTML}
      </div>
      <div style="display: table-cell; width: 75%; vertical-align: top; box-sizing: border-box;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px; font-size: 14px;">作り方</h2>
        ${stepsHTML}
      </div>
    </div>
  `;
  
  tempContainer.innerHTML = titleHTML + contentHTML;
  
  await convertHTMLToPDF(doc, tempContainer);
}

// HTMLをPDFに変換
async function convertHTMLToPDF(doc, tempContainer) {
  document.body.appendChild(tempContainer);
  
  // 画像をBase64エンコードして埋め込む
  const images = tempContainer.querySelectorAll('img');
  
  // 各画像の詳細情報をログ出力
  images.forEach((img, index) => {
      src: img.src,
      alt: img.alt,
      className: img.className,
      id: img.id,
      parentElement: img.parentElement?.tagName,
      parentClassName: img.parentElement?.className,
      isVisible: img.offsetWidth > 0 && img.offsetHeight > 0,
      display: window.getComputedStyle(img).display,
      visibility: window.getComputedStyle(img).visibility
    });
  });
  
  // 重複する画像を除外し、正しい画像を選択
  const validImages = Array.from(images).filter(img => {
    if (!img.src) return false;
    
    // data:で始まるBase64画像を除外
    if (img.src.startsWith('data:')) {
      return false;
    }
    
    // 非表示の画像を除外
    if (img.style.display === 'none' || img.offsetWidth === 0 || img.offsetHeight === 0) {
      return false;
    }
    
    // recipe.r10s.jpの画像のみを対象とする
    if (img.src.includes('recipe.r10s.jp')) {
      return true;
    }
    
    // その他の画像は除外
    return false;
  });
  
  
  // 重複するURLを除外（最初のもののみを保持）
  const uniqueImages = [];
  const seenUrls = new Set();
  
  validImages.forEach(img => {
    if (!seenUrls.has(img.src)) {
      seenUrls.add(img.src);
      uniqueImages.push(img);
    } else {
    }
  });
  
  
  // 最初の画像を選択
  let selectedImage = null;
  if (uniqueImages.length > 0) {
    selectedImage = uniqueImages[0];
  } else {
  }
  
  // 選択された画像のみを処理
  if (selectedImage) {
    
    if (selectedImage.src && selectedImage.src.startsWith('http')) {
      try {
        // まずSupabase Functions経由で画像を取得
        let base64Image = await fetchImageViaSupabase(selectedImage.src);
        
        // Supabase Functionsが失敗した場合は直接Base64エンコードを試行
        if (!base64Image) {
          base64Image = await convertImageToBase64(selectedImage.src);
        }
        
        if (base64Image) {
          selectedImage.src = base64Image;
        } else {
          console.warn('⚠️ 一括PDF用画像のBase64エンコード失敗:', selectedImage.src);
          // プレースホルダーに置換
          selectedImage.style.display = 'none';
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
            <div>画像（読み込みできませんでした）</div>
          `;
          selectedImage.parentNode.insertBefore(placeholder, selectedImage);
        }
      } catch (error) {
        console.warn('⚠️ 一括PDF用画像処理エラー:', error);
        // プレースホルダーに置換
        selectedImage.style.display = 'none';
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
          <div>画像（読み込みできませんでした）</div>
        `;
        selectedImage.parentNode.insertBefore(placeholder, selectedImage);
      }
    } else {
    }
  }
  
  try {
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: true,
      imageTimeout: 30000,
      removeContainer: false,
      foreignObjectRendering: false,
      ignoreElements: (element) => {
        if (element.tagName === 'IMG') {
          if (element.style.display === 'none') {
            return true;
          }
          // data:で始まるBase64画像を除外
          if (element.src && element.src.startsWith('data:')) {
            return true;
          }
        }
        return false;
      },
      onclone: (clonedDoc) => {
        const clonedImages = clonedDoc.querySelectorAll('img');
        clonedImages.forEach((img, index) => {
          if (img.src && img.src.startsWith('http') && img.style.display !== 'none') {
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
    if (document.body.contains(tempContainer)) {
      document.body.removeChild(tempContainer);
    }
  }
}

// エクスポート（モジュール形式で使用する場合）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadJSPDFLibrary,
    loadJapaneseFont,
    generatePDFFromHTML,
    generateRecipeBookPDF,
    generateRecipeBookCover,
    generateRecipeBookTOC,
    generateRecipePage,
    convertHTMLToPDF
  };
}