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
<form method="get" action="/proxy" style="
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;">
  <input type="url" name="url" placeholder="英語サイトURL" style="width:80%;height:80px;padding:8px;font-size:32px;">
  <button type="submit" style="height:80px;font-size:32px;padding:0 12px;">開く</button>
  <input type="range" id="font-slider" min="10" max="100" value="30" style="width:500px; accent-color: #5c3a21;">
</form>

<script>
document.getElementById("font-slider").addEventListener("input", function() {
  document.body.style.fontSize = this.value + "px";
});
</script>
`;

app.use(express.urlencoded({ extended: true }));

// --- テキストノードを単語単位で <span> でラップ ---
function wrapTextNodes($, element) {
  element.contents().each(function () {
    if (this.type === "text" && this.data.trim() !== "") {
      const words = this.data.split(/(\s+)/); // 空白を保持して分割
      const fragments = words.map(word => {
        if (word.trim() === "") return word; // 空白はそのまま
        return $("<span>")
          .addClass("translatable")
          .text(word)
          .css("cursor", "pointer");
      });
      $(this).replaceWith(fragments);
    } else if (this.type === "tag") {
      wrapTextNodes($, $(this));
    }
  });
}

// --- ルート "/" をフォーム表示用に追加 ---
app.get("/", (req, res) => {
  res.send(formHTML);
});

// --- 指定ページを取得・翻訳 ---
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // --- テキストノードを単語単位でラップ ---
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
  background: #000;       /* 黒背景 */
  color: #fff;            /* 白文字 */
  padding: 5px 10px;
  border-radius: 8px;     /* 角丸 */
  box-shadow: none;       /* 影なし */
  border: none;           /* 枠線なし */
  z-index: 10000;
  display: none;
}
</style>
`;
    $("head").append(styleFix);

    // --- ツールチップ JS ---
    const tooltipScript = `
<script>
const tooltip = document.createElement("div");
tooltip.className = "translatable-tooltip";
document.body.appendChild(tooltip);

document.querySelectorAll(".translatable").forEach(el => {
  el.addEventListener("click", async function(e) {
    e.stopPropagation();
    window.getSelection().removeAllRanges(); // 選択表示を消す
    const text = this.innerText;

    // Google 翻訳 API に問い合わせ
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
    $("body").append(formHTML); // ★ これを戻したので翻訳ページにもフォーム（スライダー）が表示されます

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
