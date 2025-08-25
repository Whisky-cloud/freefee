const express = require("express");
const cheerio = require("cheerio");
const axios = require("axios");
const urlModule = require("url");

// Google Cloud Translation API v2 クライアント
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// --- Google Translate API 初期化 ---
let translate = null;
try {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  translate = new Translate({
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials,
  });
} catch (e) {
  console.error("環境変数 GOOGLE_CREDENTIALS が未設定または不正です。翻訳機能は無効になります。");
}

app.use(express.urlencoded({ extended: true }));

// 下部固定フォーム
const formHTML = `
<form method="get" style="
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  text-align: center;">
  <input type="url" name="url" placeholder="英語サイトURL" style="width:50%;height:40px;padding:8px;font-size:16px;">
  <button type="submit" style="height:40px;font-size:16px;padding:0 12px;">開く</button>
</form>
`;

app.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // --- viewport ---
    const desiredViewport = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes";
    const vp = $("meta[name='viewport']");
    if (vp.length) {
      vp.attr("content", desiredViewport);
    } else {
      const head = $("head");
      if (head.length) {
        head.prepend(`<meta name="viewport" content="${desiredViewport}">`);
      } else {
        $("html").prepend(`<head><meta name="viewport" content="${desiredViewport}"></head>`);
      }
    }

    // --- 横幅変換用 CSS ---
    if ($("#tap-translate-mobile-fix").length === 0) {
      const fixCss = `
<style id="tap-translate-mobile-fix">
html, body { max-width:100% !important; width:100% !important; overflow-x:auto; }
img, video, iframe, canvas { max-width:100% !important; height:auto !important; }
.container, [class*="container"], table { max-width:100% !important; width:100% !important; }
</style>`;
      $("head").append(fixCss);
    }

    // --- 相対パス絶対化 ---
    $("img").each(function () {
      const src = $(this).attr("src");
      if (src && !src.startsWith("http")) $(this).attr("src", urlModule.resolve(targetUrl, src));
    });
    $("link, script").each(function () {
      const attr = $(this).is("link") ? "href" : "src";
      const val = $(this).attr(attr);
      if (val && !val.startsWith("http")) $(this).attr(attr, urlModule.resolve(targetUrl, val));
    });

    // --- タグ保持 + 英単語ラップ ---
    function wrapTextNodes(node) {
      node.contents().each(function () {
        if (this.type === 'text') {
          const wrapped = this.data.replace(/\b([a-zA-Z]{2,})\b/g,
            '<span class="highlight-word">$1</span>'
          );
          $(this).replaceWith(wrapped);
        } else if (this.type === 'tag') {
          wrapTextNodes($(this));
        }
      });
    }
    wrapTextNodes($("body"));

    // --- 固定幅(px)を%に変換 ---
    $('[style]').each(function () {
      const style = $(this).attr('style');
      const newStyle = style.replace(/width\s*:\s*(\d+)px/gi, (_, px) => {
        const percent = Math.min(Math.round(px / 12), 100); // 12px=1%の目安、簡易計算
        return `width:${percent}%`;
      });
      $(this).attr('style', newStyle);
    });

    // 古いタグ補正
    $("center").css({ display: "block", "text-align": "center" });
    $("pre").css({ "white-space": "pre-wrap", "font-family": "monospace" });

    // 下部フォーム
    $("body").append(formHTML);

    // 翻訳ポップアップ
    $("body").append(`
<div id="dict-popup" style="
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.9);
  color: #fff;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 16px;
  z-index: 9999;
  max-width: 90%;
  word-break: break-word;
  display: none;
"></div>
<script>
async function lookup(word){
  if(!word)return;
  try{
    const res = await fetch("/translate?word="+encodeURIComponent(word));
    const data = await res.json();
    const popup = document.getElementById("dict-popup");
    popup.innerText = word+" → "+(data.translated||"翻訳不可");
    popup.style.display="block";
    setTimeout(()=>popup.style.display="none",5000);
  }catch(e){console.error(e);}
}
document.addEventListener("click",e=>{
  if(e.target.classList.contains("highlight-word")) lookup(e.target.innerText);
});
</script>
    `);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send(formHTML + "<p style='color:red;'>ページ取得失敗</p>");
  }
});

// 翻訳 API
app.get("/translate", async (req, res) => {
  if(!translate) return res.json({translated:"翻訳機能無効"});
  const word = req.query.word;
  if(!word) return res.json({translated:""});
  try{
    const [translation] = await translate.translate(word,"ja");
    res.json({translated:translation});
  }catch(err){
    console.error(err);
    res.json({translated:"翻訳エラー"});
  }
});

app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
