// Bot-token Slack Web API calls — separate from the incoming webhook used
// by the automated checks in notify.js. A webhook can only post; reading a
// thread's replies needs a real bot token with `chat:write` +
// `channels:history` (or `groups:history` for a private channel) scopes.
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

function configured() {
  return Boolean(SLACK_BOT_TOKEN && SLACK_CHANNEL_ID);
}

async function callSlack(method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

// Slack documents conversations.replies and users.info as GET-style
// "read" methods (`GET https://slack.com/api/<method>`), distinct from
// write methods like chat.postMessage that explicitly support a JSON POST
// body. Sending them as GET with query params matches Slack's own
// documented usage exactly, rather than relying on POST JSON parsing that
// isn't guaranteed for every method.
async function callSlackGet(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

/**
 * Posts a top-level message that will act as a thread parent. Returns the
 * {channel, ts} address needed to read replies later — this is the piece
 * an incoming webhook can never give you.
 */
export async function postThreadRoot(text) {
  if (!configured()) return { skipped: true, reason: 'SLACK_BOT_TOKEN / SLACK_CHANNEL_ID not configured yet' };
  const data = await callSlack('chat.postMessage', {
    channel: SLACK_CHANNEL_ID,
    text,
  });
  return { ok: true, channel: data.channel, ts: data.ts };
}

// Small in-memory cache so a modal open with several replies from the same
// person doesn't do a users.info round trip per message. Serverless
// functions are short-lived so this only helps within one invocation, but
// costs nothing to keep.
const userNameCache = new Map();

async function resolveUserName(userId) {
  if (!userId) return null;
  if (userNameCache.has(userId)) return userNameCache.get(userId);
  try {
    const data = await callSlackGet('users.info', { user: userId });
    const name = data.user?.profile?.display_name || data.user?.real_name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId; // fall back to the raw ID rather than failing the whole fetch
  }
}

/**
 * Fetches a thread's messages, newest first, with display names resolved
 * where possible. By default excludes the root/parent message (the
 * "update requested" ping itself) since callers that already know they
 * triggered it don't need it repeated — pass includeRoot: true for views
 * (like the Slack Updates ticket feed) that show the full conversation.
 */
export async function fetchThread(channel, ts, { includeRoot = false } = {}) {
  if (!configured()) return { skipped: true, reason: 'SLACK_BOT_TOKEN / SLACK_CHANNEL_ID not configured yet' };
  if (!channel || !ts) return { ok: true, messages: [] };

  const data = await callSlackGet('conversations.replies', { channel, ts });
  const raw = includeRoot ? (data.messages || []) : (data.messages || []).filter((m) => m.ts !== ts);

  const messages = await Promise.all(
    raw.map(async (m) => ({
      ts: m.ts,
      text: m.text || '',
      user: await resolveUserName(m.user),
      time: new Date(Number(m.ts) * 1000).toISOString(),
      isRoot: m.ts === ts,
    }))
  );

  messages.sort((a, b) => Number(b.ts) - Number(a.ts)); // newest first
  return { ok: true, messages };
}
