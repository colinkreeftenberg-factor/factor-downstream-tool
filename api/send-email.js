// api/send-email.js
//
// Fetches recipient addresses from the 'email' tab of the LINE sheet,
// then sends an HTML email via Gmail API using the service account with
// domain-wide delegation.
//
// Required env var: GOOGLE_SERVICE_ACCOUNT_KEY (already set)
// Required env var: GMAIL_SENDER — the Workspace user the service account
//   impersonates to send mail, e.g. colin.kreeftenberg@factor75.eu
//   (domain-wide delegation must be enabled for the service account with
//    scope https://www.googleapis.com/auth/gmail.send)
//
// POST body: { subject: string, html: string }

const { GoogleAuth } = require('google-auth-library');

const LINE_SHEET_ID   = '1CJ7raeP-Ex7eOkQ0ShpbgXKeHi1EJWXE6XNITArW7Do';
const SHEETS_SCOPE    = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const GMAIL_SCOPE     = 'https://www.googleapis.com/auth/gmail.send';
const DRIVE_SCOPE     = 'https://www.googleapis.com/auth/drive.readonly';

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new GoogleAuth({ credentials, scopes: [SHEETS_SCOPE] });
  return auth.getClient();
}

async function getGmailClient(sender) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new GoogleAuth({ credentials, scopes: [GMAIL_SCOPE], subject: sender });
  return auth.getClient();
}

async function fetchEmailRecipients() {
  const client = await getSheetsClient();
  const token = (await client.getAccessToken()).token;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${LINE_SHEET_ID}/values/${encodeURIComponent('email!A:Z')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const rows = data.values || [];
  const emails = [];
  rows.forEach(row => {
    row.forEach(cell => {
      const val = (cell || '').trim();
      if (val.includes('@') && val.includes('.')) emails.push(val);
    });
  });
  return [...new Set(emails)]; // deduplicate
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Use POST' }); return; }

  const sender = process.env.GMAIL_SENDER;
  if (!sender) {
    res.status(500).json({ ok: false, error: 'GMAIL_SENDER env var is not set. Add the impersonated Workspace user email (e.g. yourname@factor75.eu) to Vercel environment variables.' });
    return;
  }

  try {
    const { subject, html } = req.body || {};
    if (!subject || !html) {
      res.status(400).json({ ok: false, error: 'subject and html are required' });
      return;
    }

    const recipients = await fetchEmailRecipients();
    if (!recipients.length) {
      res.status(400).json({ ok: false, error: 'No email addresses found in the "email" tab of the sheet.' });
      return;
    }

    const client = await getGmailClient(sender);
    const token = (await client.getAccessToken()).token;

    const toHeader = recipients.join(', ');
    const rawMessage = [
      `From: Factor Ops Tools <${sender}>`,
      `To: ${toHeader}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      html
    ].join('\r\n');

    const encoded = Buffer.from(rawMessage).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

    const gmailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(sender)}/messages/send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded })
      }
    );

    const gmailData = await gmailRes.json();
    if (!gmailRes.ok) {
      throw new Error(gmailData?.error?.message || `Gmail API error (${gmailRes.status})`);
    }

    res.status(200).json({ ok: true, messageId: gmailData.id, sentTo: recipients });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Unknown error' });
  }
};
