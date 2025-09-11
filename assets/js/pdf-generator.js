// PDF生成機能

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
  // 現在はhelveticaを使用（日本語対応の場合は別途フォントファイルが必要）
  doc.setFont('helvetica');
  return doc;
}

// HTMLからPDFを生成
async function generatePDFFromHTML(doc, title, ingredients, steps, notes, imageUrl = null) {
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    width: 1200px;
    font-family: Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
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
  
  // 材料と手順のレイアウト（1/3 + 2/3）
  const ingredientsHTML = generateIngredientsHTML(ingredients);
  const stepsHTML = generateStepsHTML(steps);
  
  const contentHTML = `
    <div style="display: flex; gap: 30px;">
      <div style="flex: 1; min-width: 0;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px;">材料</h2>
        ${ingredientsHTML}
      </div>
      <div style="flex: 2; min-width: 0;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px;">作り方</h2>
        ${stepsHTML}
      </div>
    </div>
  `;
  
  tempContainer.innerHTML = titleHTML + notesHTML + contentHTML;
  document.body.appendChild(tempContainer);
  
  // 外部画像の処理 - より強力なCORS対応
  const images = tempContainer.querySelectorAll('img');
  for (const img of images) {
    if (img.src && img.src.startsWith('http')) {
      console.log('🖼️ 外部画像を処理中:', img.src);
      
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
        console.log('✅ 外部画像の読み込み成功 (crossOrigin):', img.src);
      } catch (error) {
        console.warn('⚠️ crossOriginでの読み込み失敗:', img.src);
        
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
          console.log('✅ 外部画像の読み込み成功 (no crossOrigin):', img.src);
        } catch (error2) {
          console.warn('⚠️ 通常読み込みでも失敗:', img.src);
        }
      }
      
      // 読み込みに失敗した場合はプレースホルダーに置換
      if (!imageLoaded) {
        console.warn('❌ 外部画像の読み込み完全失敗、プレースホルダーに置換:', img.src);
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
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true, // CORSを有効にして、可能な限り画像を読み込む
      allowTaint: true, // 汚染されたキャンバスを許可
      backgroundColor: '#ffffff',
      logging: false, // html2canvasのログを無効化
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
    console.error('エラー詳細:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
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
      <div style="display: flex; margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #28a745;">
        <div style="flex: 1; margin-right: 15px; font-weight: 500;">${escapeHtml(item)}</div>
        <div style="min-width: 80px; text-align: right; color: #6c757d; font-weight: 500;">${escapeHtml(amount)}</div>
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
      <div style="margin-bottom: 15px; padding: 12px; background: #fff; border: 1px solid #e9ecef; border-radius: 6px; border-left: 4px solid #007bff;">
        <div style="display: flex; align-items: flex-start;">
          <span style="background: #007bff; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px; flex-shrink: 0;">${index + 1}</span>
          <div style="flex: 1; line-height: 1.5;">${escapeHtml(instruction)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  return `<div>${stepsList}</div>`;
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
    width: 1200px;
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
    width: 1200px;
    font-family: Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
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
    width: 1200px;
    font-family: Arial, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
    background: white;
    padding: 20px;
    box-sizing: border-box;
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
    <div style="display: flex; gap: 30px;">
      <div style="flex: 1; min-width: 0;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px;">材料</h2>
        ${ingredientsHTML}
      </div>
      <div style="flex: 2; min-width: 0;">
        <h2 style="color: #4a90e2; border-bottom: 2px solid #4a90e2; padding-bottom: 8px; margin-bottom: 15px;">作り方</h2>
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
  
  // 外部画像の処理 - より強力なCORS対応
  const images = tempContainer.querySelectorAll('img');
  for (const img of images) {
    if (img.src && img.src.startsWith('http')) {
      console.log('🖼️ 一括PDF用外部画像を処理中:', img.src);
      
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
        console.log('✅ 一括PDF用外部画像の読み込み成功 (crossOrigin):', img.src);
      } catch (error) {
        console.warn('⚠️ 一括PDF用crossOriginでの読み込み失敗:', img.src);
        
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
          console.log('✅ 一括PDF用外部画像の読み込み成功 (no crossOrigin):', img.src);
        } catch (error2) {
          console.warn('⚠️ 一括PDF用通常読み込みでも失敗:', img.src);
        }
      }
      
      // 読み込みに失敗した場合はプレースホルダーに置換
      if (!imageLoaded) {
        console.warn('❌ 一括PDF用外部画像の読み込み完全失敗、プレースホルダーに置換:', img.src);
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
    const canvas = await html2canvas(tempContainer, {
      scale: 2,
      useCORS: true, // CORSを有効にして、可能な限り画像を読み込む
      allowTaint: true, // 汚染されたキャンバスを許可
      backgroundColor: '#ffffff',
      logging: false, // html2canvasのログを無効化
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
    console.error('エラー詳細:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
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
