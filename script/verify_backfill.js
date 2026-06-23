import { Storage } from '@google-cloud/storage'
import { BigQuery } from '@google-cloud/bigquery'

const storage = new Storage()
const bigquery = new BigQuery({ projectId: 'httparchive' })

// Configuration
const CONFIG = {
  bucket: 'httparchive',
  datasetId: 'reports'
}

// Test cases to run
const TEST_CASES = {
  timeseries: [
    { metric: 'bytesCss', lens: 'all', client: 'desktop', date: '2024-01-01' },
    { metric: 'offscreenImages', lens: 'wordpress', client: 'mobile', date: '2023-06-01' },
    { metric: 'cruxFastLcp', lens: 'top10k', client: 'mobile', date: '2025-02-01' },
    { metric: 'storageEstimate', lens: 'all', client: 'desktop', date: '2022-12-01' }
  ],
  histogram: [
    { metric: 'bytesTotal', lens: 'all', client: 'desktop', date: '2025-05-01' },
    { metric: 'optimizedImages', lens: 'wordpress', client: 'mobile', date: '2024-08-01' },
    { metric: 'cruxFp', lens: 'top100k', client: 'desktop', date: '2023-11-01' }
  ]
}

const lensPath = (lens) => lens === 'all' ? '' : `${lens}/`

