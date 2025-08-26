// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// --- Google 翻訳 API 初期化 ---
let translate;
try {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  translate = new Translate({
    projectId: credentials.project_id,
    credentials,
  });
} catch (e) {
  console.error("GOOGLE_CREDENTIALS が正しく設定されていません。翻訳機能は無効になります。");
}

// --- 入力フォームとスライダーのHTML ---
const formHTML = `
<div style="position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:10px;">
  <input id="urlInput" type="url" placeholder="英語サイトURL" style="width:400px;height:40px;font-size:16px;padding:8px;">
  <button id="openBtn" style="height:40px;font-size:16px;padding:0 12px;">開く</button>
  <input id="fontSlider" type="range" min="10" max="50" value="30" style="width:200px; accent-color: brown;">
</div>
`;

// --- ルート: 入力フォーム ---
app.get("/", (req, res) => {
  res.send(formHTML + `<script>
    const btn = document.getElementById("openBtn");
    btn.onclick = () => {
      const url = document.getElementById("urlInput").value;
      if(url) window.location.href = "/proxy?url=" + encodeURIComponent(url);
    };
  </script>`);
});

// --- ルート: 外部ページ取得・表示 ---
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.redirect("/");

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // --- テキストノードを <span> でラップ ---
    function wrapTextNodes(element) {
      element.contents().each(function () {
        if (this.type === "text" && this.data.trim() !== "") {
          const span = $("<span>").addClass("translatable").text(this.data);
          $(this).replaceWith(span);
        } else if (this.type === "tag") {
          wrapTextNodes($(this));
        }
      });
    }
    wrapTextNodes($("body"));

    // --- フォントサイズ初期値 30px ---
    $("[style]").each(function () {
      let style = $(this).attr("style");
      style = style.replace(/font-size\s*:\s*[^;]+;/gi, "font-size:30px;");
      $(this).attr("style", style);
    });
    $("style").each(function () {
      let css = $(this).html();
      css = css.replace(/font-size\s*:\s*[^;]+;/gi, "font-size:30px;");
      $(this).html(css);
    });

    // --- フォントサイズ変更用スクリプト ---
    const fontScript = `
<script>
const slider = document.getElementById("fontSlider");
slider.oninput = () => {
  document.body.style.fontSize = slider.value + "px";
};
</script>
`;

    // --- ツールチップ翻訳 ---
    const tooltipScript = `
<script>
const spans = document.querySelectorAll(".translatable");
spans.forEach(span => {
  span.style.cursor = "pointer";
  span.title = "翻訳中...";
  span.onclick = async () => {
    try {
      const text = span.textContent;
      const res = await fetch("/translate?text=" + encodeURIComponent(text));
      const data = await res.json();
      span.title = data.translation;
    } catch (e) {
      span.title = "翻訳エラー";
    }
  };
});
</script>
`;

    // --- ページ返却 ---
    res.send(formHTML + $.html() + fontScript + tooltipScript);

  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

// --- 翻訳用API ---
app.get("/translate", async (req, res) => {
  const text = req.query.text;
  if (!translate || !text) return res.json({ translation: text });
  try {
    const [translation] = await translate.translate(text, "ja");
    res.json({ translation });
  } catch (e) {
    res.json({ translation: text });
  }
});

app.listen(PORT, () => console.log(`サーバー起動 ${PORT}`));
