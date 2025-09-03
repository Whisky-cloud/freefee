// server.js - 修正版
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

let translate = null;
try {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  translate = new Translate({
    projectId: credentials.project_id,
    credentials,
  });
} catch (e) {
  console.error("GOOGLE_CREDENTIALS が正しく設定されていません。翻訳機能は無効になります。");
}

const formHTML = `
<form method="get" action="/proxy" style="position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; align-items: center; gap: 10px;">
  <input type="url" id="url-input" name="url" placeholder="英語サイトURL" style="width:600px;height:80px;padding:8px;font-size:32px;">
  <button type="submit" style="height:80px;font-size:20px;padding:0 12px;">開く</button>
  <input type="number" id="font-size-input" min="10" max="100" value="32" style="width:80px;height:80px;padding:8px;font-size:32px;text-align:center;">
  <button type="button" id="font-size-apply" style="height:80px;font-size:20px;padding:0 12px;">適用</button>
</form>

<script>
// URLの保存と復元
(function() {
  // 現在のページのURL入力欄を取得（複数ある場合は最後のもの）
  const allUrlInputs = document.querySelectorAll('#url-input');
  const urlInput = allUrlInputs[allUrlInputs.length - 1];
  
  const allFontInputs = document.querySelectorAll('#font-size-input');
  const fontInput = allFontInputs[allFontInputs.length - 1];
  
  const allFontButtons = document.querySelectorAll('#font-size-apply');
  const fontButton = allFontButtons[allFontButtons.length - 1];
  
  // 保存されたURLがあれば復元
  const savedUrl = localStorage.getItem("lastProxyUrl");
  if (savedUrl && urlInput) {
    urlInput.value = savedUrl;
  }
  
  // 保存されたフォントサイズがあれば復元
  const savedFontSize = localStorage.getItem("fontSize") || "32";
  if (fontInput) {
    fontInput.value = savedFontSize;
    document.body.style.fontSize = savedFontSize + "px";
  }
  
  // URLを入力したら保存
  if (urlInput) {
    urlInput.addEventListener("change", function() {
      localStorage.setItem("lastProxyUrl", this.value);
    });
    
    // フォームが送信される時も保存
    const form = urlInput.closest("form");
    if (form) {
      // 既存のイベントリスナーを削除して新しく追加
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      
      newForm.addEventListener("submit", function(e) {
        const currentUrlInput = newForm.querySelector('#url-input');
        const currentUrl = currentUrlInput.value;
        if (currentUrl) {
          localStorage.setItem("lastProxyUrl", currentUrl);
          // フォーム送信を続行
        } else {
          e.preventDefault(); // URLが空の場合は送信しない
        }
      });
      
      // フォントサイズ適用ボタンのイベントも再設定
      const newFontButton = newForm.querySelector('#font-size-apply');
      const newFontInput = newForm.querySelector('#font-size-input');
      if (newFontButton && newFontInput) {
        newFontButton.addEventListener("click", function(e) {
          e.preventDefault();
          const size = parseInt(newFontInput.value);
          if (size >= 10 && size <= 100) {
            document.body.style.fontSize = size + "px";
            localStorage.setItem("fontSize", size);
          }
        });
      }
    }
  }
  
  // フォントサイズ適用ボタン
  if (fontButton && fontInput) {
    fontButton.addEventListener("click", function(e) {
      e.preventDefault();
      const size = parseInt(fontInput.value);
      if (size >= 10 && size <= 100) {
        document.body.style.fontSize = size + "px";
        localStorage.setItem("fontSize", size);
      }
    });
  }
})();
</script>
`;

app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  const autoLoadScript = `
    <script>
      // ページ読み込み時に、保存されたURLがあれば自動的に読み込む
      window.addEventListener('DOMContentLoaded', function() {
        const savedUrl = localStorage.getItem("lastProxyUrl");
        const autoLoad = localStorage.getItem("autoLoadLastUrl");
        
        // 初回アクセス時は自動読み込みを有効にする
        if (autoLoad === null) {
          localStorage.setItem("autoLoadLastUrl", "true");
        }
        
        // 自動読み込みが有効で、保存されたURLがある場合
        if (savedUrl && localStorage.getItem("autoLoadLastUrl") === "true") {
          // 自動読み込みフラグを一時的にオフにする（無限ループ防止）
          localStorage.setItem("autoLoadLastUrl", "false");
          // プロキシページへリダイレクト
          window.location.href = "/proxy?url=" + encodeURIComponent(savedUrl);
        } else {
          // 自動読み込みフラグを次回のために有効に戻す
          localStorage.setItem("autoLoadLastUrl", "true");
        }
      });
    </script>
  `;
  
  res.send(`<form method="get" action="/proxy">${formHTML}</form>${autoLoadScript}`);
});

