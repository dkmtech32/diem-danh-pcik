import type { Env } from '../config';
import type { TelegramMessage } from '../types/telegram';
import type { Group, Member } from '../types/domain';
import { TelegramService } from '../services/telegram-service';
import { SessionService } from '../services/session-service';
import { RsvpService } from '../services/rsvp-service';
import { SessionRepo } from '../repositories/session-repo';
import { RsvpRepo } from '../repositories/rsvp-repo';
import { PlayerRepo } from '../repositories/player-repo';
import { isGroupAdmin } from '../utils/permissions';
import { buildSessionMessage, buildSessionListMessage } from '../utils/message-builders';
import { buildRsvpKeyboard } from '../utils/keyboards';
import { parseCost } from '../utils/money';

export async function handleCommand(
  message: TelegramMessage,
  command: string,
  args: string,
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
): Promise<void> {
  switch (command) {
    case '/start':
      await handleStart(message, telegram);
      break;
    case '/help':
      await handleHelp(message, telegram);
      break;
    case '/session':
      await handleSession(message, args, group, member, telegram, env);
      break;
    case '/sessions':
      await handleSessions(message, group, telegram, env);
      break;
    default:
      break;
  }
}

async function handleStart(message: TelegramMessage, telegram: TelegramService): Promise<void> {
  await telegram.sendMessage(
    message.chat.id,
    '🏓 <b>Pickleball Bot</b>\n\n' +
      'I help manage pickleball sessions, attendance, bill splitting, and payment tracking.\n\n' +
      'Commands:\n' +
      '/session — Create a new session\n' +
      '/sessions — View recent sessions\n' +
      '/help — Show help',
  );
}

async function handleHelp(message: TelegramMessage, telegram: TelegramService): Promise<void> {
  await telegram.sendMessage(
    message.chat.id,
    '📖 <b>How to use</b>\n\n' +
      '<b>Create a session:</b>\n' +
      '<code>/session Title | Date/Time | Location | EstimatedCost</code>\n' +
      'Example: <code>/session Friday Pickleball | 7:00 PM | Court A | 120000</code>\n\n' +
      '<b>Workflow:</b>\n' +
      '1️⃣ Admin creates session with /session\n' +
      '2️⃣ Members tap Join / Maybe / Skip\n' +
      '3️⃣ Admin taps Finalize Attendance\n' +
      '4️⃣ Admin taps Split Bill and enters total cost\n' +
      '5️⃣ Members tap Mark Paid\n' +
      '6️⃣ Admin taps Close Session\n\n' +
      '<b>View recent sessions:</b>\n' +
      '/sessions',
  );
}

async function handleSession(
  message: TelegramMessage,
  args: string,
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
): Promise<void> {
  // Check admin
  const admin = await isGroupAdmin(telegram, message.chat.id, message.from!.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.sendMessage(message.chat.id, '⚠️ Only group admins can create sessions.');
    return;
  }

  // Parse: Title | Date/Time | Location | Cost
  const parts = args.split('|').map((p) => p.trim());
  const title = parts[0] || '';
  if (!title) {
    await telegram.sendMessage(
      message.chat.id,
      '⚠️ Please provide a session title.\n\nUsage: <code>/session Title | Date/Time | Location | Cost</code>',
    );
    return;
  }

  const scheduledAt = parts[1] || null;
  const location = parts[2] || null;
  const estimatedCost = parts[3] ? parseCost(parts[3]) : null;

  const sessionRepo = new SessionRepo(env.DB);
  const rsvpRepo = new RsvpRepo(env.DB);
  const playerRepo = new PlayerRepo(env.DB);
  const sessionService = new SessionService(sessionRepo, rsvpRepo, playerRepo);

  const session = await sessionService.create(group.id, title, member.id, scheduledAt, location, estimatedCost);

  const counts = { join: 0, maybe: 0, skip: 0 };
  const text = buildSessionMessage(session, counts);
  const keyboard = buildRsvpKeyboard(session.id);

  const sent = await telegram.sendMessage(message.chat.id, text, keyboard);
  if (sent) {
    await sessionService.setTelegramMessageId(session.id, String(sent.message_id));
  }
}

async function handleSessions(
  message: TelegramMessage,
  group: Group,
  telegram: TelegramService,
  env: Env,
): Promise<void> {
  const sessionRepo = new SessionRepo(env.DB);
  const rsvpRepo = new RsvpRepo(env.DB);
  const playerRepo = new PlayerRepo(env.DB);
  const sessionService = new SessionService(sessionRepo, rsvpRepo, playerRepo);

  const sessions = await sessionService.listByGroup(group.id, 10);
  const text = buildSessionListMessage(sessions);
  await telegram.sendMessage(message.chat.id, text);
}
