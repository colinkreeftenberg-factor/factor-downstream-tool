import { requestLaneUpdate } from '../../lib/notify';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { loadReference } = req.body || {};
  if (!loadReference) return res.status(400).json({ error: 'Missing loadReference' });

  try {
    const result = await requestLaneUpdate(loadReference);
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to send update request', detail: err.message });
  }
}