// クライアントサイド遅延処理版のプロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.redirect("/");

  try {
    const { data } = await axios.get(targetUrl, {
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(data);

    // 不要な要素を削除（高速化）
    $('script[src]').remove();
    $('link[rel="preload"]').remove();
    $('link[rel="prefetch"]').remove();

    // CSS追加
    $("body").css("font-size", "32px");  // 初期値を32pxに変更
    const styleFix = `
<style>
html, body { max-width:100%; overflow-x:hidden; }
img, video, iframe, canvas { max-width:100%; height:auto; }
.container, [class*="container"], table { max-width:100% !important; width:100% !important; }
.translatable-tooltip {
  position: absolute; background: #000; color: #fff; padding: 5px 10px;
  font-size: 22px; font-family: "Noto Sans JP"; font-weight: 400;
  border-radius: 8px; z-index: 10000; display: none;
  pointer-events: none;
}
.translatable { 
  cursor: pointer;
}
.translatable:hover {
  background-color: #ffffcc;
}
.processing-overlay {
  position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8);
  color: #fff; padding: 10px 15px; border-radius: 5px; z-index: 10001;
  font-size: 14px;
}
</style>
`;
    $("head").append(styleFix);

    // クライアントサイドで遅延処理するスクリプト（修正版）
    const clientSideScript = `
<script>
// デバッグ用コンソール出力
console.log('Translation script starting...');

// 進捗表示
const overlay = document.createElement('div');
overlay.className = 'processing-overlay';
overlay.textContent = '翻訳機能を準備中... 0%';
document.body.appendChild(overlay);

const tooltip = document.createElement("div");
tooltip.className = "translatable-tooltip";
document.body.appendChild(tooltip);

// 非同期で単語を分割してクリック可能にする
async function processTextNodes() {
  try {
    console.log('Starting text node processing...');
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // スクリプトタグやスタイルタグ、フォーム内のテキストは除外
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName;
          if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // フォーム要素内のテキストも除外
          if (parent.closest('form') && parent.closest('[style*="position: fixed"]')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 処理済みのものは除外
          if (parent.classList && parent.classList.contains('translatable')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    console.log('Found ' + textNodes.length + ' text nodes to process');

    if (textNodes.length === 0) {
      console.log('No text nodes found, completing setup');
      overlay.textContent = '翻訳機能を準備中... 100%';
      setTimeout(() => {
        overlay.remove();
        setupTranslation();
      }, 500);
      return;
    }

    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < textNodes.length; i += batchSize) {
      const batch = textNodes.slice(i, i + batchSize);
      
      for (const textNode of batch) {
        try {
          // ノードが既に削除されていないか確認
          if (!textNode.parentNode) continue;
          
          const text = textNode.textContent;
          // 英単語を含むテキストのみ処理
          if (!/[a-zA-Z]/.test(text)) continue;
          
          // 単語境界で分割する正規表現
          // 英単語（アポストロフィ含む）とそれ以外を分離
          const parts = [];
          let lastIndex = 0;
          
          // 英単語（'sや'tなどを含む）にマッチする正規表現
          const wordRegex = /[a-zA-Z]+(?:[''][a-zA-Z]+)*/g;
          let match;
          
          while ((match = wordRegex.exec(text)) !== null) {
            // マッチ前の部分（空白や記号）
            if (match.index > lastIndex) {
              parts.push({
                text: text.substring(lastIndex, match.index),
                isWord: false
              });
            }
            // マッチした単語
            parts.push({
              text: match[0],
              isWord: true
            });
            lastIndex = match.index + match[0].length;
          }
          
          // 最後の部分
          if (lastIndex < text.length) {
            parts.push({
              text: text.substring(lastIndex),
              isWord: false
            });
          }
          
          if (parts.length > 0) {
            const fragment = document.createDocumentFragment();
            
            parts.forEach(part => {
              if (part.isWord) {
                // 英単語はspanで囲む
                const span = document.createElement('span');
                span.className = 'translatable';
                span.textContent = part.text;
                fragment.appendChild(span);
              } else {
                // その他はそのまま
                fragment.appendChild(document.createTextNode(part.text));
              }
            });
            
            // ノードがまだ存在することを確認してから置換
            if (textNode.parentNode) {
              textNode.parentNode.replaceChild(fragment, textNode);
            }
          }
        } catch (err) {
          console.error('Error processing node:', err);
        }
      }

      processed += batch.length;
      const progress = Math.min(99, Math.round((processed / textNodes.length) * 100));
      overlay.textContent = '翻訳機能を準備中... ' + progress + '%';

      // UIをブロックしないよう少し待つ
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 処理完了を確実に
    console.log('Processing complete, setting up translation...');
    overlay.textContent = '翻訳機能を準備中... 100%';
    
    setTimeout(() => {
      overlay.remove();
      setupTranslation();
      console.log('Translation setup complete');
    }, 500);
    
  } catch (error) {
    console.error('Error in processTextNodes:', error);
    overlay.textContent = 'エラーが発生しました';
    setTimeout(() => {
      overlay.remove();
      setupTranslation(); // エラーでも翻訳機能は有効化
    }, 2000);
  }
}

// 翻訳機能を設定
function setupTranslation() {
  console.log('Setting up translation event listeners...');
  
  let hideTimeout;
  let lastTapTime = 0;
  
  // 翻訳を表示する共通関数
  function showTranslation(text, x, y) {
    if (!text || !text.trim()) return;
    
    // タイムアウトをクリア（重要：表示前にクリア）
    clearTimeout(hideTimeout);
    
    // ツールチップを即座に表示（ローディング状態）
    tooltip.textContent = '翻訳中...';
    tooltip.style.left = x + 10 + "px";
    tooltip.style.top = y + 10 + "px";
    tooltip.style.display = "block";
    
    fetch("/translate?text=" + encodeURIComponent(text) + "&lang=ja")
      .then(response => response.json())
      .then(data => {
        if (data.translation) {
          tooltip.textContent = text + ": " + data.translation;
        } else {
          tooltip.textContent = '[翻訳できませんでした]';
        }
      })
      .catch(err => {
        console.error('Translation error:', err);
        tooltip.textContent = '[エラー]';
      });
  }
  
  // 単語クリック/タップで翻訳
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('translatable')) {
      e.preventDefault();
      e.stopPropagation();
      
      // ダブルタップの防止
      const currentTime = new Date().getTime();
      if (currentTime - lastTapTime < 300) {
        return;
      }
      lastTapTime = currentTime;
      
      // 既存の選択をクリア
      window.getSelection().removeAllRanges();
      
      const text = e.target.textContent.trim();
      showTranslation(text, e.pageX, e.pageY);
      
      // クリック後はツールチップを表示し続ける
      clearTimeout(hideTimeout);
    } else if (!tooltip.contains(e.target)) {
      // ツールチップ以外の場所をクリックした場合のみ隠す
      hideTimeout = setTimeout(() => {
        tooltip.style.display = "none";
      }, 100);
    }
  });
  
  // iOS向け：選択変更イベントで翻訳を表示
  let selectionCheckInterval = null;
  let lastSelectedText = '';
  
  // 選択を定期的にチェック（iOS対応）
  function startSelectionCheck() {
    if (selectionCheckInterval) return;
    
    selectionCheckInterval = setInterval(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      
      // 新しい選択があり、前回と異なる場合
      if (selectedText && selectedText.length > 1 && selectedText !== lastSelectedText) {
        lastSelectedText = selectedText;
        
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          // 選択したテキストの翻訳を表示
          showTranslation(
            selectedText,
            rect.left + rect.width / 2 - 10,
            rect.bottom + window.scrollY
          );
          
          clearTimeout(hideTimeout);
        } catch (err) {
          console.error('Error getting selection:', err);
        }
      } else if (!selectedText && lastSelectedText) {
        // 選択が解除された
        lastSelectedText = '';
        stopSelectionCheck();
      }
    }, 500); // 0.5秒ごとにチェック
  }
  
  function stopSelectionCheck() {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
      selectionCheckInterval = null;
    }
  }
  
  // タッチ開始で選択チェックを開始（iOS向け）
  document.addEventListener('touchstart', () => {
    startSelectionCheck();
  });
  
  // タッチ終了後も少し続ける
  document.addEventListener('touchend', () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection.toString()) {
        stopSelectionCheck();
      }
    }, 1000);
  });
  
  // デスクトップ向け：マウスでの選択
  document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();
      
      if (selectedText && selectedText.length > 1 && !tooltip.contains(e.target)) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          showTranslation(
            selectedText,
            rect.left + rect.width / 2 - 10,
            rect.bottom + window.scrollY
          );
          
          clearTimeout(hideTimeout);
        } catch (err) {
          console.error('Error getting selection:', err);
        }
      }
    }, 100);
  });
  
  // ツールチップの上にマウス/タッチがある時は隠さない
  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
  });
  
  tooltip.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    clearTimeout(hideTimeout);
  });
  
  tooltip.addEventListener('mouseleave', () => {
    hideTimeout = setTimeout(() => {
      tooltip.style.display = "none";
    }, 1000);
  });
  
  // ESCキーでツールチップを隠す
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      tooltip.style.display = "none";
      window.getSelection().removeAllRanges();
      stopSelectionCheck();
    }
  });
}

// DOMが読み込まれたら処理開始
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(processTextNodes, 100); // 少し遅延させて確実に実行
  });
} else {
  setTimeout(processTextNodes, 100);
}
</script>
`;

    $("body").append(clientSideScript);
    $("body").append(formHTML);

    res.send($.html());
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send(`
      <h1>エラーが発生しました</h1>
      <p>${err.message}</p>
      <a href="/">戻る</a>
    `);
  }
});

app.get("/translate", async (req, res) => {
  const text = req.query.text;
  const lang = req.query.lang || "ja";

  if (!text) {
    return res.json({ translation: "" });
  }

  if (!translate) {
    console.log('Translation API not configured, returning placeholder');
    return res.json({ translation: `[${text}]` });
  }

  try {
    const [translation] = await translate.translate(text, lang);
    res.json({ translation });
  } catch (err) {
    console.error('Translation error:', err);
    res.json({ translation: `[翻訳エラー: ${text}]` });
  }
});

app.listen(PORT, () => {
  console.log(`サーバー起動 ポート: ${PORT}`);
  console.log(`翻訳API: ${translate ? '有効' : '無効（GOOGLE_CREDENTIALSを設定してください）'}`);
});
