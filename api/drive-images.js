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

async function listAll(client, params) {
  const items = [];
  let pageToken = null;
  do {
    const qs = new URLSearchParams({ ...params, pageSize: '1000' });
    if (pageToken) qs.set('pageToken', pageToken);
    const resp = await client.request({
      url: `https://www.googleapis.com/drive/v3/files?${qs}`,
    });
    items.push(...(resp.data.files || []));
    pageToken = resp.data.nextPageToken || null;
  } while (pageToken);
  return items;
}

module.exports = async function handler(req, res) {
  try {
    const client = await getAuthClient();

    // 1. List recipe folders (direct children) — one API call
    const folders = await listAll(client, {
      q: `'${PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken,files(id,name)',
    });

    // Build folder-id → recipe-code lookup
    const folderToCode = {};
    for (const f of folders) {
      const code = f.name.split(/\s*-\s*/)[0].trim().toUpperCase();
      if (code) folderToCode[f.id] = code;
    }

    // 2. List ALL image files anywhere under the parent — one or two API calls
    //    Using 'ancestors' instead of 'parents' covers all subfolders at once.
    const allFiles = await listAll(client, {
      q: `'${PARENT_FOLDER_ID}' in ancestors and mimeType contains 'image/' and trashed=false`,
      fields: 'nextPageToken,files(id,name,size,parents)',
    });

    // 3. Group by recipe code, pick the best file per recipe
    const codeFiles = {};
    for (const file of allFiles) {
      const parentId = (file.parents || [])[0];
      const code = folderToCode[parentId];
      if (!code) continue;
      if (!codeFiles[code]) codeFiles[code] = [];
      codeFiles[code].push(file);
    }

    const mapping = {}; // code → fileId
    for (const [code, files] of Object.entries(codeFiles)) {
      // Prefer file with 'low' in name; fall back to smallest size
      let best = files.find(f => f.name.toLowerCase().includes('low'));
      if (!best) {
        best = [...files].sort(
          (a, b) => (parseInt(a.size) || 999999) - (parseInt(b.size) || 999999)
        )[0];
      }
      if (best) mapping[code] = best.id;
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json(mapping);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
