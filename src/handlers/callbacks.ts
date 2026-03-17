import type { Env } from '../config';
import type { TelegramCallbackQuery } from '../types/telegram';
import type { Group, Member, Session } from '../types/domain';
import { TelegramService } from '../services/telegram-service';
import { SessionService } from '../services/session-service';
import { RsvpService } from '../services/rsvp-service';
import { SplitService } from '../services/split-service';
import { PaymentService } from '../services/payment-service';
import { SessionRepo } from '../repositories/session-repo';
import { RsvpRepo } from '../repositories/rsvp-repo';
import { PlayerRepo } from '../repositories/player-repo';
import { SplitRepo } from '../repositories/split-repo';
import { MemberRepo } from '../repositories/member-repo';
import { EphemeralMessageRepo } from '../repositories/ephemeral-message-repo';
import { isGroupAdmin } from '../utils/permissions';
import {
  buildSessionMessage,
  buildPlayersListMessage,
  buildFinalizedMessage,
  buildSplitMessage,
  buildUnpaidMessage,
  buildMyStatusAlert,
  buildClosedMessage,
  buildFinalizeSelectionMessage,
  escapeHtml,
} from '../utils/message-builders';
import {
  buildRsvpKeyboard,
  buildFinalizedKeyboard,
  buildSplitKeyboard,
  buildClosedKeyboard,
  buildFinalizeSelectionKeyboard,
  buildDismissKeyboard,
} from '../utils/keyboards';
import { parseCost } from '../utils/money';

// State for pending bill split cost input (in-memory, per worker instance)
const pendingSplitCost = new Map<string, number>(); // `chatId:userId` -> sessionId

export function setPendingSplit(chatId: number | string, userId: number, sessionId: number): void {
  pendingSplitCost.set(`${chatId}:${userId}`, sessionId);
}

export function getPendingSplit(chatId: number | string, userId: number): number | undefined {
  return pendingSplitCost.get(`${chatId}:${userId}`);
}

export function clearPendingSplit(chatId: number | string, userId: number): void {
  pendingSplitCost.delete(`${chatId}:${userId}`);
}

function buildServices(env: Env) {
  const sessionRepo = new SessionRepo(env.DB);
  const rsvpRepo = new RsvpRepo(env.DB);
  const playerRepo = new PlayerRepo(env.DB);
  const splitRepo = new SplitRepo(env.DB);

  return {
    sessionService: new SessionService(sessionRepo, rsvpRepo, playerRepo),
    rsvpService: new RsvpService(rsvpRepo),
    splitService: new SplitService(sessionRepo, playerRepo, splitRepo),
    paymentService: new PaymentService(splitRepo),
    playerRepo,
  };
}

export async function handleCallback(
  query: TelegramCallbackQuery,
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
): Promise<void> {
  const data = query.data;
  if (!data) {
    await telegram.answerCallbackQuery(query.id);
    return;
  }

  const chatId = query.message?.chat.id;
  if (!chatId) {
    await telegram.answerCallbackQuery(query.id, 'Error: no chat context.');
    return;
  }

  // Parse callback data
  const parts = data.split(':');
  const action = parts[0];

  try {
    switch (action) {
      case 'd': // Dismiss: d
        if (query.message?.message_id) {
          await telegram.deleteMessage(chatId, query.message.message_id);
        }
        await telegram.answerCallbackQuery(query.id);
        break;
      case 'r': // RSVP: r:j:sessionId, r:m:sessionId, r:s:sessionId
        await handleRsvpCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'v': // View: v:p:sessionId
        await handleViewPlayersCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'f': // Finalize: f:sessionId (show selection UI)
        await handleFinalizeCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'ft': // Finalize toggle: ft:sessionId:memberId
        await handleFinalizeToggleCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'fc': // Finalize confirm: fc:sessionId
        await handleFinalizeConfirmCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'fx': // Finalize cancel: fx:sessionId
        await handleFinalizeCancelCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'sb': // Split bill: sb:sessionId
        await handleSplitBillCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'mp': // Mark paid: mp:sessionId
        await handleMarkPaidCallback(query, parts, member, telegram, env, chatId);
        break;
      case 'ms': // My status: ms:sessionId
        await handleMyStatusCallback(query, parts, member, telegram, env, chatId);
        break;
      case 'vu': // View unpaid: vu:sessionId
        await handleViewUnpaidCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'rf': // Refresh: rf:sessionId
        await handleRefreshCallback(query, parts, group, telegram, env, chatId);
        break;
      case 'cl': // Close: cl:sessionId
        await handleCloseCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'cx': // Cancel: cx:sessionId
        await handleCancelSessionCallback(query, parts, group, member, telegram, env, chatId);
        break;
      case 'sbc': // Split bill confirm with amount: sbc:sessionId:amount
        await handleSplitBillConfirmCallback(query, parts, group, member, telegram, env, chatId);
        break;
      default:
        await telegram.answerCallbackQuery(query.id, 'Unknown action.');
    }
  } catch (err) {
    console.error('Callback error:', err);
    await telegram.answerCallbackQuery(query.id, 'An error occurred. Please try again.');
  }
}

