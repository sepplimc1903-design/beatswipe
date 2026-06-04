export default async function handler(req, res) {
  // CORS headers so the app can call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID  = 'appB4LCctwYvuxK5S';
  const TABLE_ID = 'tblkdiwaGP5e5xAot';

  try {
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula={Status}="Approved"`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!response.ok) throw new Error('Airtable error');

    const data = await response.json();

    // Map Airtable records to the format the app expects
    const beats = data.records.map(r => ({
      id:       r.id,
      title:    r.fields['Title']        || 'Untitled',
      producer: r.fields['Producer']     || 'Unknown',
      type:     r.fields['Type']         || 'Full Beat',
      bpm:      r.fields['BPM'] ? r.fields['BPM'] + ' BPM' : '--- BPM',
      key:      r.fields['Key']          || 'N/A',
      genre:    r.fields['Genre']        || 'Other',
      color:    r.fields['Color']        || '#BA7517',
      mp3:      r.fields['Preview URL']  || '',
      buy:      r.fields['Buy Link']     || 'https://beatstars.com'
    }));

    res.status(200).json({ beats });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
