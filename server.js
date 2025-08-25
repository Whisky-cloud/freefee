// server.js (完成版1.2)

const express = require("express");
const cheerio = require("cheerio");
const axios = require("axios");

// Google Cloud Translation API v2 クライアント
const { Translate } = require("@google-cloud/translate").v2;
const projectId = process.env.GOOGLE_PROJECT_ID;

// Render 環境変数に JSON を丸ごと入れている前提
const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

const translate = new Translate({
  projectId,
  credentials,
});

const app = express();
app.use(express.static("public"));

// --- Google翻訳 API を使う翻訳関数 ---
async function translateText(text, target) {
  let [translations] = await translate.translate(text, target);
  return Array.isArray(translations) ? translations[0] : translations;
}

app.get("/", async (req, res) => {
  try {
    // 翻訳元サイト
    const url = "https://www.gutenberg.org/cache/epub/158/pg158-images.html";
    const { data } = await axios.get(url);

    const $ = cheerio.load(data);

    // --- viewport を強制的にモバイル向けに統一 ---
    const desiredViewport = "width=device-width, initial-scale=1.0, user-scalable=yes";
    const vp = $("meta[name='viewport']");
    if (vp.length) {
      vp.attr("content", desiredViewport); // 既存を上書き
    } else {
      const head = $("head");
      if (head.length) {
        head.prepend(`<meta name="viewport" content="${desiredViewport}">`);
      } else {
        $("html").prepend(
          `<head><meta name="viewport" content="${desiredViewport}"></head>`
        );
      }
    }

    // --- 横はみ出しの主犯だけを抑える超ミニマルCSS ---
    if ($("#tap-translate-mobile-fix").length === 0) {
      const fixCss = `
<style id="tap-translate-mobile-fix">
@media (max-width: 1024px) {
  html, body { max-width:100%; overflow-x:hidden; }
  img, video, iframe, canvas { max-width:100%; height:auto; }
}
</style>`;
      const head2 = $("head");
      if (head2.length) {
        head2.append(fixCss);
      } else {
        $("html").prepend(`<head>${fixCss}</head>`);
      }
    }

    // --- タップした要素を翻訳して表示するスクリプト追加 ---
    $("body").append(`
      <div id="translation-box"
           style="position:fixed;bottom:10px;left:10px;right:10px;
                  background:#ffffe0;border:1px solid #ccc;padding:10px;
                  font-size:16px;z-index:9999;max-height:40%;overflow:auto;
                  display:none;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.2)">
      </div>
      <script>
        document.addEventListener("click", async (e) => {
          let sel = window.getSelection().toString().trim();
          let text = sel || e.target.innerText;
          if (!text) return;

          const res = await fetch("/translate?q=" + encodeURIComponent(text));
          const data = await res.json();
          const box = document.getElementById("translation-box");
          box.innerHTML = "<b>原文:</b> " + text + "<br><b>翻訳:</b> " + data.translated;
          box.style.display = "block";
        });
      </script>
    `);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading page");
  }
});

app.get("/translate", async (req, res) => {
  try {
    const q = req.query.q;
    const translated = await translateText(q, "ja");
    res.json({ translated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Translation failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port " + port);
});
