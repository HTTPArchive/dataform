const { BigQueryExport } = require('./bigquery')
const { StorageExport } = require('./storage')
const { FirestoreBatch } = require('./firestore')

const reportsConfigs = {
  storagePath: 'httparchive/reports/',
  reports: ['bytesTotal']
}
const cwvTechReportsConfigs = {
  reports: ['adoption', 'core_web_vitals', 'lighthouse', 'page_weight'],
  dicts: ['categories', 'technologies']
}
const currentMonth = new Date().toISOString().slice(0, 10)

class ReportsExporter {
  constructor () {
    this.bigquery = new BigQueryExport()
    this.storage = new StorageExport('httparchive')
  }

  // export timeseries reports
  async exportTimeseries (reportId) {
    const query = `SELECT * FROM reports_timeseries.${reportId}`
    const rows = await this.bigquery.query(query)

    console.log(rows[0])
    console.log(`${reportsConfigs.storagePath}${reportId}.json`)
    // await this.storage.exportToJson(rows, `${reports.storagePath}${reportId}.json`)
  }

  // export monthly histogram report
  async exportHistogram (reportId) {
    const query = `SELECT * FROM reports_histogram.${reportId} WHERE date = '${currentMonth}'`

    console.log(query)
    const rows = await this.bigquery.query(query)

    console.log(rows[0])
    console.log(`${reportsConfigs.storagePath}${currentMonth.replaceAll('-', '')}${reportId}.json`)
    // await this.storage.exportToJson(rows, `${reports.storagePath}${currentMonth.replaceAll('-', '')}${reportId}.json`)
  }

  async export () {
    for (const reportId of reportsConfigs.reports) {
      await this.exportTimeseries(reportId)
      await this.exportHistogram(reportId)
    }
  }
}

class TechReportsExporter {
  constructor () {
    this.bigquery = new BigQueryExport()
    this.firestore = new FirestoreBatch('tech-report-apis-dev') // TODO change to prod
  }

  async exportDicts () {
    for (const dictId of cwvTechReportsConfigs.dicts) {
      const query = `SELECT * FROM reports_cwv_tech.${dictId}`
      const rows = await this.bigquery.query(query)
      await this.firestore.export(dictId, rows)
    }
  }

  async exportReports () {
    for (const reportId of cwvTechReportsConfigs.reports) {
      const query = `SELECT * FROM httparchive.reports_cwv_tech.${reportId} WHERE date = '${currentMonth}'`
      const rows = await this.bigquery.query(query)
      await this.firestore.batch(reportId, rows)
    }
  }

  async export () {
    await this.exportDicts()
    await this.exportReports()
  }
}

module.exports = {
  TechReportsExporter,
  ReportsExporter
}
