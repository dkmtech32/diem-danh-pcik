import { TelegramService } from '../services/telegram-service';
import { MemberRepo } from '../repositories/member-repo';

/**
 * Check if a user is an admin or creator of the chat.
 * Multi-layered approach:
 *   1. Try Telegram getChatMember API
 *   2. If API fails, fall back to our DB group_members table
 *   3. If admin confirmed via API, persist to DB for future fallback
 */
export async function isGroupAdmin(
  telegram: TelegramService,
  chatId: number | string,
  userId: number,
  db?: D1Database,
  groupId?: number,
  memberId?: number,
): Promise<boolean> {
  // Try Telegram API first
  const chatMember = await telegram.getChatMember(chatId, userId);
  if (chatMember) {
    const isAdmin = chatMember.status === 'creator' || chatMember.status === 'administrator';

    // Persist admin status to DB if confirmed and DB context available
    if (isAdmin && db && groupId && memberId) {
      try {
        const memberRepo = new MemberRepo(db);
        await memberRepo.upsertGroupMember(groupId, memberId, 'admin');
      } catch {
        // Ignore DB errors for persistence
      }
    }

    return isAdmin;
  }

  // Telegram API failed — fall back to DB
  if (db && groupId && memberId) {
    try {
      const memberRepo = new MemberRepo(db);
      const gm = await memberRepo.getGroupMember(groupId, memberId);
      if (gm && gm.role === 'admin') {
        return true;
      }
    } catch {
      // Ignore DB errors
    }
  }

  // Last resort: try getChatAdministrators (works even when getChatMember fails)
  const admins = await telegram.getChatAdministrators(chatId);
  if (admins) {
    const isAdmin = admins.some((a) => a.user.id === userId);
    // Persist if found
    if (isAdmin && db && groupId && memberId) {
      try {
        const memberRepo = new MemberRepo(db);
        await memberRepo.upsertGroupMember(groupId, memberId, 'admin');
      } catch {
        // Ignore
      }
    }
    return isAdmin;
  }

  return false;
}
