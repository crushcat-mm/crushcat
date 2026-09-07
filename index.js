const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
const line = require("@line/bot-sdk");
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const MODEL_NAME = process.env.AI_MODEL || "agnes-2.5-flash";

// AI 客戶端
const aiClient = new OpenAI({
  apiKey: process.env.AGNES_API_KEY,
  baseURL: process.env.AGNES_API_BASE || "https://apihub.agnes-ai.com/v1"
});

// LINE 設定，環境變數讀取
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const ADMIN_USER_LIST = [
  "Ubd8313c23ee1aaf9f794042649c176fe",
  "Ua25feb59dc428d5bdb78f0d44192dcd3"
];

function getLineClient() {
  return new line.messagingApi.MessagingApiClient({
    channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN
  });
}

// 健康檢查
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "萌爪貓坊 AI 客服代理",
    model: MODEL_NAME,
    timestamp: new Date().toISOString()
  });
});

// ✅ 新增：表單提交接口 給官網尋貓表單呼叫
app.post("/api/submit-form", async (req, res) => {
  try {
    const payload = req.body;
    // 簡單欄位檢查
    if (!payload.name) {
      return res.status(400).json({ ok: false, error: "稱呼不能空白" });
    }

    // 組成LINE通知文字格式，跟你之前收到的樣式一致
    const notifyText = `🐱 新的尋貓需求！
⏰ ${new Date().toLocaleString("zh-TW")}

👤 稱呼：${payload.name || ""}
📍 地區：${payload.region || ""}
📞 電話：${payload.phone || ""}

💰 預算：${payload.budget || ""}
🐾 品種：${payload.breed || ""}
🎨 花色：${payload.color || ""}
⚧ 性別：${payload.gender || ""}

📝 備註：
${payload.note || "無"}

---
請盡快與客戶聯繫！`;

    // 推播給全部管理員
    const lineClient = getLineClient();
    const sendResults = await Promise.allSettled(
      ADMIN_USER_LIST.map(adminUid =>
        lineClient.pushMessage({
          to: adminUid,
          messages: [{ type: "text", text: notifyText.slice(0,4900) }]
        })
      )
    );

    const anySuccess = sendResults.some(r => r.status === "fulfilled");
    if (!anySuccess) {
      console.error("全部管理員LINE推播全部失敗", sendResults);
      return res.status(500).json({ ok: false, error: "LINE通知發送失敗" });
    }

    res.json({ ok: true, msg: "表單已接收，已通知管理員" });

  } catch(err) {
    console.error("submit-form 錯誤:", err);
    res.status(500).json({ ok: false, error: "伺服器處理表單失敗" });
  }
});

// 一般聊天對話
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, temperature, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages 參數錯誤" });
    }
    const response = await aiClient.chat.completions.create({
      model: MODEL_NAME,
      messages: messages,
      temperature: temperature ?? 0.3,
      max_tokens: max_tokens || 1024
    });
    res.json(response);
  } catch (error) {
    console.error("聊天代理錯誤：", error.message);
    res.status(500).json({
      error: "AI 服務暫時無法回應，請稍後再試",
      details: error.message
    });
  }
});

// 貓咪品種辨識
app.post("/api/breed-identify", async (req, res) => {
  try {
    const { imageUrl, userDescription } = req.body;
    if (!imageUrl && !userDescription) {
      return res.status(400).json({ error: "需要提供圖片 URL 或特徵描述" });
    }
    const systemPrompt = `你是萌爪貓坊的專業貓咪品種鑑定師。
請根據使用者提供的資訊，辨識貓咪品種，並提供以下資訊：
1. 最可能的品種（前三名，含信心百分比）
2. 品種特徵分析
3. 個性與飼養建議
4. 適合的飼主類型
5. 參考價格區間（以萌爪貓坊歷史成交經驗）
請使用繁體中文回答，格式清晰，專業但親切。
如果資訊不足，請明確說明需要哪些資訊才能更準確判斷。`;
    const userMessage = imageUrl
      ? `請辨識這張圖片中的貓咪品種：${imageUrl}${userDescription ? `\n\n補充描述：${userDescription}` : ""}`
      : `請根據以下特徵描述辨識貓咪品種：${userDescription}`;
    const response = await aiClient.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });
    res.json(response);
  } catch (error) {
    console.error("品種辨識錯誤：", error.message);
    res.status(500).json({
      error: "品種辨識服務暫時無法回應",
      details: error.message
    });
  }
});

app.get("/", (_req, res) => {
  res.status(200).send("萌爪貓坊 AI 客服代理服務運行中");
});

app.listen(PORT, () => {
  console.log(`AI 客服代理已啟動，運行端口：${PORT}`);
});
