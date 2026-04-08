import express from 'express';
import OpenAI from 'openai';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Convert Anthropic content blocks to OpenAI format
function convertContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content;
  return content.map(block => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'image' && block.source?.type === 'base64') {
      return {
        type: 'image_url',
        image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
      };
    }
    return block;
  });
}

app.post('/api/chat', async (req, res) => {
  try {
    const { system, messages, max_tokens } = req.body;

    // Build OpenAI messages
    const oaiMessages = [];
    if (system) oaiMessages.push({ role: 'system', content: system });
    for (const msg of (messages || [])) {
      oaiMessages.push({ role: msg.role, content: convertContent(msg.content) });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const stream = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: oaiMessages,
      max_tokens: max_tokens || 1024,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        const evt = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }
    }
    res.end();
  } catch (err) {
    console.error('API error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Captain Woolly ready on port ${PORT}`));
