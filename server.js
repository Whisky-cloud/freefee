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

  // フォーム HTML
  const formHTML = `
    <form method="get" style="margin:20px">
      <input type="url" name="url" placeholder="英語サイトのURL" value="${targetUrl||''}" style="width:60%;padding:8px;">
      <button type="submit" style="padding:8px;">開く</button>
    </form>
  `;

  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // CSS
    $("head").append(`
      <style>
        :root{--fg:#111;--font:"Yu Gothic","Hiragino Sans",sans-serif;}
        html, body{
          background: url('parchment.jpg') no-repeat center center fixed;
          background-size: cover;
          color: var(--fg)!important;
          font-family: var(--font)!important;
          font-size: 18px;
          line-height: 1.8;
          padding: 10px;
        }
        * { background-color: transparent !important; }
        input, textarea, select { 
          background: rgba(255,255,255,0.06) !important;
          color: var(--fg) !important; 
        }
        .highlight-word{
          cursor: pointer;
          background: rgba(255,255,0,0.2);
          border-radius: 4px;
          padding: 2px 4px;
          margin: 0 1px;
          display: inline-block;
        }
        .dict-popup{
          position: fixed;
          bottom: 10px;
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
        form input{font-size:16px;}
        form button{font-size:16px;}
      </style>
    `);

    // 単語を span でラップ
    const bodyHtml = $("body").html();
    const wrapped = bodyHtml.replace(/\b([a-zA-Z]{2,})\b/g,
      '<span class="highlight-word">$1</span>'
    );
    $("body").html(formHTML + wrapped);

    // JS: 辞書ポップアップ
    $("body").append(`
      <div id="dict-popup" class="dict-popup" style="display:none;"></div>
      <script>
        async function lookup(word){
          try{
            const res = await fetch("/translate?word=" + encodeURIComponent(word));
            const data = await res.json();
            const popup=document.getElementById("dict-popup");
            popup.innerText=word+" → "+data.translated;
            popup.style.display="block";
            setTimeout(()=>popup.style.display="none",5000);
          }catch(e){console.error(e);}
        }
        document.addEventListener("click",(e)=>{
          if(e.target.classList.contains("highlight-word")) lookup(e.target.innerText);
        });
      </script>
    `);

    res.send($.html());
  } catch (err) {
    console.error(err.message);
    res.status(500).send(formHTML + "<p style='color:red;'>ページを取得できませんでした</p>");
  }
});

// 翻訳 API
app.get("/translate", async (req, res) => {
  const word = req.query.word;
  if (!word) return res.json({ translated: "" });
  try {
    const [translation] = await translate.translate(word, "ja");
    res.json({ translated: translation });
  } catch (err) {
    console.error(err);
    res.json({ translated: "翻訳エラー" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
