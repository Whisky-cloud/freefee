const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const {Translate} = require("@google-cloud/translate").v2;
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Google 翻訳 API
const projectId = process.env.GOOGLE_PROJECT_ID;
const translate = new Translate({ 
  projectId, 
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS) 
});

// public フォルダの静的ファイル配信
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.get("/", async (req, res) => {
  const targetUrl = req.query.url;

  // フォーム HTML（下部固定）
  const formHTML = `
    <form method="get">
      <input type="url" name="url" placeholder="英語サイトのURL" value="${targetUrl||''}">
      <button type="submit">開く</button>
    </form>
  `;

  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // CSS
    $("head").append(`
      <style>
        body {
          background: url('parchment.jpg') no-repeat center center fixed;
          background-size: cover;
        }
        body, p, li, span, h1, h2, h3, h4, h5, h6 {
          font-family: "Yu Gothic","Hiragino Sans",sans-serif !important;
        }
        .highlight-word {
          cursor: pointer;
          background: rgba(255,255,0,0.2);
          border-radius: 4px;
          padding: 2px 4px;
        }
        .dict-popup{
          position: fixed;
          bottom: 60px;  /* フォームの上に表示 */
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
        }
        form {
          position: fixed;
          bottom: 10px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          text-align: center;
        }
        form input {
          width: 50%;
          height: 40px;
          padding: 8px;
          font-size: 16px
