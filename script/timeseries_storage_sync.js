import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'
import { Readable } from 'stream'

const storage = new Storage()
const bigquery = new BigQuery({ projectId: 'httparchive' })

const CONFIG = {
  bucket: 'httparchive',
  prefix: 'reports/',
  datasetId: 'reports'
}

// All metrics that have timeseries files in GCS.
// Schema is auto-detected from GCS data — no need to classify manually.
// Some metrics only exist as timeseries (no histogram counterpart), and vice versa.
const METRICS = [
  'a11yButtonName', 'a11yColorContrast', 'a11yImageAlt', 'a11yLabel', 'a11yLinkName', 'a11yScores',
  'asyncClipboardRead', 'badgeClear', 'badgeSet', 'bootupJs', 'bytesCss', 'bytesFont', 'bytesHtml',
  'bytesImg', 'bytesJs', 'bytesOther', 'bytesTotal', 'bytesVideo', 'canonical', 'compileJs',
  'contentIndex', 'cruxFastDcl', 'cruxFastFcp', 'cruxFastFp', 'cruxFastInp', 'cruxFastLcp',
  'cruxFastOl', 'cruxFastTtfb', 'cruxLargeCls', 'cruxPassesCWV', 'cruxSlowFcp', 'cruxSlowInp',
  'cruxSlowLcp', 'cruxSlowTtfb', 'cruxSmallCls', 'dcl', 'evalJs', 'fcp', 'fontDisplay',
  'getInstalledRelatedApps', 'gzipSavings', 'h2', 'h3', 'hreflang', 'idleDetection', 'imgLazy',
  'imgSavings', 'legible', 'linkText', 'notificationTriggers', 'numUrls', 'offscreenImages', 'ol',
  'optimizedImages', 'pctHttps', 'periodicBackgroundSync', 'periodicBackgroundSyncRegister',
  'quicTransport', 'reqCss', 'reqFont', 'reqHtml', 'reqImg', 'reqJs', 'reqOther', 'reqTotal',
  'reqVideo', 'screenWakeLock', 'speedIndex', 'storageEstimate', 'storagePersist',
  'swControlledPages', 'tcp', 'ttci', 'webSocketStream'
]

// GCS lens path prefix → BQ lens name (mirrors reports.js lenses config)
const lenses = ['', 'drupal/', 'magento/', 'top100k/', 'top10k/', 'top1k/', 'top1m/', 'wordpress/']
const lensName = (lensPath) => lensPath === '' ? 'all' : lensPath.replace('/', '')

// Reserved GCS columns that are NOT stored in BQ
// (timestamp is derived from date; date is reformatted)
const EXCLUDE_KEYS = new Set(['client', 'date', 'timestamp'])

async function downloadObject(srcFilename) {
  const contents = await storage.bucket(CONFIG.bucket).file(srcFilename).download()
  return contents.toString()
}

/**
 * Infer BQ schema from the first row of GCS data.
 * Fixed columns: client STRING, date DATE, metric STRING, lens STRING.
 * Variable columns: everything else (except timestamp/date/client) → FLOAT64.
 * All GCS numeric values are strings, so we parse as float.
 */
function inferSchema(sampleRow) {
  const fixedFields = [
    { name: 'client', type: 'STRING' },
    { name: 'date', type: 'DATE' },
    { name: 'metric', type: 'STRING' },
    { name: 'lens', type: 'STRING' }
  ]

  const metricFields = Object.keys(sampleRow)
    .filter(k => !EXCLUDE_KEYS.has(k))
    .map(k => ({ name: k, type: 'FLOAT64' }))

  return { fields: [...fixedFields, ...metricFields], metricKeys: metricFields.map(f => f.name) }
}

/**
 * Map a GCS row to a BQ row.
 * GCS date format: YYYY_MM_DD → BQ DATE: YYYY-MM-DD
 * GCS numeric values are strings → Number()
 */
function mapRow(item, lensPath, metricId, metricKeys) {
  const row = {
    client: item.client,
    date: item.date.replace(/_/g, '-'),
    metric: metricId,
    lens: lensName(lensPath)
  }
  for (const key of metricKeys) {
    row[key] = Number(item[key])
  }
  return row
}

