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
      'Tôi sinh ra để lo mấy việc lặt vặt cho team pickleball: điểm danh, chia tiền sân, coi ai còn nợ tiền...\n' +
      'Nói chung là làm mấy việc mà mọi người hay quên 😏\n\n' +
      'Lệnh có thể dùng:\n' +
      '/session — Tạo kèo pickleball mới\n' +
      '/sessions — Xem lại mấy kèo gần đây\n' +
      '/help — Xem hướng dẫn (nếu vẫn còn mù mờ)',
  );
}

async function handleHelp(message: TelegramMessage, telegram: TelegramService): Promise<void> {
  await telegram.sendMessage(
    message.chat.id,
    '📖 <b>Hướng dẫn xài bot (đọc đi rồi hỏi sau)</b>\n\n' +
      '<b>Tạo kèo chơi:</b>\n' +
      '<code>/session Tiêu đề | Ngày/Giờ | Địa điểm | Dự kiến tiền</code>\n' +
      'Ví dụ: <code>/session Pickleball tối thứ 6 | 7:00 PM | Sân A | 120000</code>\n\n' +
      '<b>Luồng hoạt động:</b>\n' +
      '1️⃣ Admin tạo kèo bằng /session\n' +
      '2️⃣ Mọi người bấm <b>Đi luôn</b> / <b>Để coi đã</b> / <b>Nghỉ kèo</b> để báo tình hình\n' +
      '3️⃣ Admin chốt danh sách bằng nút <b>Chốt danh sách</b>\n' +
      '4️⃣ Admin bấm <b>Chia tiền sân</b> rồi nhập tổng tiền sân\n' +
      '5️⃣ Ai trả tiền rồi thì bấm <b>Đã trả</b>\n' +
      '6️⃣ Admin bấm <b>Chốt sổ kèo này</b> để kết sổ\n\n' +
      '<b>Xem lại các kèo gần đây:</b>\n' +
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
    await telegram.sendMessage(message.chat.id, '⚠️ Chỉ admin mới được tạo kèo.');
    return;
  }

  // Parse: Title | Date/Time | Location | Cost
  const parts = args.split('|').map((p) => p.trim());
  const title = parts[0] || '';
  if (!title) {
    await telegram.sendMessage(
      message.chat.id,
      '⚠️ Vui lòng cung cấp tiêu đề kèo.\n\nUsage: <code>/session Tiêu đề | Ngày/Giờ | Địa điểm | Dự kiến tiền</code>',
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
