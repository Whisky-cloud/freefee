// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const urlModule = require("url");

// Google Cloud Translation API v2
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// Render 環境変数 GOOGLE_CREDENTIALS を利用
let translate = null;
try {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  translate = new Translate({
    projectId: credentials.project_id,
    credentials,
  });
} catch (e) {
  console.error("❌ GOOGLE_CREDENTIALS が正しく設定されていません。翻訳機能は無効になります。");
}

app.use(express.urlencoded({ extended: true }));

// 下部固定URL入力フォーム
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

    // 相対パスを絶対パスに変換
    $("img").each(function () {
      const src = $(this).attr("src");
      if (src && !src.startsWith("http")) {
        $(this).attr("src", urlModule.resolve(targetUrl, src));
      }
    });

    $("link, script").each(function () {
      const attr = $(this).is("link") ? "href" : "src";
      const val = $(this).attr(attr);
      if (val && !val.startsWith("http")) {
        $(this).attr(attr, urlModule.resolve(targetUrl, val));
      }
    });

    // タグ保持 + テキストノードだけ置換
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

    // 古いタグや特殊タグのCSS補正
    $("center").css("display", "block").css("text-align", "center");
    $("pre").css("white-space", "pre-wrap").css("font-family", "monospace");

    // 下部フォーム追加
    $("body").append(formHTML);

    // --- 相対フォントサイズ +5px ---
    $("*").each(function () {
      const el = $(this);
      const style = el.attr("style");
      if (!style) return;

      const newStyle = style.replace(/font-size\s*:\s*(\d+)px/gi, (_, px) => {
        return `font-size:${parseInt(px) + 5}px`;
      });
      el.attr("style", newStyle);
    });

    $("style").each(function () {
      let css = $(this).html();
      css = css.replace(/font-size\s*:\s*(\d+)px/gi, (_, px) => {
        return `font-size:${parseInt(px) + 5}px`;
      });
      $(this).html(css);
    });

    // タップ翻訳ポップアップ JS
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
  display: none;"></div>

<script>
async function lookup(word) {
  if (!word) return;
  try {
    const res = await fetch("/translate?word=" + encodeURIComponent(word));
    const data = await res.json();
    const popup = document.getElementById("dict-popup");
    popup.innerText = word + " → " + data.translated;
    popup.style.display = "block";
    setTimeout(() => popup.style.display = "none", 5000);
  } catch(e) { console.error(e); }
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("highlight-word")) lookup(e.target.innerText);
});
</script>
    `);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send(formHTML + "<p style='color:red;'>ページを取得できませんでした</p>");
  }
});

// 翻訳 API
app.get("/translate", async (req, res) => {
  if (!translate) return res.json({ translated: "翻訳機能が無効です" });
  const word = req.query.word;
  if (!word) return res.json({ translated: "" });
  try {
    const [translation] = await translate.translate(word, "ja");
    res.json({ translated: translation });
  } catch (err) {
    console.error(err);
    res.json({ translated: "翻訳エラー" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
