// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// --- Google Translate API 初期化 ---
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

// --- 下部固定フォーム HTML ---
const formHTML = `
<form method="get" style="
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  text-align: center;">
  <input type="url" name="url" placeholder="英語サイトURL" style="width:50%;height:80px;padding:8px;font-size:32px;">
  <button type="submit" style="height:80px;font-size:32px;padding:0 12px;">開く</button>
  <input type="range" id="font-slider" min="10" max="100" value="30" style="width:200px; accent-color: #5c3a21;">
</form>

<script>
document.getElementById("font-slider").addEventListener("input", function() {
  document.body.style.fontSize = this.value + "px";
});
</script>
`;

app.use(express.urlencoded({ extended: true }));

// --- テキストノードを <span> でラップ ---
function wrapTextNodes($, element) {
  element.contents().each(function () {
    if (this.type === "text" && this.data.trim() !== "") {
      const span = $("<span>")
        .addClass("translatable")
        .text(this.data)
        .css("cursor", "pointer");
      $(this).replaceWith(span);
    } else if (this.type === "tag") {
      wrapTextNodes($, $(this));
    }
  });
}

// --- 指定ページを取得・翻訳 ---
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // --- テキストノードをラップ ---
    wrapTextNodes($, $("body"));

    // --- CSS: 横幅制御、フォントサイズ指定 ---
    $("body").css("font-size", "30px");
    const styleFix = `
<style>
html, body { max-width:100%; overflow-x:hidden; }
img, video, iframe, canvas { max-width:100%; height:auto; }
.container, [class*="container"], table { max-width:100% !important; width:100% !important; }
.translatable-tooltip {
  position: absolute;
  background: #fffbe0;
  border: 1px solid #ccc;
  padding: 5px 10px;
  z-index: 10000;
  box-shadow: 2px 2px 6px rgba(0,0,0,0.3);
  display: none;
}
</style>
`;
    $("head").append(styleFix);

    // --- ツールチップ JS 修正版 ---
    const tooltipScript = `
<script>
const tooltip = document.createElement("div");
tooltip.className = "translatable-tooltip";
document.body.appendChild(tooltip);

document.querySelectorAll(".translatable").forEach(el => {
  el.addEventListener("click", async function(e) {
    e.stopPropagation();
    const text = this.innerText;  // クリックした単語のみ取得

    // 翻訳 API に問い合わせ
    const response = await fetch("/translate?text=" + encodeURIComponent(text) + "&lang=ja");
    const data = await response.json();

    tooltip.innerText = data.translation;
    tooltip.style.left = e.pageX + 10 + "px";
    tooltip.style.top = e.pageY + 10 + "px";
    tooltip.style.display = "block";
  });
});

document.addEventListener("click", () => { tooltip.style.display = "none"; });
</script>
`;
    $("body").append(tooltipScript);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

// --- 翻訳 API エンドポイント ---
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
  console.log(`サーバー起動 ${PORT}`);
});
