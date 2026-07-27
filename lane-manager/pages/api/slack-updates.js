import { getAllThreads } from '../../lib/slackThreads';
import { fetchThread } from '../../lib/slack';

// GET /api/slack-updates
// Returns every lane that has ever had a Slack thread opened, each with
// its full message history (across every thread instance for that lane,
// in case "Request Slack update" was clicked more than once), newest
// message first. The client filters this down to lanes that are still
// visible in the current lane list — this route doesn't know about that.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const threads = await getAllThreads();

    const byLane = new Map();
    threads.forEach((t) => {
      const key = t.loadReference;
      if (!byLane.has(key)) byLane.set(key, { loadReference: t.loadReference, source: t.source, threads: [] });
      byLane.get(key).threads.push(t);
    });

    const tickets = await Promise.all(
      Array.from(byLane.values()).map(async (lane) => {
        const results = await Promise.all(
          lane.threads.map(async (t) => {
            try {
              const r = await fetchThread(t.channel, t.ts, { includeRoot: true });
              return r.messages || [];
            } catch (err) {
              console.error('slack-updates: failed to fetch a thread', t.channel, t.ts, err.message);
              return [];
            }
          })
        );
        const messages = results.flat().sort((a, b) => Number(b.ts) - Number(a.ts));
        return { loadReference: lane.loadReference, source: lane.source, messages };
      })
    );

    tickets.sort((a, b) => {
      const at = a.messages[0] ? Number(a.messages[0].ts) : 0;
      const bt = b.messages[0] ? Number(b.messages[0].ts) : 0;
      return bt - at;
    });

    return res.status(200).json({ ok: true, tickets });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load Slack updates', detail: err.message });
  }
}
