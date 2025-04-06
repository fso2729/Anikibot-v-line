require('dotenv').config();
const OpenAI = require('openai');

console.log('SECRET:', process.env.LINE_CHANNEL_SECRET);
console.log('TOKEN:', process.env.LINE_CHANNEL_ACCESS_TOKEN);
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new Client(config);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const app = express();

const conversationHistory = new Map(); // Added conversation history

// Webhookエンドポイント
app.post('/webhook', middleware(config), (req, res) => {
  console.log('📩 Webhook受信:', JSON.stringify(req.body.events, null, 2));

  Promise.all(req.body.events.map(handleEvent))
    .then(result => {
      console.log('✅ 応答送信成功');
      res.json(result);
    })
    .catch(err => {
      console.error('❌ 応答送信エラー:', err);
      res.status(500).end();
    });
});

// 追加：LINE公式の推奨に沿って URLエンコードされたデータも受け取れるようにする（ミドルウェアの後に記述）
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId; // Added userId
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  const history = conversationHistory.get(userId);

  // 最新の発言を履歴に追加（最大10件に制限）
  history.push({ role: 'user', content: event.message.text });
  if (history.length > 10) history.shift();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'お前はめっちゃ陽気で面白い関西人のAIアシスタントや。語尾にはバリバリの関西弁を使うんやで。ユーザーには親しみやすく、ツッコミとかボケも交えて喋るんや。' },
        ...history // Updated messages array
      ],
      max_tokens: 2000,
      temperature: 0.8
    });

    const gptReply = completion.choices?.[0]?.message?.content ?? 'すまん兄貴、なんかよう分からんわ…';
    history.push({ role: 'assistant', content: gptReply }); // Added assistant reply to history
    if (history.length > 10) history.shift(); // Maintain history limit
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: gptReply
    });
  } catch (error) {
    console.error('❌ GPT応答エラー:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'すまん兄貴、ちょっと調子悪いみたいやわ。'
    });
  }
}

app.listen(3000, () => {
  console.log('LINE bot running on http://localhost:3000');
});