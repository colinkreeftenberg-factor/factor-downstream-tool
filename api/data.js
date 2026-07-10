const { GoogleAuth } = require('google-auth-library');

const LINE_SHEET_ID = '1CJ7raeP-Ex7eOkQ0ShpbgXKeHi1EJWXE6XNITArW7Do';
const BACKEND_SHEET_ID = '1DjYDHfwKLRkQzlEj22whxrBjdk9T36VRQqMGE91l17U';
const BNL_PRODUCTION_SHEET_ID = '1NQzhmy1jkfqDoxUQWabxvIV5568eIj4aqsOCaZBozH8';

const SOURCES = {
  bartender: { spreadsheetId: LINE_SHEET_ID, range: 'Bartender!A:Z' },
  odl: { spreadsheetId: LINE_SHEET_ID, range: 'ODL!A:Z' },
  verden: { spreadsheetId: BACKEND_SHEET_ID, range: 'Verden!A:BZ' },
  boxpricetz: { spreadsheetId: BACKEND_SHEET_ID, range: 'BoxPriceTZ!A:Z' },
  mealdb: { spreadsheetId: BACKEND_SHEET_ID, range: "'Meal Database'!A:Z" },
  deodl: { spreadsheetId: BACKEND_SHEET_ID, range: "'DE ODL'!A:Z" },
  kitcontent: { spreadsheetId: BACKEND_SHEET_ID, range: 'Kitcontent!A:Z' },
  bnlodl: { spreadsheetId: BACKEND_SHEET_ID, range: "'BNL ODL'!A:Z" },

  // BNL Swap & Shortage During Production — new production sheet
  bnl_kitcontent: { spreadsheetId: BNL_PRODUCTION_SHEET_ID, range: 'Kitcontent!A:M' },
  bnl_mealdb: { spreadsheetId: BNL_PRODUCTION_SHEET_ID, range: 'MealDatabase!A:AJ' },
  bnl_production: { spreadsheetId: BNL_PRODUCTION_SHEET_ID, range: 'source_timestamps_enriched!A:P' }
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
  const source = SOURCES[sheet];

  if (!source) {
    res.status(400).json({ error: 'Unknown sheet parameter: ' + sheet });
    return;
  }

  try {
    const client = await getAuthClient();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}/values/${encodeURIComponent(source.range)}`;
    const response = await client.request({ url });
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).json({ data: response.data.values });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
