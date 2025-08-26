const express = require("express");
const cheerio = require("cheerio");
const axios = require("axios");

// Google Cloud Translation API v2
const { Translate } = require("@google-cloud/translate").v2;
const projectId = process.env.GOOGLE_PROJECT_ID;
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const translate = new Translate({ projectId, credentials });

const app = express();
app.use(express.static("public"));

app.get("/fetch", async (req, res) => {
  try {
    const response = await axios.get(req.query.url);
    const $ = cheerio.load(response.data);

    // <body> の中身をそのまま返す
    res.send(`
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-size: 30px; line-height: 1.8; padding: 20px; }
            input, button { font-size: 2em; padding: 10px; margin: 5px; }
            input[type="range"] {
              width: 300px;
              accent-color: saddlebrown;
              transform: scale(2);
              margin-left: 20px;
            }
            #tooltip {
              position: absolute;
              background: rgba(0,0,0,0.8);
              color: white;
              padding: 10px;
              border-radius: 8px;
              display: none;
              max-width: 300px;
              z-index: 1000;
            }
          </style>
        </head>
        <body>
          <div>
            <input type="text" id="urlInput" placeholder="URLを入力" size="50">
            <button id="loadBtn">開く</button>
            <input type="range" id="fontSizeSlider" min="10" max="100" value="30">
          </div>
          <div id="content">${$("body").html()}</div>
          <div id="tooltip"></div>

          <script>
            const content = document.getElementById("content");
            const tooltip = document.getElementById("tooltip");

            // フォントサイズ調整
            document.getElementById("fontSizeSlider").addEventListener("input", (e) => {
              content.style.fontSize = e.target.value + "px";
            });

            // URLロード
            document.getElementById("loadBtn").addEventListener("click", () => {
              const url = document.getElementById("urlInput").value;
              if (!url) return;
              fetch("/fetch?url=" + encodeURIComponent(url))
                .then(res => res.text())
                .then(html => { document.body.innerHTML = html; });
            });

            // クリックした要素のテキストを翻訳
            content.addEventListener("click", async (e) => {
              e.preventDefault();
              let text = e.target.innerText;
              if (!text || text.trim() === "") return;

              try {
                const res = await fetch("/translate?text=" + encodeURIComponent(text));
                const data = await res.json();

                tooltip.innerText = data.translation;
                tooltip.style.left = e.pageX + "px";
                tooltip.style.top = e.pageY + "px";
                tooltip.style.display = "block";

                setTimeout(() => { tooltip.style.display = "none"; }, 5000);
              } catch (err) {
                console.error("翻訳エラー:", err);
              }
            });
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("取得エラー: " + err.message);
  }
});

// 翻訳API
app.get("/translate", async (req, res) => {
  try {
    let [translation] = await translate.translate(req.query.text, "ja");
    res.json({ translation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("サーバー起動 port " + port));