async function runVerification() {
  console.log('=== STARTING BACKFILL VERIFICATION ===\n')

  // 1. TIMESERIES COMPARISON
  console.log('--- Timeseries Verification ---')
  for (const tc of TEST_CASES.timeseries) {
    const gcsPath = `reports/${lensPath(tc.lens)}${tc.metric}.json`
    const bqTable = `${tc.metric}_timeseries`

    console.log(`\nCase: ${tc.metric} timeseries | Lens: ${tc.lens} | Client: ${tc.client} | Date: ${tc.date}`)
    console.log(`  GCS Source: gs://${CONFIG.bucket}/${gcsPath}`)
    console.log(`  BQ Table:   reports.${bqTable}`)

    // Get GCS row
    let gcsRow
    try {
      const [content] = await storage.bucket(CONFIG.bucket).file(gcsPath).download()
      const data = JSON.parse(content.toString())
      // GCS dates are YYYY_MM_DD
      const targetGcsDate = tc.date.replace(/-/g, '_')
      gcsRow = data.find(r => r.date === targetGcsDate && r.client === tc.client)
    } catch (e) {
      console.log(`  ❌ Failed to fetch/parse GCS file: ${e.message}`)
      continue
    }

    if (!gcsRow) {
      console.log(`  ⚠️ GCS row not found for client ${tc.client} and date ${tc.date}`)
      continue
    }

    // Get BQ row
    let bqRow
    try {
      const query = `
        SELECT * FROM \`${CONFIG.datasetId}.${bqTable}\`
        WHERE date = '${tc.date}'
          AND lens = '${tc.lens}'
          AND client = '${tc.client}'
      `
      const [rows] = await bigquery.query({ query })
      bqRow = rows[0] || null
    } catch (e) {
      console.log(`  ❌ Failed to query BQ table: ${e.message}`)
      continue
    }

    if (!bqRow) {
      console.log(`  ❌ BQ row not found for client ${tc.client} and date ${tc.date}`)
      continue
    }

    // Compare fields
    console.log('  Comparing fields:')
    let allMatch = true
    const keysToCompare = Object.keys(bqRow).filter(k => !['date', 'lens', 'client', 'metric'].includes(k))

    for (const key of keysToCompare) {
      const bqVal = bqRow[key]
      const gcsVal = Number(gcsRow[key])

      // Check if both are NaN/null or match closely
      const match = (isNaN(bqVal) && isNaN(gcsVal)) || (bqVal === null && gcsVal === null) || Math.abs(bqVal - gcsVal) < 0.001
      if (match) {
        console.log(`    ✓ ${key}: GCS = ${gcsVal} | BQ = ${bqVal}`)
      } else {
        console.log(`    ✗ ${key} MISMATCH: GCS = ${gcsVal} | BQ = ${bqVal}`)
        allMatch = false
      }
    }

    if (allMatch) {
      console.log('  ✅ TIMESERIES CASE PASSES!')
    } else {
      console.log('  ❌ TIMESERIES CASE FAILS!')
    }
  }

  // 2. HISTOGRAM COMPARISON
  console.log('\n--- Histogram Verification ---')
  for (const tc of TEST_CASES.histogram) {
    const dateFolder = tc.date.replace(/-/g, '_')
    const gcsPath = `reports/${lensPath(tc.lens)}${dateFolder}/${tc.metric}.json`
    const bqTable = `${tc.metric}_histogram`

    console.log(`\nCase: ${tc.metric} histogram | Date: ${tc.date} | Lens: ${tc.lens} | Client: ${tc.client}`)
    console.log(`  GCS Source: gs://${CONFIG.bucket}/${gcsPath}`)
    console.log(`  BQ Table:   reports.${bqTable}`)

    // Get GCS rows
    let gcsRows = []
    try {
      const [content] = await storage.bucket(CONFIG.bucket).file(gcsPath).download()
      const data = JSON.parse(content.toString())
      gcsRows = data.filter(r => r.client === tc.client).sort((a, b) => Number(a.bin) - Number(b.bin))
    } catch (e) {
      console.log(`  ❌ Failed to fetch/parse GCS file: ${e.message}`)
      continue
    }

    if (!gcsRows.length) {
      console.log(`  ⚠️ GCS rows not found for client ${tc.client}`)
      continue
    }

    // Get BQ rows
    let bqRows
    try {
      const query = `
        SELECT bin, volume, pdf, cdf FROM \`${CONFIG.datasetId}.${bqTable}\`
        WHERE date = '${tc.date}'
          AND lens = '${tc.lens}'
          AND client = '${tc.client}'
        ORDER BY bin ASC
      `
      const [rows] = await bigquery.query({ query })
      bqRows = rows
    } catch (e) {
      console.log(`  ❌ Failed to query BQ table: ${e.message}`)
      continue
    }

    if (!bqRows.length) {
      console.log(`  ❌ BQ rows not found for client ${tc.client}`)
      continue
    }

    // Compare first 3 bins, last bin, and total counts
    console.log(`  Comparing histograms (GCS had ${gcsRows.length} bins | BQ has ${bqRows.length} bins):`)

    if (gcsRows.length !== bqRows.length) {
      console.log(`    ✗ Mismatch in bin count: GCS = ${gcsRows.length} | BQ = ${bqRows.length}`)
    } else {
      console.log(`    ✓ Bin counts match (${bqRows.length} bins)`)
    }

    let sampleMatch = true
    const sampleIndices = [0, 1, 2, gcsRows.length - 1].filter(idx => idx >= 0 && idx < gcsRows.length)

    for (const idx of sampleIndices) {
      const gRow = gcsRows[idx]
      const bRow = bqRows[idx]

      if (!bRow) {
        console.log(`    ✗ Index ${idx} missing in BQ`)
        sampleMatch = false
        continue
      }

      const gBin = (gRow.bin === null || gRow.bin === undefined || gRow.bin === '') ? null : Math.round(Number(gRow.bin))
      const bBin = bRow.bin
      const binMatch = gBin === bBin

      const gVol = (gRow.volume === null || gRow.volume === undefined || gRow.volume === '') ? null : Math.round(Number(gRow.volume))
      const bVol = bRow.volume
      const volMatch = gVol === bVol

      const gPdf = (gRow.pdf === null || gRow.pdf === undefined || gRow.pdf === '') ? null : Number(gRow.pdf)
      const bPdf = bRow.pdf
      const pdfMatch = (gPdf === null && bPdf === null) || Math.abs(gPdf - bPdf) < 0.0001

      const gCdf = (gRow.cdf === null || gRow.cdf === undefined || gRow.cdf === '') ? null : Number(gRow.cdf)
      const bCdf = bRow.cdf
      const cdfMatch = (gCdf === null && bCdf === null) || Math.abs(gCdf - bCdf) < 0.0001

      if (binMatch && volMatch && pdfMatch && cdfMatch) {
        console.log(`    ✓ Bin ${bRow.bin}: GCS [vol=${gRow.volume}, pdf=${gPdf !== null ? gPdf.toFixed(4) : null}, cdf=${gCdf !== null ? gCdf.toFixed(4) : null}] matches BQ [vol=${bRow.volume}, pdf=${bRow.pdf !== null ? bRow.pdf.toFixed(4) : null}, cdf=${bRow.cdf !== null ? bRow.cdf.toFixed(4) : null}]`)
      } else {
        console.log(`    ✗ Bin Mismatch at index ${idx}:`)
        console.log(`      GCS: bin=${gRow.bin}, vol=${gRow.volume}, pdf=${gRow.pdf}, cdf=${gRow.cdf}`)
        console.log(`      BQ:  bin=${bRow.bin}, vol=${bRow.volume}, pdf=${bRow.pdf}, cdf=${bRow.cdf}`)
        sampleMatch = false
      }
    }

    if (sampleMatch) {
      console.log('  ✅ HISTOGRAM CASE PASSES!')
    } else {
      console.log('  ❌ HISTOGRAM CASE FAILS!')
    }
  }
}

runVerification().catch(console.error)
