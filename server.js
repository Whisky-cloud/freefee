// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// Render 環境変数 GOOGLE_CREDENTIALS を利用
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (e) {
  console.error("GOOGLE_CREDENTIALS が正しく設定されていません");
}

let translate = null;
if (credentials) {
  translate = new Translate({
    projectId: credentials.project_id,
    credentials,
  });
}

app.use(express.urlencoded({ extended: true }));

// 入力フォームのHTML
const formHTML = `
<div style="text-align:center; margin:20px;">
  <input type="url" id="url-input" placeholder="英語サイトURL" style="width:50%;height:40px;padding:8px;font-size:32px;">
  <button id="open-btn" style="height:40px;font-size:32px;padding:0 12px;">開く</button>
</div>
<script>
document.getElementById("open-btn").addEventListener("click", () => {
  const url = document.getElementById("url-input").value;
  if(url) window.location.href='/proxy?url=' + encodeURIComponent(url);
});
</script>
`;

// テキストノードを <span> でラップ
function wrapTextNodes($, element) {
  element.contents().each(function () {
    if (this.type === "text" && this.data.trim() !== "") {
      const span = $("<span>")
        .addClass("highlight-word")
        .text(this.data);
      $(this).replaceWith(span);
    } else if (this.type === "tag") {
      wrapTextNodes($, $(this));
    }
  });
}

// 指定されたページを翻訳して返す
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  const lang = req.query.lang || "ja";

  if (!targetUrl) {
    return res.send(formHTML);
  }

  try {
    const response = await axios.get(targetUrl);
    const $ = cheerio.load(response.data);

    // テキストノードをラップ
    wrapTextNodes($, $("body"));

    // 翻訳
    if (translate) {
      const texts = $(".highlight-word").map((i, el) => $(el).text()).get();
      let [translations] = await translate.translate(texts, lang);
      if (!Array.isArray(translations)) translations = [translations];
      $(".highlight-word").each(function (i) {
        $(this).attr("data-translation", translations[i]);
      });
    }

    // フォントサイズ指定
    $("[style]").each(function () {
      let style = $(this).attr("style");
      if (!/font-size/.test(style)) style += "; font-size:30px;";
      $(this).attr("style", style);
    });
    $("*").each(function () {
      const el = $(this);
      if (!el.attr("style")) el.attr("style", "font-size:30px;");
    });

    // ツールチップ用スクリプト
    $("body").append(`
<style>
.tooltip {
  position: absolute;
  background: #fff8dc;
  border: 2px solid #5a2d0c;
  padding: 8px 12px;
  font-size: 24px;
  border-radius: 6px;
  z-index: 9999;
  box-shadow: 0 0 5px rgba(0,0,0,0.3);
}
.highlight-word {
  cursor: pointer;
}
</style>
<script>
function showTooltip(target, text) {
  document.querySelectorAll(".tooltip").forEach(t => t.remove());
  const rect = target.getBoundingClientRect();
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.innerText = text;
  document.body.appendChild(tooltip);
  tooltip.style.left = rect.left + window.scrollX + "px";
  tooltip.style.top = rect.bottom + window.scrollY + "px";
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("highlight-word")) {
    const translation = e.target.getAttribute("data-translation") || "";
    showTooltip(e.target, translation);
  } else {
    document.querySelectorAll(".tooltip").forEach(t => t.remove());
  }
});
</script>
`);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました`);
});
