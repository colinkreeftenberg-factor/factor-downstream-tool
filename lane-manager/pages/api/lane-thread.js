import { fetchThreadReplies } from '../../lib/slack';

// GET /api/lane-thread?channel=C0XXXX&ts=1234.5678
// Pulled by the detail popup on open and on its own poll timer — this is
// the "poll on open" approach rather than Slack pushing to us via the
// Events API, so no public webhook receiver or signing-secret
// verification is needed here.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { channel, ts } = req.query;
  if (!channel || !ts) return res.status(200).json({ ok: true, messages: [] });

  try {
    const result = await fetchThreadReplies(channel, ts);
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch thread', detail: err.message });
  }
}
