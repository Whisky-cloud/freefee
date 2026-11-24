// server.js - DEEPL API版
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Basic認証（BASIC_USER / BASIC_PASS が設定されている場合のみ有効） =====
const BASIC_USER = process.env.BASIC_USER;
const BASIC_PASS = process.env.BASIC_PASS;

function safeEqual(a, b) {
  // 長さに依存せず比較できるよう、SHA-256でハッシュ化してから定数時間比較する
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

if (BASIC_USER && BASIC_PASS) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || "";
    if (header.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx !== -1) {
        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);
        // 両方を必ず評価する（&& の短絡評価でIDの正誤が分からないようにする）
        const userOk = safeEqual(user, BASIC_USER);
        const passOk = safeEqual(pass, BASIC_PASS);
        if (userOk && passOk) return next();
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="English Reader", charset="UTF-8"');
    return res.status(401).send("認証が必要です");
  });
  console.log("Basic認証: 有効");
} else {
  console.warn("Basic認証: 無効（BASIC_USER / BASIC_PASS が未設定のため、誰でもアクセスできます）");
}

let deeplApiKey = null;
try {
  deeplApiKey = process.env.DEEPL_API_KEY;
  if (!deeplApiKey) {
    throw new Error("DEEPL_API_KEY not set");
  }
} catch (e) {
  console.error("DEEPL_API_KEY が正しく設定されていません。翻訳機能は無効になります。");
}

// ===== トップ画面用バー（URL入力 + ブックマーク） =====
const topBarHTML = `
<div id="bookmark-bar" style="position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 90%;">
  <div id="bookmark-list" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;"></div>
</div>

<div style="position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 9999;">
  <form method="get" action="/proxy" style="display: flex; flex-direction: column; align-items: stretch; gap: 10px; width: 600px;">
    <input type="text" id="url-input" name="url" placeholder="英語サイトURL または local:ファイル名.html" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%;height:80px;padding:8px;font-size:32px;box-sizing:border-box;">
    <button type="submit" style="height:80px;font-size:28px;">開く</button>
    <input type="number" id="font-size-input" min="10" max="100" value="32" style="width:100%;height:80px;padding:8px;font-size:32px;text-align:center;box-sizing:border-box;">
    <button type="button" id="font-size-apply" style="height:80px;font-size:28px;">適用</button>
  </form>
</div>

<script>
(function() {
  const urlInput = document.getElementById('url-input');
  const fontInput = document.getElementById('font-size-input');
  const fontButton = document.getElementById('font-size-apply');
  const bookmarkList = document.getElementById('bookmark-list');

  // 前回入力したURLをフォームに復元（自動遷移はしない）
  const savedUrl = localStorage.getItem("lastProxyUrl");
  if (savedUrl && urlInput) {
    urlInput.value = savedUrl;
  }

  // 保存されたフォントサイズを復元
  const savedFontSize = localStorage.getItem("fontSize") || "32";
  if (fontInput) {
    fontInput.value = savedFontSize;
  }

  if (urlInput) {
    urlInput.addEventListener("change", function() {
      localStorage.setItem("lastProxyUrl", this.value);
    });
  }

  if (fontButton && fontInput) {
    fontButton.addEventListener("click", function(e) {
      e.preventDefault();
      const size = parseInt(fontInput.value);
      if (size >= 10 && size <= 100) {
        localStorage.setItem("fontSize", size);
      }
    });
  }

  // ===== ブックマーク一覧の描画 =====
  function getBookmarks() {
    try {
      return JSON.parse(localStorage.getItem("bookmarks") || "[]");
    } catch (e) {
      return [];
    }
  }

  function renderBookmarks() {
    if (!bookmarkList) return;
    const bookmarks = getBookmarks();
    bookmarkList.innerHTML = "";
    bookmarks.forEach(function(bm) {
      const wrapper = document.createElement('span');
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.background = '#eee';
      wrapper.style.borderRadius = '8px';
      wrapper.style.padding = '8px 14px';

      const openBtn = document.createElement('button');
      openBtn.textContent = bm.title || bm.url;
      openBtn.style.fontSize = '24px';
      openBtn.style.border = 'none';
      openBtn.style.background = 'transparent';
      openBtn.style.cursor = 'pointer';
      openBtn.title = bm.url;
      openBtn.addEventListener('click', function() {
        localStorage.setItem("lastProxyUrl", bm.url);
        window.location.href = "/proxy?url=" + encodeURIComponent(bm.url);
      });

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '\\u00d7';
      removeBtn.style.fontSize = '24px';
      removeBtn.style.border = 'none';
      removeBtn.style.background = 'transparent';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.color = '#900';
      removeBtn.title = '削除';
      removeBtn.addEventListener('click', function() {
        const remaining = getBookmarks().filter(function(b) { return b.url !== bm.url; });
        localStorage.setItem("bookmarks", JSON.stringify(remaining));
        renderBookmarks();
      });

      wrapper.appendChild(openBtn);
      wrapper.appendChild(removeBtn);
      bookmarkList.appendChild(wrapper);
    });
  }

  renderBookmarks();
})();
</script>
`;

