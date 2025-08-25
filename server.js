// server.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const urlModule = require("url");
const { Translate } = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// Google Translate API 初期化
let translate = null;
try {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  translate = new Translate({
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials,
  });
} catch (e) {
  console.error("GOOGLE_CREDENTIALS が未設定または不正です。翻訳機能は無効になります。");
}

app.use(express.urlencoded({ extended: true }));

// 下部固定URL入力フォーム + フォントサイズ調整
const formHTML = `
<div style="
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  text-align: center;">
  <input type="url" id="tap-url" placeholder="英語サイトURL" style="width:50%;height:40px;padding:8px;font-size:32px;">
  <button onclick="openURL()" style="height:40px;font-size:32px;padding:0 12px;">開く</button>
  <br>
  <input type="range" id="font-slider" min="10" max="100" value="30" style="width:50%; height:32px; background-color:#5C4033; margin-top:8px;">
  <input type="number" id="font-input" min="10" max="100" value="30" style="width:60px; height:32px; font-size:32px;">
</div>

<script>
const slider = document.getElementById('font-slider');
const fontInput = document.getElementById('font-input');

slider.addEventListener('input', () => {
  fontInput.value = slider.value;
  document.body.style.fontSize = slider.value + 'px';
});

fontInput.addEventListener('change', () => {
  let val = parseInt(fontInput.value);
  if(isNaN(val)) val = 30;
  val = Math.min(100, Math.max(10, val));
  slider.value = val;
  document.body.style.fontSize = val + 'px';
});

function openURL(){
  const url = document.getElementById('tap-url').value;
  if(url) window.location.href = "/?url=" + encodeURIComponent(url);
}
</script>
`;

app.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.send(formHTML);

  try {
    const { data } = await axios.get(targetUrl);
    const $ = cheerio.load(data);

    // 相対パスを絶対パスに変換
    $("img").each(function () {
      const src = $(this).attr("src");
      if (src && !src.startsWith("http")) {
        $(this).attr("src", urlModule.resolve(targetUrl, src));
      }
    });

    $("link, script").each(function () {
      const attr = $(this).is("link") ? "href" : "src";
      const val = $(this).attr(attr);
      if (val && !val.startsWith("http")) {
        $(this).attr(attr, urlModule.resolve(targetUrl, val));
      }
    });

    // テキストノードを <span> でラップ
    function wrapTextNodes(node) {
      node.contents().each(function () {
        if (this.type === 'text' && this.data.trim() !== '') {
          const wrapped = this.data.replace(/\b([a-zA-Z]{2,})\b/g,
            '<span class="highlight-word" style="cursor:pointer;">$1</span>'
          );
          $(this).replaceWith(wrapped);
        } else if (this.type === 'tag') {
          wrapTextNodes($(this));
        }
      });
    }

    wrapTextNodes($("body"));

    // 古いタグや特殊タグのCSS補正
    $("center").css("display", "block").css("text-align", "center");
    $("pre").css("white-space", "pre-wrap").css("font-family", "monospace");

    // 下部フォーム追加
    $("body").append(formHTML);

    // タップ翻訳ポップアップ JS
    $("body").append(`
<div id="dict-popup" style="
  position: fixed;
  bottom: 60px;
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
  display: none;
"></div>

<script>
async function lookup(word){
  try {
    const res = await fetch("/translate?word=" + encodeURIComponent(word));
    const data = await res.json();
    const popup = document.getElementById("dict-popup");
    popup.innerText = word + " → " + data.translated;
    popup.style.display = "block";
    setTimeout(()=>popup.style.display="none",5000);
  } catch(e){console.error(e);}
}

document.addEventListener("click",(e)=>{
  if(e.target.classList.contains("highlight-word")) lookup(e.target.innerText);
});
</script>
`);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send(formHTML + "<p style='color:red;'>ページを取得できませんでした</p>");
  }
});

// 翻訳 API
app.get("/translate", async (req,res)=>{
  const word = req.query.word;
  if(!word) return res.json({translated:""});
  if(!translate) return res.json({translated:"翻訳機能無効"});
  try{
    const [translation] = await translate.translate(word,"ja");
    res.json({translated:translation});
  }catch(err){
    console.error(err);
    res.json({translated:"翻訳エラー"});
  }
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
