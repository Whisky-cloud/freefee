// server.js - 構文エラー修正版
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
<div style="position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; align-items: center; gap: 10px;">
  <input type="url" name="url" placeholder="英語サイトURL" style="width:80%;height:80px;padding:8px;font-size:32px;">
  <button type="submit" style="height:80px;font-size:20px;padding:0 12px;">開く</button>
  <input type="range" id="font-slider" min="20" max="70" value="40" style="width:600px; accent-color: #5c3a21;">
</div>

<script>
document.getElementById("font-slider").addEventListener("input", function() {
  document.body.style.fontSize = this.value + "px";
});
</script>
`;

app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(`<form method="get" action="/proxy">${formHTML}</form>`);
});

// クライアントサイド遅延処理版のプロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.redirect("/");

  try {
    const { data } = await axios.get(targetUrl, {
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024 // 10MB制限
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
}
.translatable { cursor: pointer; }
.processing-overlay {
  position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8);
  color: #fff; padding: 10px 15px; border-radius: 5px; z-index: 10001;
  font-size: 14px;
}
</style>
`;
    $("head").append(styleFix);

    // クライアントサイドで遅延処理するスクリプト
    const clientSideScript = `
<script>
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
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // スクリプトタグやスタイルタグ内のテキストは除外
        const parent = node.parentElement;
        if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
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

  const batchSize = 20;
  let processed = 0;

  for (let i = 0; i < textNodes.length; i += batchSize) {
    const batch = textNodes.slice(i, i + batchSize);
    
    batch.forEach(textNode => {
      const text = textNode.textContent;
      const words = text.split(/(\\s+)/);
      
      if (words.length > 1) {
        const fragment = document.createDocumentFragment();
        
        words.forEach(word => {
          if (word.trim() === '') {
            fragment.appendChild(document.createTextNode(word));
          } else {
            const span = document.createElement('span');
            span.className = 'translatable';
            span.textContent = word;
            fragment.appendChild(span);
          }
        });
        
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    });

    processed += batch.length;
    const progress = Math.round((processed / textNodes.length) * 100);
    overlay.textContent = '翻訳機能を準備中... ' + progress + '%';

    // UIをブロックしないよう少し待つ
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  // 処理完了
  overlay.remove();
  setupTranslation();
}

// 翻訳機能を設定
function setupTranslation() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('translatable')) {
      e.stopPropagation();
      window.getSelection().removeAllRanges();
      
      const text = e.target.textContent;
      
      fetch("/translate?text=" + encodeURIComponent(text) + "&lang=ja")
        .then(response => response.json())
        .then(data => {
          tooltip.textContent = data.translation;
          tooltip.style.left = e.pageX + 10 + "px";
          tooltip.style.top = e.pageY + 10 + "px";
          tooltip.style.display = "block";
        });
    } else {
      tooltip.style.display = "none";
    }
  });
}

// DOMが読み込まれたら処理開始
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processTextNodes);
} else {
  processTextNodes();
}
</script>
`;

    $("body").append(clientSideScript);
    $("body").append(formHTML);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

app.get("/translate", async (req, res) => {
  const text = req.query.text;
  const lang = req.query.lang || "ja";

  if (!translate || !text) return res.json({ translation: "[翻訳機能未設定]" });

  try {
    const [translation] = await translate.translate(text, lang);
    res.json({ translation });
  } catch (err) {
    console.error(err);
    res.json({ translation: "[翻訳エラー]" });
  }
});

app.listen(PORT, () => {
  console.log("サーバー起動 ポート:" + PORT);
});
