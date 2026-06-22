import { BigQuery } from '@google-cloud/bigquery'
const bigquery = new BigQuery({ projectId: 'httparchive' })
const datasetId = 'reports'

const HISTOGRAM_TABLES = [
  'bootupJs', 'bytesCss', 'bytesFont', 'bytesHtml', 'bytesImg', 'bytesJs',
  'bytesOther', 'bytesVideo', 'compileJs', 'cruxCls', 'cruxDcl',
  'cruxFcp', 'cruxFp', 'cruxInp', 'cruxLcp', 'cruxOl', 'cruxTtfb', 'dcl',
  'evalJs', 'fcp'
].map(t => `${t}_histogram`)
// Concurrency helper
async function mapLimit(items, limit, fn) {
  const results = []
  const executing = new Set()
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item))
    results.push(p)
    executing.add(p)
    const clean = () => executing.delete(p)
    p.then(clean, clean)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }
  return Promise.all(results)
}

async function clean() {
  const [tables] = await bigquery.dataset(datasetId).getTables()
  const targetTables = tables
    .map(t => t.id)
    .filter(name => name.endsWith('_timeseries') || HISTOGRAM_TABLES.includes(name))

  console.log(`Found ${targetTables.length} tables to truncate. Running concurrently (limit 20)...`)
  
  await mapLimit(targetTables, 20, async (name) => {
    console.log(`Truncating reports.${name}...`)
    try {
      await bigquery.query({ query: `TRUNCATE TABLE \`${datasetId}.${name}\`` })
    } catch (e) {
      console.error(`  Failed reports.${name}: ${e.message}`)
    }
  })

  console.log('Cleanup complete.')
}

clean().catch(console.error)
