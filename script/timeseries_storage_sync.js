import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'
import { Readable } from 'stream'

const storage = new Storage()
const bucketName = 'httparchive'
const storagePathPrefix = 'reports/'

const bigquery = new BigQuery({ projectId: 'httparchive' })
const datasetId = 'reports'
const tableId = 'timeseries'

const lenses = [
  '',
  'drupal/',
  'magento/',
  'top100k/',
  'top10k/',
  'top1k/',
  'top1m/',
  'wordpress/'
]

const histogramMetrics = new Set([
  'a11yButtonName',
  'a11yColorContrast',
  'a11yImageAlt',
  'a11yLabel',
  'a11yLinkName',
  'a11yScores',
  'asyncClipboardRead',
  'badgeClear',
  'badgeSet',
  'bootupJs',
  'bytesCss',
  'bytesFont',
  'bytesHtml',
  'bytesImg',
  'bytesJs',
  'bytesOther',
  'bytesTotal',
  'bytesVideo',
  'canonical',
  'contentIndex',
  'cruxFastDcl',
  'cruxFastFcp',
  'cruxFastFp',
  'cruxFastInp',
  'cruxFastLcp',
  'cruxFastOl',
  'cruxFastTtfb',
  'cruxLargeCls',
  'cruxPassesCWV',
  'cruxSlowFcp',
  'cruxSlowInp',
  'cruxSlowLcp',
  'cruxSlowTtfb',
  'cruxSmallCls',
  'dcl',
  'fcp',
  'fontDisplay',
  'getInstalledRelatedApps',
  'gzipSavings',
  'h2',
  'h3',
  'hreflang',
  'idleDetection',
  'imgLazy',
  'imgSavings',
  'legible',
  'linkText',
  'notificationTriggers',
  'numUrls',
  'offscreenImages',
  'ol',
  'optimizedImages',
  'pctHttps',
  'periodicBackgroundSync',
  'periodicBackgroundSyncRegister',
  'quicTransport',
  'reqCss',
  'reqFont',
  'reqHtml',
  'reqImg',
  'reqJs',
  'reqOther',
  'reqTotal',
  'reqVideo',
  'screenWakeLock',
  'speedIndex',
  'storageEstimate',
  'storagePersist',
  'swControlledPages',
  'tcp',
  'ttci',
  'webSocketStream'
])

async function downloadObject(bucketName, srcFilename) {
  const contents = await storage.bucket(bucketName).file(srcFilename).download()

  return contents.toString()
}

async function ensureTableExists() {
  const schema = [
    { name: 'date', type: 'DATE' },
    { name: 'client', type: 'STRING' },
    { name: 'lens', type: 'STRING' },
    { name: 'metric', type: 'STRING' },
    { name: 'percent', type: 'FLOAT64' }
  ]

  const table = bigquery.dataset(datasetId).table(tableId)

  try {
    const [exists] = await table.exists()
    if (!exists) {
      console.log(`Creating table ${datasetId}.${tableId}`)
      await table.create({
        schema: schema,
        location: 'US',
        timePartitioning: {
          type: 'DAY',
          field: 'date'
        },
        clustering: {
          fields: ['client', 'lens']
        }
      })
      console.log(`Table ${datasetId}.${tableId} created successfully with partitioning and clustering`)
    } else {
      console.log(`Table ${datasetId}.${tableId} already exists`)
    }
  } catch (error) {
    console.error('Error checking/creating table:', error)
    throw error
  }
}

async function uploadToBigQuery(rows) {
  const schema = [
    { name: 'date', type: 'DATE' },
    { name: 'client', type: 'STRING' },
    { name: 'lens', type: 'STRING' },
    { name: 'metric', type: 'STRING' },
    { name: 'percent', type: 'FLOAT64' }
  ]

  return new Promise((resolve, reject) => {
    try {
      const table = bigquery.dataset(datasetId).table(tableId)

      // Convert rows to JSONL format
      const jsonlData = rows.map(row => JSON.stringify(row)).join('\n')

      // Create a readable stream from the JSONL data
      const dataStream = Readable.from([jsonlData])

      // Create write stream with metadata
      const writeStream = table.createWriteStream({
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        schema: {
          fields: schema
        },
        writeDisposition: 'WRITE_APPEND',
        createDisposition: 'CREATE_NEVER' // Table should already exist
      })

      // Handle events
      writeStream.on('job', (job) => {
        console.log(`Write stream job ${job.id} started`)
      })

      writeStream.on('complete', (job) => {
        //console.log(`Write stream job ${job.id} completed successfully`)
        console.log(`Successfully uploaded ${rows.length} rows using write stream`)
        resolve(job)
      })

      writeStream.on('error', (error) => {
        console.error('Error in write stream:', error)
        reject(error)
      })

      // Pipe the data stream to the write stream
      dataStream.pipe(writeStream)

    } catch (error) {
      console.error('Error setting up write stream:', error)
      reject(error)
    }
  })
}

async function importHistogramData() {
  // Ensure the destination table exists before importing data
  await ensureTableExists()

  for (const metric of histogramMetrics) {
    for (const lens of lenses) {
      const srcFilename = `${storagePathPrefix}${lens}${metric}.json`
      console.log(`Downloading ${srcFilename}`)

      try {
        const data = await downloadObject(bucketName, srcFilename)

        const rows = JSON.parse(data).map(data => ({
          date: data.date.replace(/_/g, '-'),
          client: data.client,
          lens: lens.replace('/', ''),
          metric,
          percent: data.percent
        }))

        console.log(`Uploading ${rows.length} rows to BigQuery`)

        await uploadToBigQuery(rows)
      } catch (error) {
        if (error.code === 404 || error.message.includes('No such object')) {
          console.log(`File not found: ${srcFilename} - skipping`)
          continue
        } else {
          console.error(`Error processing ${srcFilename}:`, error.message)
          // Continue with next file instead of stopping
          continue
        }
      }
      //break // TEMP: only do first metric
    }
    //break // TEMP: only do first lens
  }
}

importHistogramData().catch(console.error)
