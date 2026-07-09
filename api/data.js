const { GoogleAuth } = require('google-auth-library');

const FOLDER_ID = '1QlQ_o2pMCARcye6655GkGSDr2krTtQMN';

let cachedClient = null;

async function getAuthClient() {
  if (cachedClient) return cachedClient;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var is missing on this deployment.');
  }
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  cachedClient = await auth.getClient();
  return cachedClient;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const { filename, content, mimeType } = req.body || {};
  if (!filename || content === undefined) {
    res.status(400).json({ error: 'filename and content are required' });
    return;
  }

  try {
    const client = await getAuthClient();

    // Step 1: create the file entry in the target Drive folder
    const createRes = await client.request({
      url: 'https://www.googleapis.com/drive/v3/files',
      method: 'POST',
      data: { name: filename, parents: [FOLDER_ID] }
    });
    const fileId = createRes.data.id;

    // Step 2: upload the actual file content
    await client.request({
      url: `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      method: 'PATCH',
      data: content,
      headers: { 'Content-Type': mimeType || 'text/plain; charset=utf-8' }
    });

    res.status(200).json({ ok: true, fileId, name: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