async function uploadToBigQuery(rows, tableId, schemaFields) {
  return new Promise((resolve, reject) => {
    const table = bigquery.dataset(CONFIG.datasetId).table(tableId)
    const jsonlData = rows.map(row => JSON.stringify(row)).join('\n')
    const dataStream = Readable.from([jsonlData])

    const writeStream = table.createWriteStream({
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: schemaFields },
      writeDisposition: 'WRITE_APPEND',
      createDisposition: 'CREATE_IF_NEEDED'
    })

    writeStream.on('complete', () => resolve())
    writeStream.on('error', reject)
    dataStream.on('error', reject)
    dataStream.pipe(writeStream)
  })
}

// Concurrency helper
async function mapLimit(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

async function importMetricTimeseries(metricId) {
  const tableId = `${metricId}_timeseries`
  console.log(`=== Starting ${metricId} → reports.${tableId} ===`)

  let schemaFields = null
  let metricKeys = null
  let allRows = []
  let notFoundCount = 0, errorCount = 0
  const failedFiles = []

  // Download all lenses in parallel
  const downloadPromises = lenses.map(async (lensPath) => {
    const srcFilename = `${CONFIG.prefix}${lensPath}${metricId}.json`
    try {
      const data = await downloadObject(srcFilename)
      const parsed = JSON.parse(data)
      return { lensPath, parsed, srcFilename }
    } catch (error) {
      if (error.code === 404 || error.message.includes('No such object')) {
        notFoundCount++
      } else {
        console.error(`  ERROR downloading ${srcFilename}: ${error.message}`)
        errorCount++
        failedFiles.push(srcFilename)
      }
      return null
    }
  })

  const downloadResults = await Promise.all(downloadPromises)

  // Find the first non-empty parsed result to infer schema
  for (const res of downloadResults) {
    if (res && res.parsed && res.parsed.length) {
      const inferred = inferSchema(res.parsed[0])
      schemaFields = inferred.fields
      metricKeys = inferred.metricKeys
      break
    }
  }

  if (!schemaFields) {
    console.log(`  ${metricId}: no data found for any lens — skipping`)
    return { metricId, totalRows: 0, notFoundCount, errorCount }
  }

  for (const res of downloadResults) {
    if (!res || !res.parsed || !res.parsed.length) continue
    const rows = res.parsed.map(item => mapRow(item, res.lensPath, metricId, metricKeys))
    for (const row of rows) {
      allRows.push(row)
    }
  }

  if (allRows.length > 0) {
    try {
      await uploadToBigQuery(allRows, tableId, schemaFields)
      console.log(`  ✓ ${metricId}: uploaded ${allRows.length} rows [schema: ${metricKeys.join(', ')}]`)
    } catch (error) {
      console.error(`  ✗ ERROR uploading ${tableId}: ${error.message}`)
      errorCount++
      for (const res of downloadResults) {
        if (res && res.parsed && res.parsed.length) {
          failedFiles.push(res.srcFilename)
        }
      }
    }
  }

  return { metricId, totalRows: allRows.length, notFoundCount, errorCount }
}

async function importTimeseriesData() {
  console.log('Starting parallel timeseries backfill...')
  const results = await mapLimit(METRICS, 5, importMetricTimeseries)

  console.log('\n=== FINAL SUMMARY ===')
  const withData = results.filter(r => r.totalRows > 0)
  const noData = results.filter(r => r.totalRows === 0 && r.errorCount === 0)
  const withErrors = results.filter(r => r.errorCount > 0)

  for (const r of withData) {
    console.log(`  ✓ ${r.metricId}: ${r.totalRows.toLocaleString()} rows`)
  }
  if (noData.length) {
    console.log(`\n  No data (not in GCS): ${noData.map(r => r.metricId).join(', ')}`)
  }
  if (withErrors.length) {
    console.log('\n  Errors:')
    withErrors.forEach(r => console.log(`  ✗ ${r.metricId}: ${r.errorCount} errors`))
  }

  const totalRows = results.reduce((s, r) => s + r.totalRows, 0)
  console.log(`\nTotal: ${totalRows.toLocaleString()} rows across ${withData.length} metrics`)
}

importTimeseriesData().catch(console.error)
