import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'
import { Readable } from 'stream'

// Configuration
const CONFIG = {
  storage: { bucket: 'httparchive', prefix: 'reports/' },
  bigquery: { projectId: 'httparchive', datasetId: 'reports', tableId: 'histogram1' },
  skipDates: []
}

const BACKLOG = []
/*

*/

const storage = new Storage()
const bigquery = new BigQuery({ projectId: CONFIG.bigquery.projectId })

const lenses = ['', 'drupal/', 'magento/', 'top100k/', 'top10k/', 'top1k/', 'top1m/', 'wordpress/']

// Generate dates: HTTPArchive collection schedule
function generateHTTPArchiveDates(startDate, endDate) {
  const dates = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Validate dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD format.')
  }

  if (start > end) {
    throw new Error('Start date must be before or equal to end date.')
  }

  const startYear = start.getFullYear()
  const startMonth = start.getMonth() + 1
  const endYear = end.getFullYear()
  const endMonth = end.getMonth() + 1

  for (let year = startYear; year <= endYear; year++) {
    const monthStart = (year === startYear) ? startMonth : 1
    const monthEnd = (year === endYear) ? endMonth : 12

    for (let month = monthStart; month <= monthEnd; month++) {
      const monthStr = String(month).padStart(2, '0')

      // Always include 1st of month
      const firstDate = `${year}-${monthStr}-01`
      if (firstDate >= startDate && firstDate <= endDate) {
        dates.push(firstDate)
      }

      // Add 15th for years 2010-2018 (HTTPArchive historical pattern)
      if (year <= 2018) {
        const fifteenthDate = `${year}-${monthStr}-15`
        if (fifteenthDate >= startDate && fifteenthDate <= endDate) {
          dates.push(fifteenthDate)
        }
      }
    }
  }

  return dates.sort()
}

const dates = generateHTTPArchiveDates('2011-06-01', '2025-07-01')

const histogramMetrics = [
  'bytesCss', 'bytesImg', 'bytesJs', 'bytesOther', 'bytesTotal', 'evalJs', 'gzipSavings', 'speedIndex', 'dcl',
  'bootupJs', 'bytesFont', 'bytesHtml', 'bytesVideo', 'compileJs', 'fcp', 'imgSavings', 'offscreenImages', 'ol',
  'optimizedImages', 'reqCss', 'reqFont', 'reqHtml', 'reqImg', 'reqJs', 'reqOther', 'reqTotal', 'reqVideo',
  'tcp', 'ttci', 'cruxTtfb', 'cruxOl', 'cruxLcp', 'cruxInp', 'cruxFp', 'cruxFcp', 'cruxDcl', 'cruxCls'
]

const SCHEMA = [
  { name: 'date', type: 'DATE' },
  { name: 'lens', type: 'STRING' },
  { name: 'client', type: 'STRING' },
  { name: 'metric', type: 'STRING' },
  { name: 'bin', type: 'FLOAT64' },
  { name: 'volume', type: 'FLOAT64' },
  { name: 'cdf', type: 'FLOAT64' },
  { name: 'pdf', type: 'FLOAT64' }
]

const downloadObject = async (filename) =>
  (await storage.bucket(CONFIG.storage.bucket).file(filename).download()).toString()

async function uploadToBigQuery(rows) {
  return new Promise((resolve, reject) => {
    const table = bigquery.dataset(CONFIG.bigquery.datasetId).table(CONFIG.bigquery.tableId)
    const jsonlData = rows.map(row => JSON.stringify(row)).join('\n')
    const dataStream = Readable.from([jsonlData])

    const writeStream = table.createWriteStream({
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: SCHEMA },
      writeDisposition: 'WRITE_APPEND',
      createDisposition: 'CREATE_IF_NEEDED'
    })

    writeStream.on('complete', () => {
      resolve()
    })

    writeStream.on('error', (error) => {
      console.error('Upload failed:', error.message)
      reject(error)
    })

    dataStream.on('error', (error) => {
      console.error('Source stream error during upload:', error.message)
      reject(error)
    })

    dataStream.pipe(writeStream)
  })
}

async function downloadAndParseFile(filename, date, lens, metric) {
  try {
    const data = await downloadObject(filename)
    const rows = JSON.parse(data).map(item => ({
      date,
      lens: lens.replace('/', ''),
      client: item.client,
      metric,
      bin: item.bin,
      volume: item.volume,
      cdf: item.cdf,
      pdf: item.pdf
    }))

    return {
      filename,
      success: true,
      rows,
      rowCount: rows.length,
      error: null,
      isNotFound: false
    }
  } catch (error) {
    return {
      filename,
      success: false,
      rows: [],
      rowCount: 0,
      error: error.message,
      isNotFound: error.code === 404 || error.message.includes('No such object')
    }
  }
}

async function processBacklogFile(filename) {
  // Extract metadata from filename: reports/[lens]/YYYY_MM_DD/metric.json
  const match = filename.match(/reports\/(?:([^/]+)\/)?(\d{4}_\d{2}_\d{2})\/(.+?)(?:\.json)?$/)
  if (!match) {
    console.error(`Invalid backlog filename format: ${filename}`)
    return { filename, success: false, error: 'Invalid format' }
  }

  const [, lensPath = '', dateStr, metric] = match
  const date = dateStr.replace(/_/g, '-')
  const lens = lensPath

  // Ensure filename has .json extension
  const fullFilename = filename.endsWith('.json') ? filename : `${filename}.json`

  const result = await downloadAndParseFile(fullFilename, date, lens, metric)

  // For backlog processing, upload immediately (single files)
  if (result.success && result.rows.length > 0) {
    try {
      await uploadToBigQuery(result.rows)
      return { ...result, uploaded: true }
    } catch (error) {
      return { ...result, success: false, error: error.message, uploaded: false }
    }
  }

  return result
}

