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
  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid file ID' });
  }

  try {
    const client = await getAuthClient();

    // Directly download the file by ID — single Drive API call
    const imgResp = await client.request({
      url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
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
