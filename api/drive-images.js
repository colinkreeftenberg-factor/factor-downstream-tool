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

async function driveList(client, params) {
  const qs = new URLSearchParams({
    pageSize: '1000',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    ...params,
  });
  const resp = await client.request({
    url: `https://www.googleapis.com/drive/v3/files?${qs}`,
  });
  return resp.data.files || [];
}

function parseCode(folderName) {
  // "FV0972A - Salmon Piccata"  →  "FV0972A"
  // "FE4014B-Chicken"           →  "FE4014B"
  const m = folderName.match(/^([A-Za-z]{2}\d+[A-Za-z]?)\b/);
  return m ? m[1].toUpperCase() : folderName.split(/[\s-_]/)[0].toUpperCase();
}

function pickBestFile(files) {
  if (!files.length) return null;
  const low = files.find(f => f.name.toLowerCase().includes('low'));
  if (low) return low;
  return [...files].sort(
    (a, b) => (parseInt(a.size) || 999999) - (parseInt(b.size) || 999999)
  )[0];
}

// Run async tasks with limited concurrency
async function pMap(items, fn, limit = 20) {
  const results = new Array(items.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i]); } catch { /* skip */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

module.exports = async function handler(req, res) {
  try {
    const client = await getAuthClient();

    // 1. List all recipe subfolders (one API call)
    const folders = await driveList(client, {
      q: `'${PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
    });

    // 2. For each folder, find the best image (parallel, 20 at a time)
    const mapping = {};
    await pMap(folders, async (folder) => {
      const code = parseCode(folder.name);
      if (!code) return;
      const files = await driveList(client, {
        q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
        fields: 'files(id,name,size)',
        pageSize: '50',
      });
      const best = pickBestFile(files);
      if (best) mapping[code] = best.id;
    }, 20);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json(mapping);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
