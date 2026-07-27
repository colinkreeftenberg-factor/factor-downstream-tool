import { getCarrierEmail } from '../../lib/carrierDirectory';
import { logBacklogEntry } from '../../lib/backlog';

// POST /api/carrier-email
// Body: { carrier, loadReference, source }
// Looks up the carrier's email from the links tab and logs the draft to
// the backlog. Doesn't send anything itself — the actual send happens in
// the person's own Gmail tab, outside this app entirely, so all we can
// honestly log is that a draft was opened, not that it was sent.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { carrier, loadReference, source } = req.body || {};
  if (!carrier) return res.status(400).json({ error: 'Missing carrier' });

  try {
    const email = await getCarrierEmail(carrier);
    if (!email) {
      return res.status(200).json({ ok: true, email: null });
    }

    if (loadReference) {
      await logBacklogEntry({
        loadReference,
        source: source || 'factor',
        type: 'Email drafted',
        field: 'Carrier email',
        newValue: `${carrier} <${email}>`,
      });
    }

    return res.status(200).json({ ok: true, email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to look up carrier email', detail: err.message });
  }
}
