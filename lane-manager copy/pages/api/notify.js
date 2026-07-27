import { runNotifyCheck } from '../../lib/notify';

export default async function handler(req, res) {
  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runNotifyCheck({ force: false });
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Notify run failed', detail: err.message });
  }
}
