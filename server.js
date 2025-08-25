// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const {Translate} = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// Render 環境変数 GOOGLE_CREDIENTIALS を利用
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDIENTIALS);
} catch (e) {
  console.error("GOOGLE_CREDIENTIALS が正しく設定されていません");
}

const translate = new Translate({
  projectId: credentials.project_id,
  credentials,
});

// テキストノードを <span> でラップする関数
function wrapTextNodes($, element) {
  element.contents().each(function () {
    if (this.type === "text" && this.data.trim() !== "") {
      const span = $("<span>")
        .addClass("translatable")
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
    return res.status(400).send("url パラメータが必要です");
  }

  try {
    const response = await axios.get(targetUrl);
    const $ = cheerio.load(response.data);

    // テキストノードをラップ
    wrapTextNodes($, $("body"));

    // すべての翻訳対象テキストを取得
    const texts = $(".translatable")
      .map((i, el) => $(el).text())
      .get();

    // Google 翻訳 API で翻訳
    let [translations] = await translate.translate(texts, lang);

    if (!Array.isArray(translations)) {
      translations = [translations];
    }

    $(".translatable").each(function (i) {
      $(this).text(translations[i]);
    });

    // フォントサイズを相対的に +5px
    $("[style]").each(function () {
      let style = $(this).attr("style");
      style = style.replace(/font-size\s*:\s*(\d+)px/gi, (_, px) => {
        return `font-size:${parseInt(px) + 5}px`;
      });
      $(this).attr("style", style);
    });

    $("style").each(function () {
      let css = $(this).html();
      css = css.replace(/font-size\s*:\s*(\d+)px/gi, (_, px) => {
        return `font-size:${parseInt(px) + 5}px`;
      });
      $(this).html(css);
    });

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました`);
});
