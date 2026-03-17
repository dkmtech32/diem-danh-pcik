import type { Session, RsvpWithMember, SplitWithMember, PlayerWithMember } from '../types/domain';
import { formatVND } from './money';
import { formatDateTime } from './datetime';

/**
 * Get display name for a member, preferring display_name > first_name > username > 'Unknown'.
 */
function memberName(m: { display_name: string | null; first_name: string | null; username: string | null }): string {
  return m.display_name || m.first_name || (m.username ? `@${m.username}` : 'Unknown');
}

/**
 * Build the session RSVP card message.
 */
export function buildSessionMessage(
  session: Session,
  counts: { join: number; maybe: number; skip: number },
): string {
  let msg = `🏓 <b>${escapeHtml(session.title)}</b>\n`;
  if (session.scheduled_at) msg += `🕒 ${escapeHtml(formatDateTime(session.scheduled_at))}\n`;
  if (session.location) msg += `📍 ${escapeHtml(session.location)}\n`;
  if (session.estimated_cost) msg += `💰 Estimated: ${formatVND(session.estimated_cost)} VND\n`;
  msg += '\n';
  msg += `✅ Joining: ${counts.join}\n`;
  msg += `🤔 Maybe: ${counts.maybe}\n`;
  msg += `❌ Skip: ${counts.skip}`;
  return msg;
}

/**
 * Build the finalized attendance message.
 */
export function buildFinalizedMessage(session: Session, players: PlayerWithMember[]): string {
  let msg = `🔒 <b>Attendance Finalized</b>\n\n`;
  msg += `🏓 <b>${escapeHtml(session.title)}</b>\n`;
  msg += `👥 Players: ${players.length}\n\n`;
  players.forEach((p, i) => {
    msg += `${i + 1}. ${escapeHtml(memberName(p))}\n`;
  });
  return msg;
}

/**
 * Build the view players response.
 */
export function buildPlayersListMessage(
  session: Session,
  rsvps: RsvpWithMember[],
): string {
  const joinList = rsvps.filter((r) => r.rsvp_status === 'join');
  const maybeList = rsvps.filter((r) => r.rsvp_status === 'maybe');
  const skipList = rsvps.filter((r) => r.rsvp_status === 'skip');

  let msg = `👥 <b>Players for ${escapeHtml(session.title)}</b>\n\n`;

  msg += `✅ <b>Joining (${joinList.length})</b>\n`;
  if (joinList.length === 0) msg += '  — none\n';
  else joinList.forEach((r) => (msg += `  • ${escapeHtml(memberName(r))}\n`));

  msg += `\n🤔 <b>Maybe (${maybeList.length})</b>\n`;
  if (maybeList.length === 0) msg += '  — none\n';
  else maybeList.forEach((r) => (msg += `  • ${escapeHtml(memberName(r))}\n`));

  msg += `\n❌ <b>Skip (${skipList.length})</b>\n`;
  if (skipList.length === 0) msg += '  — none\n';
  else skipList.forEach((r) => (msg += `  • ${escapeHtml(memberName(r))}\n`));

  return msg;
}

/**
 * Build the bill split card message.
 */
export function buildSplitMessage(
  session: Session,
  splits: SplitWithMember[],
  totalPlayers: number,
): string {
  const totalCost = session.actual_cost ?? 0;
  const perPerson = totalPlayers > 0 ? totalCost / totalPlayers : 0;
  const paidCount = splits.filter((s) => s.payment_status === 'paid').length;
  const unpaidCount = splits.filter((s) => s.payment_status === 'unpaid').length;

  let msg = `💸 <b>Bill Summary</b>\n\n`;
  msg += `🏓 <b>${escapeHtml(session.title)}</b>\n`;
  msg += `💰 Total: ${formatVND(totalCost)} VND\n`;
  msg += `👥 Players: ${totalPlayers}\n`;
  msg += `💵 Each owes: ${formatVND(perPerson)} VND\n\n`;
  msg += `✅ Paid: ${paidCount}\n`;
  msg += `⏳ Unpaid: ${unpaidCount}`;
  return msg;
}

