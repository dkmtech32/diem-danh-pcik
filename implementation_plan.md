# Telegram Pickleball Bot — Implementation Plan

Build a Telegram group bot on **Cloudflare Workers + D1** that manages pickleball session attendance, bill splitting, and payment tracking.

---

## User Review Required

> [!IMPORTANT]
> **Dependency choice — Hono framework:**  I plan to use [Hono](https://hono.dev) as the HTTP router. It's the de-facto standard for Cloudflare Workers and is tiny (<14 KB). This keeps the code simple compared to hand-rolling `Request`/`Response` handling.

> [!IMPORTANT]
> **Session creation UX:**  The brief suggests a step-by-step chat flow for `/session`. For a simpler MVP I propose a **single-command format**: `/session Title | Date/Time | Location | EstimatedCost`. This avoids tracking multi-step conversation state, which adds significant complexity. We can add a conversational flow later.

> [!IMPORTANT]
> **Admin detection:** Telegram's "get chat member" API will be called to check if a user is an admin of the group. This is the simplest reliable method.

> [!WARNING]
> **Telegram Bot Token:**  You will need to create a Telegram bot via [@BotFather](https://t.me/BotFather) and provide the token. I'll set up the config to read it from Wrangler secrets.

---

## Proposed Changes

### Project Scaffold

#### [NEW] [package.json](file:///d:/work/diem-danh-pcik/package.json)
Node project manifest. Dependencies: `hono`, `@cloudflare/workers-types`. Dev deps: `wrangler`, `typescript`.

#### [NEW] [tsconfig.json](file:///d:/work/diem-danh-pcik/tsconfig.json)
TypeScript config targeting ES2022, module NodeNext, strict mode.

#### [NEW] [wrangler.toml](file:///d:/work/diem-danh-pcik/wrangler.toml)
Cloudflare Worker config with D1 binding `DB`, compatibility date, and main entry point.

---

### Database Migrations

#### [NEW] [migrations/0001_initial.sql](file:///d:/work/diem-danh-pcik/migrations/0001_initial.sql)
All 7 tables: `groups`, `members`, `group_members`, `sessions`, `session_rsvps`, `session_players`, `session_splits`. Includes unique constraints and indexes per the data model spec.

---

### Types

#### [NEW] [src/types/telegram.ts](file:///d:/work/diem-danh-pcik/src/types/telegram.ts)
TypeScript interfaces for the Telegram Bot API structures we use: `Update`, `Message`, `CallbackQuery`, `User`, `Chat`, `InlineKeyboardMarkup`, etc.

#### [NEW] [src/types/domain.ts](file:///d:/work/diem-danh-pcik/src/types/domain.ts)
Domain types/interfaces matching the DB tables: `Group`, `Member`, `Session`, `SessionRsvp`, `SessionPlayer`, `SessionSplit`, plus enums for statuses.

---

### Config & Entry Point

#### [NEW] [src/config.ts](file:///d:/work/diem-danh-pcik/src/config.ts)
`Env` interface with `DB` (D1), `TELEGRAM_BOT_TOKEN`, `APP_BASE_URL`. Helper to build Telegram API base URL.

#### [NEW] [src/index.ts](file:///d:/work/diem-danh-pcik/src/index.ts)
Hono app with routes:
- `POST /webhook/telegram` → dispatches to webhook handler
- `GET /health` → returns 200
- `POST /setup-webhook` → registers the webhook URL with Telegram (convenience endpoint)

---

### Telegram Service

#### [NEW] [src/services/telegram-service.ts](file:///d:/work/diem-danh-pcik/src/services/telegram-service.ts)
Wraps Telegram Bot API calls: `sendMessage`, `editMessageText`, `answerCallbackQuery`, `getChatMember`. All use `fetch()`.

---

### Repositories (data access layer)

Each repo provides simple CRUD against D1 using prepared statements.

| File | Scope |
|------|-------|
| [NEW] [group-repo.ts](file:///d:/work/diem-danh-pcik/src/repositories/group-repo.ts) | upsert/get group |
| [NEW] [member-repo.ts](file:///d:/work/diem-danh-pcik/src/repositories/member-repo.ts) | upsert/get member, upsert group_member |
| [NEW] [session-repo.ts](file:///d:/work/diem-danh-pcik/src/repositories/session-repo.ts) | CRUD sessions, update status/cost |
| [NEW] [rsvp-repo.ts](file:///d:/work/diem-danh-pcik/src/repositories/rsvp-repo.ts) | upsert RSVP, list by session |
| [NEW] [player-repo.ts](file:///d:/work/diem-danh-pcik/src/repositories/player-repo.ts) | batch insert finalized players, list by session |
| [NEW] [split-repo.ts](file:///d:/work/diem-danh-pcik/src/repositories/split-repo.ts) | batch insert splits, update payment, list unpaid |

---

### Services (business logic)

| File | Scope |
|------|-------|
| [NEW] [group-service.ts](file:///d:/work/diem-danh-pcik/src/services/group-service.ts) | Ensure group + member exist on every update |
| [NEW] [member-service.ts](file:///d:/work/diem-danh-pcik/src/services/member-service.ts) | Member lookup/upsert |
| [NEW] [session-service.ts](file:///d:/work/diem-danh-pcik/src/services/session-service.ts) | Create, finalize, close sessions; enforce state machine |
| [NEW] [rsvp-service.ts](file:///d:/work/diem-danh-pcik/src/services/rsvp-service.ts) | Upsert RSVP, build grouped lists |
| [NEW] [split-service.ts](file:///d:/work/diem-danh-pcik/src/services/split-service.ts) | Calculate split, create records |
| [NEW] [payment-service.ts](file:///d:/work/diem-danh-pcik/src/services/payment-service.ts) | Mark paid, list unpaid |

---

### Handlers (Telegram dispatch)

#### [NEW] [src/handlers/webhook.ts](file:///d:/work/diem-danh-pcik/src/handlers/webhook.ts)
Parses the incoming Telegram `Update`, ensures group/member records exist, then dispatches to `commands.ts` (for messages with commands) or `callbacks.ts` (for callback queries).

#### [NEW] [src/handlers/commands.ts](file:///d:/work/diem-danh-pcik/src/handlers/commands.ts)
Handles `/start`, `/help`, `/session`, `/sessions`. Parses arguments, calls services, sends response messages.

#### [NEW] [src/handlers/callbacks.ts](file:///d:/work/diem-danh-pcik/src/handlers/callbacks.ts)
Handles inline button callbacks. Parses compact payload format (`r:j:12`, `f:12`, etc.), calls services, edits messages or answers with alerts.

---

### Utilities

| File | Scope |
|------|-------|
| [NEW] [message-builders.ts](file:///d:/work/diem-danh-pcik/src/utils/message-builders.ts) | Build formatted session, split, and closed messages |
| [NEW] [keyboards.ts](file:///d:/work/diem-danh-pcik/src/utils/keyboards.ts) | Build inline keyboard layouts for each card state |
| [NEW] [money.ts](file:///d:/work/diem-danh-pcik/src/utils/money.ts) | Format VND amounts (no decimals, comma separators) |
| [NEW] [datetime.ts](file:///d:/work/diem-danh-pcik/src/utils/datetime.ts) | Date formatting helpers |
| [NEW] [permissions.ts](file:///d:/work/diem-danh-pcik/src/utils/permissions.ts) | `isGroupAdmin()` check via Telegram API |

---

## Verification Plan

### Automated Tests

Since this is a Cloudflare Workers project and the primary interaction is with external Telegram APIs and D1, **unit testing the core logic** is the most practical automated approach:

1. **TypeScript compilation check**
   ```
   npx tsc --noEmit
   ```
   Ensures the entire project compiles without errors.

2. **Wrangler local dev server**
   ```
   npx wrangler dev --local
   ```
   Starts the worker locally with a local D1 database. We can test the `/health` endpoint and simulate webhook payloads.

3. **Simulate webhook payloads with curl** — I will provide a script `scripts/test-webhook.sh` with sample Telegram Update JSON payloads for each flow (RSVP, finalize, split, mark paid, close). These can be sent to the local dev server.

### Manual Verification

> [!NOTE]
> The primary way to fully test this bot is **live in a Telegram group**. After deployment:

1. **Create a Telegram bot** via @BotFather, get the token
2. **Deploy** with `npx wrangler deploy`
3. **Set webhook** by hitting the `/setup-webhook` endpoint
4. **Add the bot** to a test Telegram group
5. **Run through the full flow**: `/start` → `/session` → RSVP buttons → Finalize → Split Bill → Mark Paid → View Unpaid → Close Session
6. Verify messages render correctly, buttons work, and error cases (non-admin trying admin action, double-pay, etc.) show proper messages

**I'd appreciate your guidance on whether you want me to also create a test script with mock Telegram payloads, or if live Telegram testing is sufficient for your needs.**
