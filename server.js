const express = require("express");
const cheerio = require("cheerio");
const axios = require("axios");
const urlModule = require("url");

// Google Cloud Translation API v2 クライアント
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// --- Google Translate API 初期化 ---
let translate = null;
try {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  translate = new Translate({
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials,
  });
} catch (e) {
  console.error("環境変数 GOOGLE_CREDENTIALS が未設定または不正です。翻訳機能は無効になります。");
}

app.use(express.urlencoded({ extended: true }));

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

app.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // --- viewport を強制 ---
    const desiredViewport = "width=device-width, initial-scale=1.0, user-scalable=yes";
    const vp = $("meta[name='viewport']");
    if (vp.length) {
      vp.attr("content", desiredViewport);
    } else {
      const head = $("head");
      if (head.length) {
        head.prepend(`<meta name="viewport" content="${desiredViewport}">`);
      } else {
        $("html").prepend(`<head><meta name="viewport" content="${desiredViewport}"></head>`);
      }
    }

    // --- 横スクロール防止・固定幅コンテナ対応 CSS ---
    if ($("#tap-translate-mobile-fix").length === 0) {
      const fixCss = `
<style id="tap-translate-mobile-fix">
@media (max-width: 1024px) {
  html, body { max-width:100%; overflow-x:hidden; }
  img, video, iframe, canvas { max-width:100%; height:auto; }
  .container, [class*="container"], table { max-width:100% !important; width:100% !important; }
}
</style>`;
      const head2 = $("head");
      if (head2.length) {
        head2.append(fixCss);
      } else {
        $("html").prepend(`<head>${fixCss
