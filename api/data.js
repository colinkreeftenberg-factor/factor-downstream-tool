const { GoogleAuth } = require('google-auth-library');

const SHEET_ID = '1CJ7raeP-Ex7eOkQ0ShpbgXKeHi1EJWXE6XNITArW7Do';

const TAB_MAP = {
  bartender: 'Bartender!A1:Z10000',
  odl: 'ODL!A1:Z10000'
};

let cachedClient = null;

async function getAuthClient() {
  if (cachedClient) return cachedClient;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var is missing on this deployment.');
  }
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  cachedClient = await auth.getClient();
  return cachedClient;
}

module.exports = async function handler(req, res) {
  const sheet = req.query.sheet;
  const range = TAB_MAP[sheet];

  if (!range) {
    res.status(400).json({ error: 'Unknown sheet parameter: ' + sheet });
    return;
  }

  try {
    const client = await getAuthClient();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
    const response = await client.request({ url });
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).json({ data: response.data.values });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
