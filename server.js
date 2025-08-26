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
  projectId: credentials ? credentials.project_id : undefined,
  credentials: credentials,
});

// 下部固定フォーム（完成版2のUI）
const formHTML =
  '<form method="get" style="position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; text-align: center;">' +
  '<input type="url" name="url" placeholder="英語サイトURL" style="width:50%;height:40px;padding:8px;font-size:16px;">' +
  '<button type="submit" style="height:40px;font-size:16px;padding:0 12px;margin-left:5px;">開く</button>' +
  '<br><input type="range" id="fontSizeSlider" min="10" max="60" value="30" style="width:200px; margin-top:5px; accent-color:brown;">' +
  '<input type="number" id="fontSizeInput" min="10" max="60" value="30" style="width:60px; margin-top:5px;">' +
  '</form>';

// URL入力ページ
app.get("/", function (req, res) {
  res.send(formHTML);
});

// 翻訳ページ
app.get("/proxy", async function (req, res) {
  const targetUrl = req.query.url;
  const lang = req.query.lang || "ja";

  if (!targetUrl) {
    return res.status(400).send("url パラメータが必要です");
  }

  try {
    const response = await axios.get(targetUrl);
    const $ = cheerio.load(response.data);

    // body内のテキストを <span> でラップ
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

    // 翻訳
    const texts = $(".translatable")
      .map(function (i, el) {
        return $(el).text();
      })
      .get();

    let [translations] = await translate.translate(texts, lang);
    if (!Array.isArray(translations)) {
      translations = [translations];
    }

    $(".translatable").each(function (i) {
      $(this).text(translations[i]);
    });

    // デフォルトフォントサイズ30px
    $("[style]").each(function () {
      let style = $(this).attr("style");
      style = style.replace(/font-size\s*:\s*\d+px/gi, "font-size:30px");
      $(this).attr("style", style);
    });
    $("style").each(function () {
      let css = $(this).html();
      css = css.replace(/font-size\s*:\s*\d+px/gi, "font-size:30px");
      $(this).html(css);
    });

    // ツールチップで翻訳を表示
    $(".translatable").attr("title", function () {
      return $(this).text();
    });

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

// サーバー起動
app.listen(PORT, function () {
  console.log("サーバー起動 " + PORT);
});