async function getSessionOrError(
  sessionId: number,
  query: TelegramCallbackQuery,
  telegram: TelegramService,
  env: Env,
): Promise<Session | null> {
  const { sessionService } = buildServices(env);
  const session = await sessionService.getById(sessionId);
  if (!session) {
    await telegram.answerCallbackQuery(query.id, 'Session not found.', true);
    return null;
  }
  return session;
}

// ==================== RSVP ====================
async function handleRsvpCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const statusMap: Record<string, 'join' | 'maybe' | 'skip'> = { j: 'join', m: 'maybe', s: 'skip' };
  const status = statusMap[parts[1]];
  const sessionId = parseInt(parts[2], 10);

  if (!status || isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  if (session.status !== 'open') {
    await telegram.answerCallbackQuery(query.id, 'This session is no longer accepting RSVPs.', true);
    return;
  }

  const { rsvpService } = buildServices(env);
  await rsvpService.upsert(sessionId, member.id, status);

  const statusLabel = status === 'join' ? 'Joining' : status === 'maybe' ? 'Maybe' : 'Skipping';
  await telegram.answerCallbackQuery(query.id, `✅ You are now: ${statusLabel}`);

  // Update the session message
  const counts = await rsvpService.countBySession(sessionId);
  const text = buildSessionMessage(session, counts);
  const keyboard = buildRsvpKeyboard(sessionId);

  if (session.telegram_message_id) {
    await telegram.editMessageText(chatId, session.telegram_message_id, text, keyboard);
  }
}

// ==================== View Players (admin only) ====================
async function handleViewPlayersCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[2], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Only admins can view the player list.', true);
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  const { rsvpService } = buildServices(env);
  const rsvps = await rsvpService.listBySession(sessionId);
  const text = buildPlayersListMessage(session, rsvps);

  await telegram.answerCallbackQuery(query.id);
  // Try to send as DM (private); fall back to group message with dismiss button
  const dmSent = await telegram.sendMessage(query.from.id, text);
  if (!dmSent) {
    const ephRepo = new EphemeralMessageRepo(env.DB);
    const typeKey = `view_players_${sessionId}`;

    // Delete any previous group messages of this type
    const previous = await ephRepo.getByType(chatId, typeKey);
    const deletedIds: number[] = [];
    for (const msg of previous) {
      await telegram.deleteMessage(chatId, msg.message_id);
      deletedIds.push(msg.id);
    }
    await ephRepo.deleteRecords(deletedIds);

    // Send new message and save its ID
    const sentMsg = await telegram.sendMessage(chatId, text, buildDismissKeyboard());
    if (sentMsg) {
      await ephRepo.save(chatId, sentMsg.message_id, typeKey);
    }
  }
}

// ==================== Finalize (show selection UI) ====================
async function handleFinalizeCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Only admins can finalize attendance.', true);
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  if (session.status !== 'open') {
    await telegram.answerCallbackQuery(query.id, 'This session is already finalized or closed.', true);
    return;
  }

  // Get all group members and current RSVPs
  const memberRepo = new MemberRepo(env.DB);
  const rsvpRepo = new RsvpRepo(env.DB);
  const allMembers = await memberRepo.listGroupMembers(group.id);
  const rsvps = await rsvpRepo.listBySession(sessionId);
  const joinMemberIds = new Set(rsvps.filter((r) => r.rsvp_status === 'join').map((r) => r.member_id));

  // Build selection: pre-select 'join' RSVPs, exclude bots
  const selectionMembers = allMembers
    .filter((m) => !m.telegram_user_id.startsWith('bot')) // exclude bot accounts
    .map((m) => ({
      id: m.id,
      name: m.display_name || m.first_name || m.username || 'Unknown',
      selected: joinMemberIds.has(m.id),
    }));

  if (selectionMembers.length === 0) {
    await telegram.answerCallbackQuery(query.id, 'No members found in this group.', true);
    return;
  }

  const selectedCount = selectionMembers.filter((m) => m.selected).length;
  const text = buildFinalizeSelectionMessage(session, selectedCount, selectionMembers.length);
  const keyboard = buildFinalizeSelectionKeyboard(sessionId, selectionMembers);

  await telegram.answerCallbackQuery(query.id);
  await telegram.sendMessage(chatId, text, keyboard);
}