// ===== 読書画面用バー（戻る + ブックマーク登録 + フォントサイズ） =====
function buildReaderBarHTML(targetUrl) {
  const currentUrlJson = JSON.stringify(targetUrl);
  return `
<div style="position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.92); padding: 6px 10px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
  <button type="button" id="back-button" style="height:60px;font-size:20px;padding:0 16px;">Back</button>
  <button type="button" id="bookmark-add-button" style="height:60px;font-size:20px;padding:0 16px;">&#9671;</button>
  <input type="number" id="font-size-input" min="10" max="100" value="32" style="width:70px;height:60px;padding:8px;font-size:24px;text-align:center;">
  <button type="button" id="font-size-apply" style="height:60px;font-size:20px;padding:0 16px;">適用</button>
</div>

<script>
(function() {
  const CURRENT_URL = ${currentUrlJson};
  const backButton = document.getElementById('back-button');
  const bookmarkAddButton = document.getElementById('bookmark-add-button');
  const fontInput = document.getElementById('font-size-input');
  const fontButton = document.getElementById('font-size-apply');

  const savedFontSize = localStorage.getItem("fontSize") || "32";
  if (fontInput) fontInput.value = savedFontSize;
  document.body.style.fontSize = savedFontSize + "px";

  localStorage.setItem("lastProxyUrl", CURRENT_URL);

  if (backButton) {
    backButton.addEventListener('click', function() {
      window.location.href = "/";
    });
  }

  if (bookmarkAddButton) {
    bookmarkAddButton.addEventListener('click', function() {
      let bookmarks = [];
      try { bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]"); } catch (e) {}

      if (bookmarks.some(function(b) { return b.url === CURRENT_URL; })) {
        alert('このページはすでにブックマーク登録済みです');
        return;
      }
      if (bookmarks.length >= 5) {
        alert('ブックマークは5件までです。トップ画面で不要なものを削除してから登録してください。');
        return;
      }
      const defaultTitle = document.title || CURRENT_URL;
      const title = prompt('ブックマーク名を入力してください', defaultTitle);
      if (title === null) return;
      bookmarks.push({ url: CURRENT_URL, title: title || CURRENT_URL });
      localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
      alert('ブックマークに登録しました');
    });
  }

  if (fontButton && fontInput) {
    fontButton.addEventListener('click', function(e) {
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
}

app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(topBarHTML);
});

// ===== オフライン保存した本（booksフォルダ）の読み込み =====
const fs = require("fs");
const path = require("path");
const BOOKS_DIR = path.join(__dirname, "books");

function loadLocalBook(name) {
  // 英数字・ピリオド・ハイフン・アンダースコアのみ、拡張子は.html/.htm限定
  // （"../" などでbooksフォルダの外を読まれないようにするため）
  if (!/^[A-Za-z0-9._-]+\.html?$/i.test(name) || name.includes("..")) {
    const err = new Error("invalid local file name");
    err.code = "BADNAME";
    throw err;
  }
  const filePath = path.join(BOOKS_DIR, name);
  if (!filePath.startsWith(BOOKS_DIR + path.sep)) {
    const err = new Error("invalid local file path");
    err.code = "BADNAME";
    throw err;
  }
  return fs.readFileSync(filePath, "utf8");
}

// クライアントサイド遅延処理版のプロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.redirect("/");

  const fetchTarget = async () => {
    return axios.get(targetUrl, {
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024,
      family: 4, // IPv6経路がない/不安定なサイト対策としてIPv4を優先
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  };

  try {
    let data;
    if (targetUrl.startsWith("local:")) {
      // 「local:ファイル名.html」の場合は、booksフォルダ内の保存済みファイルを読む（外部サイトに接続しない）
      data = loadLocalBook(targetUrl.slice("local:".length));
    } else {
      try {
        ({ data } = await fetchTarget());
      } catch (firstErr) {
        const retryableCodes = ['ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET', 'ECONNABORTED'];
        if (retryableCodes.includes(firstErr.code)) {
          console.warn('接続失敗のためリトライします:', firstErr.code);
          await new Promise(r => setTimeout(r, 1000));
          ({ data } = await fetchTarget());
        } else {
          throw firstErr;
        }
      }
    }
    
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

// このページのURL（スクロール位置の保存キーに使用）
const CURRENT_URL_FOR_SCROLL = ${JSON.stringify(targetUrl)};
const SCROLL_KEY = 'scrollPos:' + CURRENT_URL_FOR_SCROLL;

function saveScrollPosition() {
  try {
    localStorage.setItem(SCROLL_KEY, String(window.scrollY));
  } catch (e) {}
}

function restoreScrollPosition() {
  try {
    const saved = localStorage.getItem(SCROLL_KEY);
    if (saved !== null) {
      window.scrollTo(0, parseInt(saved, 10));
    }
  } catch (e) {}
}

let scrollSaveTimeout;
window.addEventListener('scroll', function() {
  clearTimeout(scrollSaveTimeout);
  scrollSaveTimeout = setTimeout(saveScrollPosition, 300);
});
window.addEventListener('beforeunload', saveScrollPosition);

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

  // ===== 単語翻訳キャッシュ（クリックで翻訳した単語のみ対象） =====
  function getTranslationCache() {
    try {
      return JSON.parse(localStorage.getItem('translationCache') || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveToTranslationCache(word, translation) {
    try {
      const cache = getTranslationCache();
      cache[word.toLowerCase()] = translation;
      localStorage.setItem('translationCache', JSON.stringify(cache));
    } catch (e) {}
  }
  
  // 翻訳を表示する共通関数
  // cacheable: true の場合のみキャッシュを参照・保存する（単語クリック時のみ true にする。
  // 範囲選択された長文の翻訳はキャッシュしない）
  function showTranslation(text, x, y, cacheable) {
    if (!text || !text.trim()) return;
    
    // タイムアウトをクリア（重要：表示前にクリア）
    clearTimeout(hideTimeout);
    
    tooltip.style.left = x + 10 + "px";
    tooltip.style.top = y + 10 + "px";
    tooltip.style.display = "block";

    // キャッシュ済みの単語ならすぐに表示して終了
    if (cacheable) {
      const cached = getTranslationCache()[text.toLowerCase()];
      if (cached) {
        tooltip.textContent = text + ": " + cached;
        return;
      }
    }
    
    // ツールチップを即座に表示（ローディング状態）
    tooltip.textContent = '翻訳中...';
    
    fetch("/translate?text=" + encodeURIComponent(text) + "&lang=ja")
      .then(response => response.json())
      .then(data => {
        if (data.translation) {
          tooltip.textContent = text + ": " + data.translation;
          if (cacheable) {
            saveToTranslationCache(text, data.translation);
          }
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
      showTranslation(text, e.pageX, e.pageY, true);
      
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
          
          // 選択したテキストの翻訳を表示（範囲選択なのでキャッシュしない）
          showTranslation(
            selectedText,
            rect.left + rect.width / 2 - 10,
            rect.bottom + window.scrollY,
            false
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
          
          // マウスでの範囲選択なのでキャッシュしない
          showTranslation(
            selectedText,
            rect.left + rect.width / 2 - 10,
            rect.bottom + window.scrollY,
            false
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

  // レイアウトが確定してから、前回読んでいた位置までスクロールを復元
  setTimeout(restoreScrollPosition, 100);
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
    $("body").append(buildReaderBarHTML(targetUrl));

    res.send($.html());
  } catch (err) {
    console.error('Proxy error:', err.code || err.message);

    let userMessage = '対象のページに接続できませんでした。';
    if (err.code === 'ETIMEDOUT' || err.code === 'ENETUNREACH' || err.code === 'ECONNABORTED') {
      userMessage = 'サイトへの接続がタイムアウトしました。サイト側が重い、もしくはクラウドサーバーからのアクセスを制限している可能性があります。時間をおいて再度お試しください。';
    } else if (err.code === 'ENOENT') {
      userMessage = '指定されたファイルがbooksフォルダに見つかりません。ファイル名を確認してください（例: local:emma.html）。';
    } else if (err.code === 'BADNAME') {
      userMessage = 'ファイル名が正しくありません。英数字・ピリオド・ハイフン・アンダースコアのみ使用でき、拡張子は.htmlまたは.htmにしてください。';
    } else if (err.code === 'ENOTFOUND') {
      userMessage = 'URLが正しくないか、そのようなサイトが見つかりませんでした。URLを確認してください。';
    } else if (err.response) {
      userMessage = `サイトからエラーが返されました（ステータスコード: ${err.response.status}）。`;
    }

    res.status(500).send(`
      <div style="font-family:sans-serif; max-width:600px; margin:60px auto; padding:20px; text-align:center;">
        <h1 style="font-size:28px;">エラーが発生しました</h1>
        <p style="font-size:20px;">${userMessage}</p>
        <p style="font-size:14px; color:#888;">詳細: ${err.code || err.message}</p>
        <p><a href="/" style="font-size:20px;">トップ画面に戻る</a></p>
      </div>
    `);
  }
});

app.get("/translate", async (req, res) => {
  const text = req.query.text;
  const lang = req.query.lang || "ja";

  if (!text) {
    return res.json({ translation: "" });
  }

  if (!deeplApiKey) {
    console.log('DeepL API not configured, returning placeholder');
    return res.json({ translation: `[${text}]` });
  }

  try {
    const response = await axios.post(
      'https://api-free.deepl.com/v2/translate',
      new URLSearchParams({
        text: text,
        target_lang: lang.toUpperCase()
      }),
      {
        headers: {
          'Authorization': `DeepL-Auth-Key ${deeplApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const translation = response.data.translations[0].text;
    res.json({ translation });
  } catch (err) {
    console.error('Translation error:', err.response?.data || err.message);
    res.json({ translation: `[翻訳エラー: ${text}]` });
  }
});

app.listen(PORT, () => {
  console.log(`サーバー起動 ポート: ${PORT}`);
  console.log(`翻訳API: ${deeplApiKey ? '有効' : '無効（DEEPL_API_KEYを設定してください）'}`);
});
