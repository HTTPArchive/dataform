import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'
import { Readable } from 'stream'

// Configuration
const CONFIG = {
  storage: { bucket: 'httparchive', prefix: 'reports/' },
  bigquery: { projectId: 'httparchive', datasetId: 'reports' },
  skipDates: []
}

// All metrics that have histogram files in GCS.
// These all share the same schema: client, date, metric, lens, bin, volume, pdf, cdf.
const METRICS = [
  'bootupJs', 'bytesCss', 'bytesFont', 'bytesHtml', 'bytesImg', 'bytesJs',
  'bytesOther', 'bytesTotal', 'bytesVideo', 'compileJs', 'cruxCls', 'cruxDcl',
  'cruxFcp', 'cruxFp', 'cruxInp', 'cruxLcp', 'cruxOl', 'cruxTtfb', 'dcl',
  'evalJs', 'fcp', 'gzipSavings', 'imgSavings', 'offscreenImages', 'ol',
  'optimizedImages', 'reqCss', 'reqFont', 'reqHtml', 'reqImg', 'reqJs',
  'reqOther', 'reqTotal', 'reqVideo', 'speedIndex', 'tcp', 'ttci'
]

// Files to retry after a failed run — add paths from "Failed tasks" output.
const BACKLOG = []
/*

*/

const storage = new Storage()
const bigquery = new BigQuery({ projectId: CONFIG.bigquery.projectId })

// GCS lens path prefix → BQ lens name (mirrors reports.js lenses config)
const lenses = ['', 'drupal/', 'magento/', 'top100k/', 'top10k/', 'top1k/', 'top1m/', 'wordpress/']
const lensName = (lensPath) => lensPath === '' ? 'all' : lensPath.replace('/', '')

// Generate dates: HTTPArchive collection schedule
function generateHTTPArchiveDates(startDate, endDate) {
  const dates = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid date format. Use YYYY-MM-DD.')
  if (start > end) throw new Error('Start date must be before or equal to end date.')

  const startYear = start.getFullYear()
  const startMonth = start.getMonth() + 1
  const endYear = end.getFullYear()
  const endMonth = end.getMonth() + 1

  for (let year = startYear; year <= endYear; year++) {
    const monthStart = year === startYear ? startMonth : 1
    const monthEnd = year === endYear ? endMonth : 12
    for (let month = monthStart; month <= monthEnd; month++) {
      const mm = String(month).padStart(2, '0')
      const d1 = `${year}-${mm}-01`
      if (d1 >= startDate && d1 <= endDate) dates.push(d1)
      // HTTPArchive collected bi-monthly before 2019
      if (year <= 2018) {
        const d15 = `${year}-${mm}-15`
        if (d15 >= startDate && d15 <= endDate) dates.push(d15)
      }
    }
  }
  return dates.sort()
}

const dates = generateHTTPArchiveDates('2011-06-01', '2025-07-01')

// Histogram schema is identical across all metrics — matches Dataform DDL exactly.
// bin/volume are INT64 (Dataform uses CAST/COUNT producing INT64).
const HISTOGRAM_SCHEMA = [
  { name: 'client', type: 'STRING' },
  { name: 'date', type: 'DATE' },
  { name: 'metric', type: 'STRING' },
  { name: 'lens', type: 'STRING' },
  { name: 'bin', type: 'INT64' },
  { name: 'volume', type: 'INT64' },
  { name: 'pdf', type: 'FLOAT64' },
  { name: 'cdf', type: 'FLOAT64' }
]

const downloadObject = async (filename) =>
  (await storage.bucket(CONFIG.storage.bucket).file(filename).download()).toString()

