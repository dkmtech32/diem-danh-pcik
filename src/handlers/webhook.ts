import type { Env } from '../config';
import type { TelegramUpdate } from '../types/telegram';
import { TelegramService } from '../services/telegram-service';
import { GroupService } from '../services/group-service';
import { GroupRepo } from '../repositories/group-repo';
import { MemberRepo } from '../repositories/member-repo';
import { handleCommand } from './commands';
import { handleCallback, handlePendingSplitInput, handlePendingAddGuestInput } from './callbacks';

export async function handleWebhook(update: TelegramUpdate, env: Env): Promise<void> {
  const telegram = new TelegramService(env.TELEGRAM_BOT_TOKEN);

  // Handle callback queries (inline button presses)
  if (update.callback_query) {
    const query = update.callback_query;
    const chat = query.message?.chat;
    const user = query.from;

    if (!chat || chat.type === 'private') {
      await telegram.answerCallbackQuery(query.id, 'This bot works in group chats only.');
      return;
    }

    // Ensure group and member exist
    const groupRepo = new GroupRepo(env.DB);
    const memberRepo = new MemberRepo(env.DB);
    const groupService = new GroupService(groupRepo, memberRepo);
    const { group, member } = await groupService.ensureGroupAndMember(chat, user);

    await handleCallback(query, group, member, telegram, env);
    return;
  }

  // Handle messages
  if (update.message) {
    const message = update.message;
    const chat = message.chat;
    const user = message.from;

    if (!user || user.is_bot) return;

    // Only work in groups
    if (chat.type === 'private') {
      await telegram.sendMessage(
        chat.id,
        '🏓 Please add me to a group chat to get started!\n\nI manage pickleball sessions, attendance, and bill splitting for groups.',
      );
      return;
    }

    // Ensure group and member exist
    const groupRepo = new GroupRepo(env.DB);
    const memberRepo = new MemberRepo(env.DB);
    const groupService = new GroupService(groupRepo, memberRepo);
    const { group, member } = await groupService.ensureGroupAndMember(chat, user);

    // Check if this is a pending split cost input
    if (message.text) {
      const handled = await handlePendingSplitInput(
        chat.id,
        user.id,
        message.text,
        member,
        telegram,
        env,
      );
      if (handled) return;

      const handledGuest = await handlePendingAddGuestInput(
        chat.id,
        user.id,
        message.text,
        member,
        telegram,
        env,
        group,
      );
      if (handledGuest) return;
    }

    // Check for bot commands
    if (message.text && message.entities) {
      for (const entity of message.entities) {
        if (entity.type === 'bot_command' && entity.offset === 0) {
          const fullCommand = message.text.substring(entity.offset, entity.offset + entity.length);
          // Strip @botname suffix if present
          const command = fullCommand.split('@')[0];
          const args = message.text.substring(entity.offset + entity.length).trim();
          await handleCommand(message, command, args, group, member, telegram, env);
          return;
        }
      }
    }
  }
}
