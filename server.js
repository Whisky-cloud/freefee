const express = require("express");
const {Translate} = require("@google-cloud/translate").v2;

const app = express();
const PORT = process.env.PORT || 3000;

// Google Translate API
const projectId = process.env.GOOGLE_PROJECT_ID;
const translate = new Translate({
  projectId,
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS)
});

// 単語翻訳 API
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