/**
 * Build the unpaid players list message.
 */
export function buildUnpaidMessage(session: Session, unpaid: SplitWithMember[]): string {
  let msg = `⏳ <b>Unpaid — ${escapeHtml(session.title)}</b>\n\n`;
  if (unpaid.length === 0) {
    msg += '🎉 Everyone has paid!';
  } else {
    unpaid.forEach((s, i) => {
      msg += `${i + 1}. ${escapeHtml(memberName(s))} — ${formatVND(s.amount_due)} VND\n`;
    });
  }
  return msg;
}

/**
 * Build the member status as a plain-text popup alert (private, max 200 chars).
 * Used with answerCallbackQuery show_alert=true.
 */
export function buildMyStatusAlert(session: Session, split: SplitWithMember | null): string {
  if (!split) {
    return `You are not in the player list for "${session.title}".`;
  }
  const statusLabel = split.payment_status === 'paid' ? 'Paid ✅' : 'Unpaid ⏳';
  let msg = `Your Status — ${session.title}\n\n`;
  msg += `Amount due: ${formatVND(split.amount_due)} VND\n`;
  msg += `Status: ${statusLabel}`;
  if (split.paid_at) {
    msg += `\nPaid at: ${split.paid_at}`;
  }
  return msg;
}

/**
 * Build the member status message (HTML, for group messages).
 */
export function buildMyStatusMessage(session: Session, split: SplitWithMember | null): string {
  if (!split) {
    return `You are not in the finalized player list for <b>${escapeHtml(session.title)}</b>.`;
  }
  const statusEmoji = split.payment_status === 'paid' ? '✅' : '⏳';
  let msg = `${statusEmoji} <b>Your Status — ${escapeHtml(session.title)}</b>\n\n`;
  msg += `💵 Amount due: ${formatVND(split.amount_due)} VND\n`;
  msg += `💰 Status: ${split.payment_status === 'paid' ? 'Paid ✅' : 'Unpaid ⏳'}`;
  if (split.paid_at) {
    msg += `\n📅 Paid at: ${split.paid_at}`;
  }
  return msg;
}

/**
 * Build the closed session message.
 */
export function buildClosedMessage(
  session: Session,
  totalPlayers: number,
  paidCount: number,
  unpaidCount: number,
): string {
  const totalCost = session.actual_cost ?? 0;
  let msg = `✅ <b>Session Closed</b>\n\n`;
  msg += `🏓 <b>${escapeHtml(session.title)}</b>\n`;
  msg += `👥 Players: ${totalPlayers}\n`;
  msg += `💰 Total: ${formatVND(totalCost)} VND\n`;
  msg += `✅ Paid: ${paidCount}\n`;
  msg += `⏳ Unpaid: ${unpaidCount}`;
  return msg;
}

/**
 * Build session list message.
 */
export function buildSessionListMessage(sessions: Session[]): string {
  if (sessions.length === 0) {
    return '📋 No sessions found.';
  }

  let msg = '📋 <b>Recent Sessions</b>\n\n';
  sessions.forEach((s, i) => {
    const statusEmoji =
      s.status === 'open' ? '🟢' : s.status === 'finalized' ? '🟡' : '✅';
    msg += `${i + 1}. ${statusEmoji} <b>${escapeHtml(s.title)}</b>`;
    if (s.scheduled_at) msg += ` — ${escapeHtml(formatDateTime(s.scheduled_at))}`;
    msg += ` [${s.status}]\n`;
  });
  return msg;
}

/**
 * Build finalize selection message shown when admin is picking players.
 */
export function buildFinalizeSelectionMessage(
  session: Session,
  selectedCount: number,
  totalCount: number,
): string {
  let msg = `🔒 <b>Select Players to Finalize</b>\n\n`;
  msg += `🏓 <b>${escapeHtml(session.title)}</b>\n\n`;
  msg += `Tap names to toggle. Players with ✅ will be finalized.\n`;
  msg += `Selected: ${selectedCount} / ${totalCount}`;
  return msg;
}

/**
 * Escape HTML special characters for Telegram HTML parse mode.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
