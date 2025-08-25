// server.js
const express = require("express");
const cheerio = require("cheerio");
const axios = require("axios");

// Google Cloud Translation API v2 クライアント
const { Translate } = require("@google-cloud/translate").v2;

// Render 環境変数 GOOGLE_CREDENTIALS に JSON を丸ごと入れている前提
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (e) {
  console.error("❌ GOOGLE_CREDENTIALS が正しく設定されていません");
  process.exit(1);
}

const projectId = credentials.project_id;

const translate = new Translate({
  projectId,
  credentials,
});

const app = express();
const PORT = process.env.PORT || 3000;

// HTML タグを維持しつつテキストだけ翻訳
async function translateHtmlPreserveTags(html, targetLang = "ja") {
  const $ = cheerio.load(html);

  async function translateTextNode(node) {
    if (node.type === "text" && node.data.trim()) {
      try {
        const [translation] = await translate.translate(node.data, targetLang);
        node.data = translation;
      } catch (err) {
        console.error("翻訳エラー:", err);
      }
    }
    if (node.children) {
      for (const child of node.children) {
        await translateTextNode(child);
      }
    }
  }

  await translateTextNode($.root()[0]);
  return $.html();
}

app.get("/", (req, res) => {
  res.send("🌍 Translation Proxy Server is running!");
});

app.get("/translate", async (req, res) => {
  const { url, lang } = req.query;
  if (!url) {
    return res.status(400).send("❌ URLを指定してください");
  }
  const targetLang = lang || "ja";

  try {
    const response = await axios.get(url);
    const originalHtml = response.data;

    const translatedHtml = await translateHtmlPreserveTags(
      originalHtml,
      targetLang
    );

    res.send(translatedHtml);
  } catch (err) {
    console.error("取得/翻訳エラー:", err);
    res.status(500).send("⚠️ エラーが発生しました");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
