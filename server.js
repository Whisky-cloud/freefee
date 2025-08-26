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

app.use(express.urlencoded({ extended: true }));

// UI HTML（完成版2）
const uiHTML = `
<div style="position: fixed; bottom:10px; left:50%; transform:translateX(-50%); z-index:9999; text-align:center;">
  <input type="url" id="urlInput" placeholder="英語サイトURL" style="width:50%; height:80px; font-size:32px; padding:16px;">
  <button id="openBtn" style="height:80px; font-size:32px; padding:0 24px;">開く</button>
  <input type="range" id="fontSlider" min="10" max="60" value="30" style="width:200px; accent-color:#654321; height:40px; margin-left:20px;">
</div>

<script>
const urlInput = document.getElementById("urlInput");
const openBtn = document.getElementById("openBtn");
const fontSlider = document.getElementById("fontSlider");

openBtn.onclick = () => {
  if(urlInput.value) {
    window.location.href = "/proxy?url=" + encodeURIComponent(urlInput.value) + "&fontsize=" + fontSlider.value;
  }
};
</script>
`;

// ページ取得＋翻訳＋ツールチップ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  const fontSize = req.query.fontsize || 30;

  if (!targetUrl) return res.send(uiHTML);

  try {
    const response = await axios.get(targetUrl);
    const $ = cheerio.load(response.data);

    // フォントサイズを全体に設定
    $("body").css("font-size", fontSize + "px");

    // テキストノードを <span> でラップ
    function wrapTextNodes(element) {
      element.contents().each(function () {
        if(this.type === "text" && this.data.trim() !== "") {
          const span = $("<span>").addClass("translatable").text(this.data).css("cursor","pointer");
          $(this).replaceWith(span);
        } else if(this.type === "tag") {
          wrapTextNodes($(this));
        }
      });
    }
    wrapTextNodes($("body"));

    // 翻訳用 JS を追加
    $("body").append(`
<script>
const translate = async (text) => {
  const res = await fetch("/translate?text=" + encodeURIComponent(text));
  const data = await res.json();
  return data.translation;
};

document.querySelectorAll(".translatable").forEach(el => {
  el.addEventListener("click", async (e) => {
    const existingTip = document.getElementById("tooltip");
    if(existingTip) existingTip.remove();

    const tooltip = document.createElement("div");
    tooltip.id = "tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.background = "#ffffcc";
    tooltip.style.border = "1px solid #333";
    tooltip.style.padding = "8px";
    tooltip.style.zIndex = 9999;
    tooltip.style.maxWidth = "300px";
    tooltip.style.fontSize = "18px";

    tooltip.innerText = "翻訳中...";
    document.body.appendChild(tooltip);

    const rect = el.getBoundingClientRect();
    tooltip.style.left = rect.left + window.scrollX + "px";
    tooltip.style.top = rect.bottom + window.scrollY + 5 + "px";

    const translation = await translate(el.innerText);
    tooltip.innerText = translation;

    setTimeout(()=>{ tooltip.remove(); }, 5000);
  });
});
</script>
    `);

    // 元のUIを挿入
    $("body").prepend(uiHTML);

    res.send($.html());
  } catch (err) {
    console.error(err);
    res.status(500).send("エラーが発生しました");
  }
});

// 翻訳API用エンドポイント
app.get("/translate", async (req, res) => {
  const text = req.query.text;
  if(!text) return res.json({translation:""});

  try {
    const [translation] = await translate.translate(text, "ja");
    res.json({translation});
  } catch (err) {
    console.error(err);
    res.json({translation:"翻訳エラー"});
  }
});

app.listen(PORT, ()=>console.log(\`サーバー起動 ${PORT}\`));
