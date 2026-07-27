import { getBacklog } from '../../lib/backlog';

// GET /api/backlog
// Returns every logged change, newest first. The client filters this down
// to lanes that are still visible in the current lane list.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const entries = await getBacklog();
    return res.status(200).json({ ok: true, entries });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load backlog', detail: err.message });
  }
}
