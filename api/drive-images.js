const { GoogleAuth } = require('google-auth-library');

const PARENT_FOLDER_ID = '1tSHOPlJpN0vslaIY2JyAEa3gJQT603IF';
let cachedClient = null;

async function getAuthClient() {
  if (cachedClient) return cachedClient;
  if (!process.env.GMAIL_SERVICE_ACCOUNT_KEY) {
    throw new Error('GMAIL_SERVICE_ACCOUNT_KEY missing');
  }
  const credentials = JSON.parse(process.env.GMAIL_SERVICE_ACCOUNT_KEY);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  cachedClient = await auth.getClient();
  return cachedClient;
}

module.exports = async function handler(req, res) {
  try {
    const client = await getAuthClient();

    // List all recipe folders (paginated)
    const allFolders = [];
    let pageToken = null;
    do {
      const qs = new URLSearchParams({
        q: `'${PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'nextPageToken,files(id,name)',
        pageSize: '1000',
      });
      if (pageToken) qs.set('pageToken', pageToken);
      const resp = await client.request({
        url: `https://www.googleapis.com/drive/v3/files?${qs}`,
      });
      allFolders.push(...(resp.data.files || []));
      pageToken = resp.data.nextPageToken || null;
    } while (pageToken);

    // Build mapping: RECIPECODE → folderId
    // Folder name format: "FV0972A - Salmon Piccata" or "FE4014B - ..."
    const mapping = {};
    for (const folder of allFolders) {
      const code = folder.name.split(/\s*-\s*/)[0].trim().toUpperCase();
      if (code) mapping[code] = folder.id;
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json(mapping);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