// ==================== Finalize Toggle ====================
async function handleFinalizeToggleCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  const toggleMemberId = parseInt(parts[2], 10);
  if (isNaN(sessionId) || isNaN(toggleMemberId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Only admins can do this.', true);
    return;
  }

  // Toggle the member's RSVP: join ↔ skip
  const rsvpRepo = new RsvpRepo(env.DB);
  const existing = await rsvpRepo.getBySessionAndMember(sessionId, toggleMemberId);
  const newStatus = existing?.rsvp_status === 'join' ? 'skip' : 'join';
  await rsvpRepo.upsert(sessionId, toggleMemberId, newStatus, 'admin');

  // Rebuild the selection UI
  const memberRepo = new MemberRepo(env.DB);
  const allMembers = await memberRepo.listGroupMembers(group.id);
  const rsvps = await rsvpRepo.listBySession(sessionId);
  const joinMemberIds = new Set(rsvps.filter((r) => r.rsvp_status === 'join').map((r) => r.member_id));

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  const selectionMembers = allMembers
    .filter((m) => !m.telegram_user_id.startsWith('bot'))
    .map((m) => ({
      id: m.id,
      name: m.display_name || m.first_name || m.username || 'Unknown',
      selected: joinMemberIds.has(m.id),
    }));

  const selectedCount = selectionMembers.filter((m) => m.selected).length;
  const text = buildFinalizeSelectionMessage(session, selectedCount, selectionMembers.length);
  const keyboard = buildFinalizeSelectionKeyboard(sessionId, selectionMembers);

  await telegram.answerCallbackQuery(query.id);
  // Edit the selection message in place
  const msgId = query.message?.message_id;
  if (msgId) {
    await telegram.editMessageText(chatId, msgId, text, keyboard);
  }
}

// ==================== Finalize Confirm ====================
async function handleFinalizeConfirmCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Only admins can finalize.', true);
    return;
  }

  const services = buildServices(env);
  const session = await services.sessionService.getById(sessionId);
  if (!session) {
    await telegram.answerCallbackQuery(query.id, 'Session not found.', true);
    return;
  }

  const result = await services.sessionService.finalize(session);
  if (!result.success) {
    await telegram.answerCallbackQuery(query.id, result.error!, true);
    return;
  }

  await telegram.answerCallbackQuery(query.id, `✅ Finalized with ${result.playerCount} players!`);

  // Delete the selection message
  const msgId = query.message?.message_id;
  if (msgId) {
    await telegram.deleteMessage(chatId, msgId);
  }

  // Update the original session message to finalized state
  const players = await services.playerRepo.listBySession(sessionId);
  const text = buildFinalizedMessage(session, players);
  const keyboard = buildFinalizedKeyboard(sessionId);

  if (session.telegram_message_id) {
    await telegram.editMessageText(chatId, session.telegram_message_id, text, keyboard);
  }
}

// ==================== Finalize Cancel ====================
async function handleFinalizeCancelCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  await telegram.answerCallbackQuery(query.id, 'Finalization cancelled.');

  // Delete the selection message
  const msgId = query.message?.message_id;
  if (msgId) {
    await telegram.deleteMessage(chatId, msgId);
  }
}

// ==================== Split Bill ====================
async function handleSplitBillCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Only admins can split the bill.', true);
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  if (session.actual_cost) {
    await telegram.answerCallbackQuery(query.id, 'Bill has already been split for this session.', true);
    return;
  }

  // Store pending split and ask for amount
  setPendingSplit(chatId, query.from.id, sessionId);

  await telegram.answerCallbackQuery(query.id);
  // Send prompt with a dismiss button
  await telegram.sendMessage(
    chatId,
    '💰 <b>Enter the total bill amount</b>\n\n' +
      'Please reply with the total cost. Example:\n' +
      '<code>960000</code>\n' +
      '<code>960,000</code>',
    buildDismissKeyboard(),
  );
}

/**
 * Handle a text message that might be a bill amount reply.
 */
