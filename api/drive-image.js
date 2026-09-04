const { GoogleAuth } = require('google-auth-library');

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
  const { folder } = req.query;
  if (!folder || !/^[a-zA-Z0-9_-]+$/.test(folder)) {
    return res.status(400).json({ error: 'Invalid folder ID' });
  }

  try {
    const client = await getAuthClient();

    // List image files in this recipe folder
    const qs = new URLSearchParams({
      q: `'${folder}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: 'files(id,name,size)',
      pageSize: '50',
    });
    const listResp = await client.request({
      url: `https://www.googleapis.com/drive/v3/files?${qs}`,
    });
    const files = listResp.data.files || [];

    if (!files.length) {
      return res.status(404).send('No images');
    }

    // Prefer file with 'low' in name (low-res version); fall back to smallest size
    let best = files.find(f => f.name.toLowerCase().includes('low'));
    if (!best) {
      best = [...files].sort(
        (a, b) => (parseInt(a.size) || 999999) - (parseInt(b.size) || 999999)
      )[0];
    }

    // Fetch and proxy the image
    const imgResp = await client.request({
      url: `https://www.googleapis.com/drive/v3/files/${best.id}?alt=media`,
      responseType: 'arraybuffer',
    });

    const contentType = imgResp.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.send(Buffer.from(imgResp.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
