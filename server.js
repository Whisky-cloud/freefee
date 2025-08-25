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

const translate = new Translate({
  projectId: credentials?.project_id,
  credentials,
});

// 単語ごとに <span> を作る関数
function wrapTextNodes($, element) {
  element.contents().each(function () {
    if (this.type === "text" && this.data.trim() !== "") {
      const newHtml = this.data.replace(/\b(\w+)\b/g, '<span class="highlight-word">$1</span>');
      $(this).replaceWith(newHtml);
    } else if (this.type === "tag") {
      wrapTextNodes($, $(this));
    }
  });
}

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

app.use(express.urlencoded({ extended: true }));

app.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send(formHTML);

  try {
    const response = await axios.get(targetUrl);
    const $ = cheerio.load(response.data);

    // 単語ごとに <span> ラップ
    wrapTextNodes($, $("body"));

    // タップ翻訳用のスクリプト追加
    $("body").append(`
<script>
document.addEventListener("click", async (e) => {
  const word = e.target.closest(".highlight-word")?.innerText;
  if (!word) return;

  try {
    const res = await fetch("/translate-word?word=" + encodeURIComponent(word));
    const data = await res.json();
    alert(data.translation); // ここをツールチップやポップアップに変更可
  } catch (err) {
    console.error(err);
  }
});
</script>
<style>
.highlight-word {
  display: inline;
  cursor: pointer;
  background-color: #ffffcc;
}
</style>
`);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

// 単語翻訳 API
app.get("/translate-word", async (req, res) => {
  const word = req.query.word;
  if (!word) return res.status(400).json({ error: "word パラメータが必要です" });

  try {
    const [translation] = await translate.translate(word, "ja");
    res.json({ translation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "翻訳エラー" });
  }
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました`);
});
