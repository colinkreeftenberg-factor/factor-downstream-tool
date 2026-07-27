import { runNotifyCheck } from '../../lib/notify';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // force: true — a person clicking the button expects a real check
    // right now, not "silently skipped because we already flagged it once".
    const result = await runNotifyCheck({ force: true });
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Notify run failed', detail: err.message });
  }
}
