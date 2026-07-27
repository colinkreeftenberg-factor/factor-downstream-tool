import { logBacklogEntry } from '../../lib/backlog';

// POST /api/transport-request
// Body: { to, loadReference, subject }
// Same honesty caveat as /api/carrier-email: this only logs that a draft
// was opened, not that it was actually sent — the send happens in the
// person's own Gmail tab, outside this app.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, loadReference, subject } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Missing recipient' });

  await logBacklogEntry({
    loadReference: loadReference || '(none)',
    source: 'factor',
    type: 'Transport request emailed',
    field: 'Recipient',
    oldValue: '',
    newValue: `${to}${subject ? ` — ${subject}` : ''}`,
  });

  return res.status(200).json({ ok: true });
}
