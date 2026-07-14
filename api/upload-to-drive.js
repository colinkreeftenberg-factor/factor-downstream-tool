// api/upload-to-drive.js
//
// Uploads a text file to a specific Google Drive folder using the same shared
// service account already used by the other Factor EU tools for Sheets access
// (env var GOOGLE_SERVICE_ACCOUNT_KEY, already set in the Vercel dashboard).
//
// IMPORTANT — one-time setup before this works:
// 1. Deploy this file at api/upload-to-drive.js in the same repo/Vercel project
//    as the Communication Creator tool.
// 2. Share the destination Drive folder with the service account's email
//    (ad-marketing-factor-report-us@online-marketing-automation.iam.gserviceaccount.com)
//    as an Editor. Without this share, uploads will fail with a 403/404 from Drive,
//    because a service account cannot write into a folder it hasn't been given access to.
// 3. No new environment variables are needed — this reuses GOOGLE_SERVICE_ACCOUNT_KEY.

const { GoogleAuth } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let cachedAuthClient = null;

async function getAuthClient() {
  if (cachedAuthClient) return cachedAuthClient;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set in this Vercel project');
  const credentials = JSON.parse(raw);
  const auth = new GoogleAuth({ credentials, scopes: SCOPES });
  cachedAuthClient = await auth.getClient();
  return cachedAuthClient;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Use POST' });
    return;
  }

  try {
    const { filename, content, folderId } = req.body || {};
    if (!filename || typeof content !== 'string' || !folderId) {
      res.status(400).json({ ok: false, error: 'filename, content and folderId are required' });
      return;
    }

    const authClient = await getAuthClient();
    const accessToken = (await authClient.getAccessToken()).token;

    const metadata = { name: filename, parents: [folderId] };
    const boundary = 'factor_downstream_boundary_' + Date.now();
    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      content + '\r\n' +
      `--${boundary}--`;

    const driveRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

    const driveData = await driveRes.json();
    if (!driveRes.ok) {
      throw new Error(driveData?.error?.message || `Drive API error (${driveRes.status})`);
    }

    res.status(200).json({ ok: true, fileId: driveData.id, name: driveData.name });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Unknown error' });
  }
};
