export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const beatId = String(req.query.id || '').trim();
  if (!beatId || beatId === 'undefined' || beatId === 'null') {
    return res.status(400).json({ error: 'missing id' });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = 'appB4LCctwYvuxK5S';
  const TABLE_ID = 'tblkdiwaGP5e5xAot';

  try {
    const formula = `AND({Select}="Approved", RECORD_ID()="${beatId}")`;
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: errText, status: response.status });
    }
    const data = await response.json();
    const r = data.records && data.records[0];
    if (!r) {
      return res.status(404).json({ error: 'beat not found' });
    }
    const beat = {
      id: r.id,
      title: r.fields['TItle'] || r.fields['Title'] || 'Untitled',
      producer: r.fields['Producer'] || 'Unknown',
      type: r.fields['Type'] || 'Full Beat',
      bpm: r.fields['BPM'] ? r.fields['BPM'] + ' BPM' : '--- BPM',
      key: r.fields['Key'] || 'N/A',
      genre: r.fields['Genre'] || 'Other',
      color: r.fields['Color'] || '#BA7517',
      mp3: r.fields['Preview URL'] || '',
      buy: r.fields['Buy Link'] || ''
    };
    res.status(200).json({ beat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
