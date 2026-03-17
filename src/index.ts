import { Hono } from 'hono';
import type { Env } from './config';
import type { TelegramUpdate } from './types/telegram';
import { handleWebhook } from './handlers/webhook';

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Telegram webhook
app.post('/webhook/telegram', async (c) => {
  try {
    const update = (await c.req.json()) as TelegramUpdate;
    await handleWebhook(update, c.env);
    return c.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    // Always return 200 to Telegram to avoid retries
    return c.json({ ok: true });
  }
});

// Setup webhook (convenience endpoint)
app.post('/setup-webhook', async (c) => {
  const env = c.env;
  const webhookUrl = `${env.APP_BASE_URL}/webhook/telegram`;
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    },
  );
  const data = await res.json();
  return c.json(data);
});

// Delete webhook (utility endpoint)
app.post('/delete-webhook', async (c) => {
  const env = c.env;
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  const data = await res.json();
  return c.json(data);
});

export default app;