export async function handlePendingSplitInput(
  chatId: number,
  userId: number,
  text: string,
  member: Member,
  telegram: TelegramService,
  env: Env,
): Promise<boolean> {
  const sessionId = getPendingSplit(chatId, userId);
  if (sessionId === undefined) return false;

  clearPendingSplit(chatId, userId);

  const amount = parseCost(text);
  if (!amount || amount <= 0) {
    await telegram.sendMessage(chatId, '⚠️ Invalid amount. Please use /session again or tap Split Bill to retry.');
    return true;
  }

  const services = buildServices(env);
  const session = await services.sessionService.getById(sessionId);
  if (!session) {
    await telegram.sendMessage(chatId, '⚠️ Session not found.');
    return true;
  }

  const result = await services.splitService.createSplit(session, amount);
  if (!result.success) {
    await telegram.sendMessage(chatId, `⚠️ ${result.error}`);
    return true;
  }

  // Send split message
  const splits = await services.splitService.listBySession(sessionId);
  const counts = await services.splitService.countBySession(sessionId);
  const updatedSession = await services.sessionService.getById(sessionId);
  const text2 = buildSplitMessage(updatedSession!, splits, counts.total);
  const perPerson = splits.length > 0 ? splits[0].amount_due : undefined;
  const keyboard = buildSplitKeyboard(sessionId, perPerson, updatedSession?.title, env);

  const sent = await telegram.sendMessage(chatId, text2, keyboard);

  // Update the original session message reference if needed
  if (sent && updatedSession) {
    await services.sessionService.setTelegramMessageId(sessionId, String(sent.message_id));
  }

  return true;
}

// ==================== Split Bill Confirm (inline button with amount) ====================
async function handleSplitBillConfirmCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  // sbc:sessionId:amount
  const sessionId = parseInt(parts[1], 10);
  const amount = parseInt(parts[2], 10);
  if (isNaN(sessionId) || isNaN(amount)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  const services = buildServices(env);
  const session = await services.sessionService.getById(sessionId);
  if (!session) {
    await telegram.answerCallbackQuery(query.id, 'Session not found.', true);
    return;
  }

  const result = await services.splitService.createSplit(session, amount);
  if (!result.success) {
    await telegram.answerCallbackQuery(query.id, result.error!, true);
    return;
  }

  await telegram.answerCallbackQuery(query.id, '✅ Bill split created!');

  const splits = await services.splitService.listBySession(sessionId);
  const counts = await services.splitService.countBySession(sessionId);
  const updatedSession = await services.sessionService.getById(sessionId);
  const text = buildSplitMessage(updatedSession!, splits, counts.total);
  const perPerson = splits.length > 0 ? splits[0].amount_due : undefined;
  const keyboard = buildSplitKeyboard(sessionId, perPerson, updatedSession?.title, env);

  await telegram.sendMessage(chatId, text, keyboard);
}

// ==================== Mark Paid ====================
async function handleMarkPaidCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  if (session.status === 'closed') {
    await telegram.answerCallbackQuery(query.id, 'This session is already closed.', true);
    return;
  }

  const { paymentService } = buildServices(env);
  const result = await paymentService.markPaid(sessionId, member.id);

  if (!result.success) {
    await telegram.answerCallbackQuery(query.id, result.error!, true);
    return;
  }

  await telegram.answerCallbackQuery(query.id, '✅ Marked as paid!');

  // Refresh the split message
  await refreshSplitMessage(sessionId, session, chatId, query.from.id, telegram, env);
  
  // Also refresh any active "View Unpaid" messages in this chat
  await updateViewUnpaidMessages(sessionId, session, chatId, telegram, env);
}

// ==================== My Status ====================
async function handleMyStatusCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  const { paymentService } = buildServices(env);
  const split = await paymentService.getMyStatus(sessionId, member.id);
  // Use popup alert (private, only visible to the user who tapped)
  const alertText = buildMyStatusAlert(session, split);
  await telegram.answerCallbackQuery(query.id, alertText, true);
}

// ==================== View Unpaid (admin only) ====================
async function handleViewUnpaidCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Only admins can view unpaid players.', true);
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  const { paymentService } = buildServices(env);
  const unpaid = await paymentService.listUnpaid(sessionId);
  const text = buildUnpaidMessage(session, unpaid);

  await telegram.answerCallbackQuery(query.id);
  // Try DM first; fall back to group message with dismiss button
  const dmSent = await telegram.sendMessage(query.from.id, text);
  if (!dmSent) {
    const ephRepo = new EphemeralMessageRepo(env.DB);
    const typeKey = `view_unpaid_${sessionId}`;

    // Delete previous group messages of this type
    const previous = await ephRepo.getByType(chatId, typeKey);
    const deletedIds: number[] = [];
    for (const msg of previous) {
      await telegram.deleteMessage(chatId, msg.message_id);
      deletedIds.push(msg.id);
    }
    await ephRepo.deleteRecords(deletedIds);

    // Send new message and save its ID
    const sentMsg = await telegram.sendMessage(chatId, text, buildDismissKeyboard());
    if (sentMsg) {
      await ephRepo.save(chatId, sentMsg.message_id, typeKey);
    }
  }
}

