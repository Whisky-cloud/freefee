const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

console.log("GOOGLE_PROJECT_ID:", process.env.GOOGLE_PROJECT_ID ? "OK" : "NOT SET");
console.log("GOOGLE_CREDENTIALS:", process.env.GOOGLE_CREDENTIALS ? "OK" : "NOT SET");

app.get("/", (req, res) => res.send("Hello World"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
