import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'

const storage = new Storage()
const bucketName = 'httparchive'
const storagePathPrefix = 'reports/'

const bigquery = new BigQuery({ projectId: 'httparchive' })
const datasetId = 'reports'
const tableId = 'gcs_export'

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

const dates = (function () {
  const dates = []
  for (let year = 2016; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      dates.push(`${year}_${String(month).padStart(2, '0')}_01`)
      if (year <= 2018) {
        dates.push(`${year}_${String(month).padStart(2, '0')}_15`)
      }
      if (year === 2025 && month === 1) {
        break
      }
    }
  }
  return dates
})()

const histogramMetrics = new Set(
  'bytesCss',
  'bytesFont',
  'bytesHtml',
  'bytesImg',
  'bytesJs',
  'bytesOther',
  'bytesTotal',
  'bytesVideo',
  'compileJs',
  'dcl',
  'evalJs',
  'fcp',
  'gzipSavings',
  'imgSavings',
  'ol',
  'reqCss',
  'reqFont',
  'reqHtml',
  'reqImg',
  'reqJs',
  'reqOther',
  'reqTotal',
  'reqVideo',
  'speedIndex',
  'tcp',
  'bootupJs',
  'offscreenImages',
  'optimizedImages',
  'ttci',
  'ttfi',
  'vulnJs',
  'cruxCls',
  'cruxDcl',
  'cruxFcp',
  'cruxFid',
  'cruxFp',
  'cruxLcp',
  'cruxOl',
  'htmlElementPopularity',
  'cruxInp',
  'cruxTtfb')

async function downloadObject (bucketName, srcFilename) {
  const contents = await storage.bucket(bucketName).file(srcFilename).download()

  return contents.toString()
}

async function uploadToBigQuery (rows, schema) {
  try {
    await bigquery.dataset(datasetId).table(tableId).insert(rows, { schema })
  } catch (error) {
    if (error.name === 'PartialFailureError') {
      console.error('Partial failure error:', error)
      error.errors.forEach(err => {
        console.error('Row:', JSON.stringify(err.row))
        console.error('Errors:', JSON.stringify(err.errors))
      })
    } else {
      throw error
    }
  }
}

async function importHistogramData () {
  for (const lens of lenses) {
    for (const metric of histogramMetrics) {
      for (const date of dates) {
        const srcFilename = `${storagePathPrefix}${lens}${date}/${metric}.json`

        console.log(`Downloading ${srcFilename}`)

        const data = await downloadObject(bucketName, srcFilename)

        const rows = JSON.parse(data).map(data => ({
          date: date.replace(/_/g, '-'),
          lens: lens.replace('/', ''),
          metric,
          data: JSON.stringify(data)
        }))

        const schema = [
          { name: 'date', type: 'DATE' },
          { name: 'lens', type: 'STRING' },
          { name: 'metric', type: 'STRING' },
          { name: 'data', type: 'JSON' }
        ]

        console.log(`Uploading ${rows.length} rows to BigQuery`)

        await uploadToBigQuery(rows, schema)
      }
    }
  }
}

importHistogramData().catch(console.error)