async function uploadToBigQuery(rows, tableId) {
  return new Promise((resolve, reject) => {
    const table = bigquery.dataset(CONFIG.bigquery.datasetId).table(tableId)
    const jsonlData = rows.map(row => JSON.stringify(row)).join('\n')
    const dataStream = Readable.from([jsonlData])

    const writeStream = table.createWriteStream({
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: HISTOGRAM_SCHEMA },
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

async function downloadAndParseFile(filename, date, lensPath, metric) {
  try {
    const data = await downloadObject(filename)
    const rows = JSON.parse(data).map(item => ({
      client: item.client,
      date,
      metric,
      lens: lensName(lensPath),
      bin: (item.bin === null || item.bin === undefined || item.bin === '') ? null : Math.round(Number(item.bin)),
      volume: (item.volume === null || item.volume === undefined || item.volume === '') ? null : Math.round(Number(item.volume)),
      pdf: (item.pdf === null || item.pdf === undefined || item.pdf === '') ? null : Number(item.pdf),
      cdf: (item.cdf === null || item.cdf === undefined || item.cdf === '') ? null : Number(item.cdf)
    }))
    return { filename, success: true, rows, rowCount: rows.length, isNotFound: false }
  } catch (error) {
    return {
      filename, success: false, rows: [], rowCount: 0,
      error: error.message,
      isNotFound: error.code === 404 || error.message.includes('No such object')
    }
  }
}

async function importMetricHistogram(metric) {
  const tableId = `${metric}_histogram`

  try {
    const table = bigquery.dataset(CONFIG.bigquery.datasetId).table(tableId)
    const [metadata] = await table.getMetadata()
    const numRows = Number(metadata.numRows)
    if (numRows > 0) {
      console.log(`=== Skipping ${metric} (table reports.${tableId} already has ${numRows.toLocaleString()} rows) ===`)
      return { metric, totalRows: numRows, totalSuccess: 0, totalNotFound: 0, totalErrors: 0, allFailedTasks: [] }
    }
  } catch (error) {
    if (error.code !== 404) {
      console.warn(`  Warning checking metadata for ${tableId}: ${error.message}`)
    }
  }

  console.log(`=== Starting ${metric} → reports.${tableId} ===`)

  let totalSuccess = 0, totalNotFound = 0, totalErrors = 0
  const allFailedTasks = []
  let totalUploadedRows = 0

  // Chunk dates into groups of 15
  const dateChunks = []
  const chunkSize = 15
  for (let i = 0; i < dates.length; i += chunkSize) {
    dateChunks.push(dates.slice(i, i + chunkSize))
  }

  for (let chunkIdx = 0; chunkIdx < dateChunks.length; chunkIdx++) {
    const chunkDates = dateChunks[chunkIdx]
    const tasks = []
    for (const date of chunkDates) {
      if (CONFIG.skipDates.includes(date)) continue
      for (const lensPath of lenses) {
        const filename = `${CONFIG.storage.prefix}${lensPath}${date.replace(/-/g, '_')}/${metric}.json`
        tasks.push({ filename, date, lensPath, metric })
      }
    }

    if (!tasks.length) continue

    // Download files in this chunk concurrently with a limit of 40
    const results = await mapLimit(tasks, 40, async (task) => {
      return downloadAndParseFile(task.filename, task.date, task.lensPath, task.metric)
    })

    const chunkRows = []
    for (const r of results) {
      if (r.success) {
        for (const row of r.rows) {
          chunkRows.push(row)
        }
        totalSuccess++
      } else if (r.isNotFound) {
        totalNotFound++
      } else {
        totalErrors++
        allFailedTasks.push(r.filename)
        console.error(`  ✗ ${r.filename}: ${r.error}`)
      }
    }

    if (chunkRows.length > 0) {
      try {
        await uploadToBigQuery(chunkRows, tableId)
        totalUploadedRows += chunkRows.length
      } catch (error) {
        console.error(`  ✗ ERROR uploading chunk ${chunkIdx + 1}/${dateChunks.length} to ${tableId}: ${error.message}`)
        totalErrors += totalSuccess
        for (const r of results) {
          if (r.success) allFailedTasks.push(r.filename)
        }
      }
    }
  }

  if (totalUploadedRows > 0) {
    console.log(`  ✓ ${metric}: completed uploading ${totalUploadedRows.toLocaleString()} rows total (${totalSuccess} lenses found, ${totalNotFound} not found, ${totalErrors} errors)`)
  } else {
    console.log(`  ${metric}: no data found`)
  }

  if (allFailedTasks.length) {
    console.log(`  Failed tasks for ${metric}:`)
    allFailedTasks.forEach(f => console.log(`    '${f}',`))
  }

  return { metric, totalRows: totalUploadedRows, totalSuccess, totalNotFound, totalErrors, allFailedTasks }
}

async function processBacklog() {
  if (!BACKLOG.length) return
  console.log(`\nProcessing ${BACKLOG.length} backlog files...`)
  let ok = 0, fail = 0

  await mapLimit(BACKLOG, 10, async (filename) => {
    const match = filename.match(/reports\/(?:([^/]+)\/)?(\d{4}_\d{2}_\d{2})\/(.+?)(?:\.json)?$/)
    if (!match) { console.log(`✗ ${filename}: invalid format`); fail++; return }

    const [, lensPath = '', dateStr, metric] = match
    const date = dateStr.replace(/_/g, '-')
    const fullFilename = filename.endsWith('.json') ? filename : `${filename}.json`
    const result = await downloadAndParseFile(fullFilename, date, lensPath, metric)

    if (result.success && result.rows.length > 0) {
      try {
        await uploadToBigQuery(result.rows, `${metric}_histogram`)
        console.log(`✓ ${filename} (${result.rowCount} rows)`)
        ok++
      } catch (e) {
        console.log(`✗ ${filename}: ${e.message}`)
        fail++
      }
    } else {
      console.log(`✗ ${filename}: ${result.error}`)
      fail++
    }
  })
  console.log(`Backlog: ${ok} ok, ${fail} failed\n`)
}

async function importHistogramData() {
  if (BACKLOG.length > 0) {
    await processBacklog()
    console.log('Backlog processed. Exiting backlog-only mode.')
    return
  }

  console.log('Starting parallel histogram backfill...')
  // Process 3 metrics at a time in parallel
  await mapLimit(METRICS, 3, importMetricHistogram)

  console.log('\n=== All histogram metrics complete ===')
}

importHistogramData().catch(console.error)
