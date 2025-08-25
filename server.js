// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const urlModule = require("url");

// Google Cloud Translation API v2
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// Google Translate API 初期化
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
  <br>
  <label for="font-slider" style="color:#000;">フォントサイズ調整:</label>
  <input type="range" id="font-slider" min="10" max="80" value="30" style="width:200px;">
</form>
`;

// テキストノードを <span> でラップ
function wrapTextNodes($, node) {
  node.contents().each(function () {
    if (this.type === "text" && this.data.trim() !== "") {
      const span = $("<span>")
        .addClass("highlight-word")
        .text(this.data)
        .attr("style", "font-size:30px;");
      $(this).replaceWith(span);
    } else if (this.type === "tag") {
      wrapTextNodes($, $(this));
    }
  });
}

app.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // 相対パスを絶対パスに変換
    $("img").each(function () {
      const src = $(this).attr("src");
      if (src && !src.startsWith("http")) $(this).attr("src", urlModule.resolve(targetUrl, src));
    });
    $("link, script").each(function () {
      const attr = $(this).is("link") ? "href" : "src";
      const val = $(this).attr(attr);
      if (val && !val.startsWith("http")) $(this).attr(attr, urlModule.resolve(targetUrl, val));
    });

    // テキストノードをラップ
    wrapTextNodes($, $("body"));

    // 基本CSS補正
    $("center").css("display", "block").css("text-align", "center");
    $("pre").css("white-space", "pre-wrap").css("font-family", "monospace");

    // 下部フォーム追加
    $("body").append(formHTML);

    // タップ翻訳 & フォントスライダー JS
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

// フォントサイズスライダー
const slider = document.getElementById("font-slider");
slider.addEventListener("input", () => {
  const size = slider.value + "px";
  document.querySelectorAll(".highlight-word").forEach(span => {
    span.style.fontSize = size;
  });
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
  const word = req.query.word;
  if (!word || !translate) return res.json({ translated: "" });

  try {
    const [translation] = await translate.translate(word, "ja");
    res.json({ translated: translation });
  } catch (err) {
    console.error(err);
    res.json({ translated: "翻訳エラー" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
