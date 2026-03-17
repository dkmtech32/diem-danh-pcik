import type { TelegramInlineKeyboardMarkup, TelegramInlineKeyboardButton } from '../types/telegram';
import type { Env } from '../config';

/**
 * Build the RSVP keyboard for an open session.
 * Admin buttons always shown — permissions enforced on click.
 */
export function buildRsvpKeyboard(sessionId: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Đi luôn', callback_data: `r:j:${sessionId}` },
        { text: '🤔 Để coi đã', callback_data: `r:m:${sessionId}` },
        { text: '❌ Nghỉ kèo', callback_data: `r:s:${sessionId}` },
      ],
      [{ text: '👥 Xem danh sách', callback_data: `v:p:${sessionId}` }],
      [
        { text: '🔒 Chốt danh sách', callback_data: `f:${sessionId}` },
        { text: '🗑️ Hủy kèo', callback_data: `cx:${sessionId}` },
      ],
    ],
  };
}

/**
 * Build the keyboard for a finalized session (before bill split).
 */
export function buildFinalizedKeyboard(sessionId: number): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '👥 Xem danh sách', callback_data: `v:p:${sessionId}` }],
      [
        { text: '💸 Chia tiền sân', callback_data: `sb:${sessionId}` },
        { text: '🗑️ Hủy kèo', callback_data: `cx:${sessionId}` },
      ],
    ],
  };
}

/**
 * Build the keyboard for the bill split card.
 */
export function buildSplitKeyboard(
  sessionId: number,
  perPersonAmount?: number,
  sessionTitle?: string,
  env?: Env,
): TelegramInlineKeyboardMarkup {
  const keyboard: TelegramInlineKeyboardButton[][] = [
    [
      { text: '💰 Tôi đã trả', callback_data: `mp:${sessionId}` },
      { text: '📊 Tình trạng của tôi', callback_data: `ms:${sessionId}` },
    ],
    [
      { text: '⏳ Ai còn nợ', callback_data: `vu:${sessionId}` },
      { text: '🔄 Cập nhật lại', callback_data: `rf:${sessionId}` },
    ],
    [
      { text: '🏁 Chốt sổ kèo này', callback_data: `cl:${sessionId}` },
      { text: '🗑️ Hủy kèo', callback_data: `cx:${sessionId}` },
    ],
  ];

  if (perPersonAmount && sessionTitle && env?.ADMIN_BANK_BIN && env?.ADMIN_BANK_ACCOUNT) {
    // Keep description short for VietQR limits
    const addInfo = encodeURIComponent(sessionTitle.substring(0, 40));
    const accountName = env.ADMIN_BANK_NAME ? encodeURIComponent(env.ADMIN_BANK_NAME) : '';
    // Generate a vietqr.io image that users can scan or open in their browser
    const qrUrl = `https://img.vietqr.io/image/${env.ADMIN_BANK_BIN}-${env.ADMIN_BANK_ACCOUNT}-compact2.jpg?amount=${perPersonAmount}&addInfo=${addInfo}&accountName=${accountName}`;

    keyboard.unshift([{ text: '🏦 Quét QR Thanh Toán', url: qrUrl }]);
  }

  return { inline_keyboard: keyboard };
}

/**
 * Build an empty keyboard (for closed sessions).
 */
export function buildClosedKeyboard(): TelegramInlineKeyboardMarkup {
  return { inline_keyboard: [] };
}

/**
 * Build the finalize player selection keyboard.
 * Shows toggleable buttons for each member (✅ selected, ⬜ not selected).
 * Callback format: ft:sessionId:memberId (toggle), fc:sessionId (confirm), fx:sessionId (cancel)
 */
export function buildFinalizeSelectionKeyboard(
  sessionId: number,
  members: { id: number; name: string; selected: boolean }[],
): TelegramInlineKeyboardMarkup {
  // Two members per row for compact layout
  const memberButtons: TelegramInlineKeyboardMarkup['inline_keyboard'] = [];
  for (let i = 0; i < members.length; i += 2) {
    const row = [
      {
        text: `${members[i].selected ? '✅' : '⬜'} ${members[i].name}`,
        callback_data: `ft:${sessionId}:${members[i].id}`,
      },
    ];
    if (i + 1 < members.length) {
      row.push({
        text: `${members[i + 1].selected ? '✅' : '⬜'} ${members[i + 1].name}`,
        callback_data: `ft:${sessionId}:${members[i + 1].id}`,
      });
    }
    memberButtons.push(row);
  }

  return {
    inline_keyboard: [
      ...memberButtons,
      [
        { text: '✅ Xác nhận chốt', callback_data: `fc:${sessionId}` },
        { text: '❌ Thôi bỏ', callback_data: `fx:${sessionId}` },
      ],
    ],
  };
}

/**
 * Build a simple keyboard with only a "Dismiss" button.
 */
export function buildDismissKeyboard(): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: '❌ Đóng đi', callback_data: 'd' }]],
  };
}