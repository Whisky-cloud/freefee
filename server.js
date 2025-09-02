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
<div id="proxy-form-container" style="position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; align-items: center; gap: 10px;">
  <form method="get" action="/proxy" style="display: flex; align-items: center; gap: 10px; margin: 0;">
    <input type="url" id="url-input" name="url" placeholder="英語サイトURL" style="width:600px;height:80px;padding:8px;font-size:32px;">
    <button type="submit" style="height:80px;font-size:20px;padding:0 12px;">開く</button>
  </form>
  <input type="range" id="font-slider" min="20" max="70" value="40" style="width:600px; accent-color: #5c3a21;">
</div>

<script>
// URLの保存と復元
(function() {
  const urlInput = document.getElementById("url-input");
  const fontSlider = document.getElementById("font-slider");
  
  // 保存されたURLがあれば復元
  const savedUrl = localStorage.getItem("lastProxyUrl");
  if (savedUrl && urlInput) {
    urlInput.value = savedUrl;
  }
  
  // 保存されたフォントサイズがあれば復元
  const savedFontSize = localStorage.getItem("fontSize") || "40";
  if (fontSlider) {
    fontSlider.value = savedFontSize;
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
      form.addEventListener("submit", function() {
        localStorage.setItem("lastProxyUrl", urlInput.value);
      });
    }
  }
  
  // フォントサイズ変更時に保存
  if (fontSlider) {
    fontSlider.addEventListener("input", function() {
      document.body.style.fontSize = this.value + "px";
      localStorage.setItem("fontSize", this.value);
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
    $("body").css("font-size", "40px");
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
  text-decoration: underline dotted #ccc;
  text-underline-offset: 2px;
}
.translatable:hover {
  background-color: #ffffcc;
}
.processing-overlay {
  position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8);
  color: #fff; padding: 10px 15px; border-radius: 5px; z-index: 10001;
  font-size: 14px;
}
.google-search-popup {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 800px;
  height: 400px;
  background: white;
  border: 2px solid #ccc;
  border-radius: 10px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.3);
  z-index: 10002;
  display: none;
  flex-direction: column;
}
.google-search-header {
  padding: 10px;
  background: #f0f0f0;
  border-bottom: 1px solid #ccc;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px 8px 0 0;
}
.google-search-title {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}
.google-search-close {
  background: #ff6b6b;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}
.google-search-iframe {
  flex: 1;
  width: 100%;
  border: none;
  border-radius: 0 0 8px 8px;
}
.selection-menu {
  position: absolute;
  background: #333;
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  z-index: 10001;
  display: none;
}
.selection-menu:hover {
  background: #555;
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

// Google検索ポップアップを作成
const searchPopup = document.createElement('div');
searchPopup.className = 'google-search-popup';
searchPopup.innerHTML = \`
  <div class="google-search-header">
    <span class="google-search-title">Google検索</span>
    <button class="google-search-close">閉じる</button>
  </div>
  <iframe class="google-search-iframe"></iframe>
\`;
document.body.appendChild(searchPopup);

// 選択メニューを作成
const selectionMenu = document.createElement('div');
selectionMenu.className = 'selection-menu';
selectionMenu.textContent = '🔍 Google検索';
document.body.appendChild(selectionMenu);

// 閉じるボタンのイベント
searchPopup.querySelector('.google-search-close').addEventListener('click', () => {
  searchPopup.style.display = 'none';
  searchPopup.querySelector('.google-search-iframe').src = '';
});

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
  
  // 単語クリックで翻訳
  document.addEventListener('click', (e) => {
    // 選択メニューを隠す
    selectionMenu.style.display = 'none';
    
    if (e.target.classList.contains('translatable')) {
      e.preventDefault();
      e.stopPropagation();
      
      // 既存の選択をクリア
      window.getSelection().removeAllRanges();
      
      const text = e.target.textContent.trim();
      if (!text) return;
      
      // ツールチップを即座に表示（ローディング状態）
      tooltip.textContent = '翻訳中...';
      tooltip.style.left = e.pageX + 10 + "px";
      tooltip.style.top = e.pageY + 10 + "px";
      tooltip.style.display = "block";
      
      // タイムアウトをクリア
      clearTimeout(hideTimeout);
      
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
    } else {
      // クリック位置がツールチップ以外の場合は隠す
      hideTimeout = setTimeout(() => {
        tooltip.style.display = "none";
      }, 300);
    }
  });
  
  // テキスト選択時の処理
  document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      // 選択メニューを表示
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      selectionMenu.style.left = rect.left + (rect.width / 2) - 40 + 'px';
      selectionMenu.style.top = rect.bottom + window.scrollY + 5 + 'px';
      selectionMenu.style.display = 'block';
      
      // メニュークリック時にGoogle検索
      selectionMenu.onclick = (e) => {
        e.stopPropagation();
        const searchQuery = encodeURIComponent(selectedText);
        const searchUrl = 'https://www.google.com/search?q=' + searchQuery + '&igu=1';
        
        searchPopup.querySelector('.google-search-title').textContent = 
          'Google検索: ' + (selectedText.length > 30 ? selectedText.substring(0, 30) + '...' : selectedText);
        searchPopup.querySelector('.google-search-iframe').src = searchUrl;
        searchPopup.style.display = 'flex';
        
        selectionMenu.style.display = 'none';
        selection.removeAllRanges();
      };
    } else if (e.target !== selectionMenu) {
      selectionMenu.style.display = 'none';
    }
  });
  
  // ツールチップの上にマウスがある時は隠さない
  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
  });
  
  tooltip.addEventListener('mouseleave', () => {
    hideTimeout = setTimeout(() => {
      tooltip.style.display = "none";
    }, 300);
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