async function processImportTask(task) {
  const { date, lens, metric, filename } = task
  const result = await downloadAndParseFile(filename, date, lens, metric)

  return {
    ...task,
    ...result
  }
}

async function processBacklog() {
  if (!BACKLOG || BACKLOG.length === 0) {
    console.log('No backlog files to process')
    return
  }

  console.log(`\nProcessing ${BACKLOG.length} backlog files...`)

  let successCount = 0
  let failCount = 0

  for (const filename of BACKLOG) {
    const result = await processBacklogFile(filename)

    if (result.success) {
      console.log(`✓ ${result.filename} (${result.rowCount} rows)`)
      successCount++
    } else {
      console.log(`✗ ${result.filename}: ${result.error}`)
      failCount++
    }
  }

  console.log(`\nBacklog completed: ${successCount} successful, ${failCount} failed\n`)
}

async function processDateData(date) {
  console.log(`\nProcessing date: ${date}`)

  const allRows = []
  let totalSuccess = 0
  let totalNotFound = 0
  let totalErrors = 0
  const failedTasks = []

  // Process each metric sequentially
  for (const metric of histogramMetrics) {
    console.log(`  Processing metric: ${metric} (${histogramMetrics.indexOf(metric) + 1}/${histogramMetrics.length})`)

    // Download all lenses for this metric in parallel
    const lensPromises = lenses.map(async (lens) => {
      const filename = `${CONFIG.storage.prefix}${lens}${date.replace(/-/g, '_')}/${metric}.json`
      const task = {
        date,
        lens,
        metric,
        filename,
        id: `${date}-${lens || 'all'}-${metric}`
      }

      return await processImportTask(task)
    })

    const results = await Promise.allSettled(lensPromises)

    // Process results for this metric
    let metricSuccess = 0
    let metricNotFound = 0
    let metricErrors = 0

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const taskResult = result.value
        if (taskResult.success) {
          // Use concat to avoid stack overflow with large arrays
          for (const row of taskResult.rows) {
            allRows.push(row)
          }
          metricSuccess++
          totalSuccess++
        } else if (taskResult.isNotFound) {
          metricNotFound++
          totalNotFound++
        } else {
          metricErrors++
          totalErrors++
          failedTasks.push(taskResult.filename)
          console.error(`    ✗ ${taskResult.id}: ${taskResult.error}`)
        }
      } else {
        metricErrors++
        totalErrors++
        const lens = lenses[index]
        const filename = `${CONFIG.storage.prefix}${lens}${date.replace(/-/g, '_')}/${metric}.json`
        failedTasks.push(filename)
        console.error(`    ✗ ${date}-${lens || 'all'}-${metric}: ${result.reason?.message || 'Unknown error'}`)
      }
    })

    console.log(`    ${metricSuccess} success, ${metricNotFound} not found, ${metricErrors} errors`)
  }

  console.log(`  Total files: ${totalSuccess} success, ${totalNotFound} not found, ${totalErrors} errors`)

  // Upload all data for this date in a single operation
  if (allRows.length > 0) {
    console.log(`  Uploading ${allRows.length.toLocaleString()} rows to BigQuery...`)
    try {
      await uploadToBigQuery(allRows)
      console.log(`  ✓ Successfully uploaded all data for ${date}`)
    } catch (error) {
      console.error(`  ✗ Failed to upload data for ${date}: ${error.message}`)
      // Add all successful downloads to failed tasks since upload failed
      for (const lens of lenses) {
        for (const metric of histogramMetrics) {
          const filename = `${CONFIG.storage.prefix}${lens}${date.replace(/-/g, '_')}/${metric}.json`
          if (!failedTasks.includes(filename)) {
            failedTasks.push(filename)
          }
        }
      }
    }
  } else {
    console.log(`  No data to upload for ${date}`)
  }

  return {
    date,
    successCount: totalSuccess,
    notFoundCount: totalNotFound,
    errorCount: totalErrors,
    totalRows: allRows.length,
    failedTasks
  }
}

async function importHistogramData() {
  // Process backlog first
  await processBacklog()

  console.log(`Processing ${dates.length} dates`)

  let totalSuccess = 0
  let totalNotFound = 0
  let totalErrors = 0
  let totalRows = 0
  const allFailedTasks = []

  for (const date of dates) {
    if (CONFIG.skipDates.includes(date)) {
      console.log(`Skipping date: ${date}`)
      continue
    }

    const dateResult = await processDateData(date)

    totalSuccess += dateResult.successCount
    totalNotFound += dateResult.notFoundCount
    totalErrors += dateResult.errorCount
    totalRows += dateResult.totalRows
    allFailedTasks.push(...dateResult.failedTasks)
  }

  console.log('\n=== FINAL SUMMARY ===')
  console.log(`Dates processed: ${dates.filter(d => !CONFIG.skipDates.includes(d)).length}`)
  console.log(`Total files successful: ${totalSuccess}`)
  console.log(`Total files not found: ${totalNotFound}`)
  console.log(`Total files with errors: ${totalErrors}`)
  console.log(`Total rows uploaded: ${totalRows.toLocaleString()}`)

  if (allFailedTasks.length > 0) {
    console.log('\n=== FAILED TASKS (for BACKLOG) ===')
    allFailedTasks.forEach(filename => console.log(`  '${filename}',`))
  }
}

importHistogramData().catch(console.error)
