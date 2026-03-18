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

export default {
  fetch: app.fetch,
  scheduled: async (event: any, env: Env, ctx: any) => {
    try {
      const { GroupRepo } = await import('./repositories/group-repo');
      const { SplitRepo } = await import('./repositories/split-repo');
      const { PaymentService } = await import('./services/payment-service');
      const { TelegramService } = await import('./services/telegram-service');

      const groupRepo = new GroupRepo(env.DB);
      const splitRepo = new SplitRepo(env.DB);
      const paymentService = new PaymentService(splitRepo);
      const telegram = new TelegramService(env.TELEGRAM_BOT_TOKEN);

      const groups = await groupRepo.listAll();
      
      for (const group of groups) {
        try {
          const text = await paymentService.getUnpaidSummaryMessage(group.id);
          // Only send message if there are people who owe money
          if (text) {
            await telegram.sendMessage(group.telegram_chat_id, text);
          }
        } catch (err) {
          console.error(`Failed to send unpaid reminder for group ${group.id}:`, err);
        }
      }
    } catch (err) {
      console.error('Scheduled task error:', err);
    }
  },
};
