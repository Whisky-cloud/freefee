const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const {Translate} = require("@google-cloud/translate").v2;
const urlModule = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

// Google Translate API
const projectId = process.env.GOOGLE_PROJECT_ID;
const translate = new Translate({
  projectId,
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS)
});

app.use(express.urlencoded({ extended: true }));

// 下部固定URL入力フォーム
const formHTML = `
<form method="get" style="
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  text-align: center;
">
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

    // --- 相対パスを絶対パスに変換 ---
    $("img").each(function () {
      const src = $(this).attr("src");
      if (src && !src.startsWith("http")) {