// ==================== Refresh ====================
async function handleRefreshCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  const session = await getSessionOrError(sessionId, query, telegram, env);
  if (!session) return;

  await telegram.answerCallbackQuery(query.id, '🔄 Refreshed!');
  await refreshSplitMessage(sessionId, session, chatId, query.from.id, telegram, env);
}

// ==================== Cancel Session ====================
async function handleCancelSessionCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Chỉ admin mới được hủy kèo.', true);
    return;
  }

  const services = buildServices(env);
  const session = await services.sessionService.getById(sessionId);
  if (!session) {
    await telegram.answerCallbackQuery(query.id, 'Không tìm thấy kèo.', true);
    return;
  }

  // Close the session in DB (we use 'closed' status for both successful closures and cancellations)
  await services.sessionService.close(session);

  await telegram.answerCallbackQuery(query.id, '🚫 Đã hủy kèo!');

  const text = `🚫 <b>Kèo đã bị hủy bởi Admin</b>\n\n🏓 <b>${escapeHtml(session.title)}</b>`;
  const keyboard = buildClosedKeyboard();

  if (session.telegram_message_id) {
    await telegram.editMessageText(chatId, session.telegram_message_id, text, keyboard);
  } else {
    await telegram.sendMessage(chatId, text);
  }
}

// ==================== Close Session ====================
async function handleCloseCallback(
  query: TelegramCallbackQuery,
  parts: string[],
  group: Group,
  member: Member,
  telegram: TelegramService,
  env: Env,
  chatId: number,
): Promise<void> {
  const sessionId = parseInt(parts[1], 10);
  if (isNaN(sessionId)) {
    await telegram.answerCallbackQuery(query.id, 'Invalid action.');
    return;
  }

  // Admin check
  const admin = await isGroupAdmin(telegram, chatId, query.from.id, env.DB, group.id, member.id);
  if (!admin) {
    await telegram.answerCallbackQuery(query.id, 'Only admins can close sessions.', true);
    return;
  }

  const services = buildServices(env);
  const session = await services.sessionService.getById(sessionId);
  if (!session) {
    await telegram.answerCallbackQuery(query.id, 'Session not found.', true);
    return;
  }

  const result = await services.sessionService.close(session);
  if (!result.success) {
    await telegram.answerCallbackQuery(query.id, result.error!, true);
    return;
  }

  await telegram.answerCallbackQuery(query.id, '✅ Session closed!');

  // Build closed message
  const counts = await services.splitService.countBySession(sessionId);
  const text = buildClosedMessage(session, counts.total, counts.paid, counts.unpaid);
  const keyboard = buildClosedKeyboard();

  if (session.telegram_message_id) {
    await telegram.editMessageText(chatId, session.telegram_message_id, text, keyboard);
  } else {
    await telegram.sendMessage(chatId, text);
  }
}

// ==================== Helpers ====================
async function updateViewUnpaidMessages(
  sessionId: number,
  session: Session,
  chatId: number,
  telegram: TelegramService,
  env: Env,
): Promise<void> {
  const ephRepo = new EphemeralMessageRepo(env.DB);
  const typeKey = `view_unpaid_${sessionId}`;
  
  const activeMessages = await ephRepo.getByType(chatId, typeKey);
  if (activeMessages.length === 0) return;

  const { paymentService } = buildServices(env);
  const unpaid = await paymentService.listUnpaid(sessionId);
  const text = buildUnpaidMessage(session, unpaid);
  const keyboard = buildDismissKeyboard();

  for (const msg of activeMessages) {
    try {
      await telegram.editMessageText(chatId, msg.message_id, text, keyboard);
    } catch (e) {
      console.warn(`Failed to update unpaid message ${msg.message_id}:`, e);
    }
  }
}

async function refreshSplitMessage(
  sessionId: number,
  session: Session,
  chatId: number,
  userId: number,
  telegram: TelegramService,
  env: Env,
): Promise<void> {
  const services = buildServices(env);
  const splits = await services.splitService.listBySession(sessionId);
  const counts = await services.splitService.countBySession(sessionId);
  const updatedSession = await services.sessionService.getById(sessionId);
  const text = buildSplitMessage(updatedSession ?? session, splits, counts.total);
  const perPerson = splits.length > 0 ? splits[0].amount_due : undefined;
  const keyboard = buildSplitKeyboard(sessionId, perPerson, (updatedSession ?? session).title, env);

  if (session.telegram_message_id) {
    await telegram.editMessageText(chatId, session.telegram_message_id, text, keyboard);
  }
}
