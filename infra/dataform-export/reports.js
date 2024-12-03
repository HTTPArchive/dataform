const { BigQueryExport } = require('./bigquery')
const { StorageExport } = require('./storage')
const { FirestoreBatch } = require('./firestore')

class ReportsExporter {
  constructor () {
    this.bigquery = new BigQueryExport()
    this.storage = new StorageExport('httparchive')
    this.storagePath = 'reports/dev/' // TODO change to prod
  }

  // export timeseries reports
  async exportTimeseries (exportData) {
    const metric = exportData.name
    const query = `
SELECT
  FORMAT_DATE('%Y_%m_%d', date) AS date,
  * EXCEPT(date)
FROM reports.${metric}_timeseries
`
    const rows = await this.bigquery.query(query)
    await this.storage.exportToJson(rows, `${this.storagePath}${metric}.json`)
  }

  // export monthly histogram report
  async exportHistogram (exportData) {
    const metric = exportData.name
    const date = exportData.date

    const query = `
SELECT * EXCEPT(date)
FROM reports.${metric}_histogram
WHERE date = '${date}'
`
    const rows = await this.bigquery.query(query)
    await this.storage.exportToJson(rows, `${this.storagePath}${date.replaceAll('-', '_')}/${metric}.json`)
  }

  async export (exportData) {
    if (exportData.dataform_trigger !== 'report_complete') {
      console.error('Invalid dataform trigger')
      return
    }

    if (exportData.type === 'histogram') {
      await this.exportHistogram(exportData)
    } else if (exportData.type === 'timeseries') {
      await this.exportTimeseries(exportData)
    } else {
      console.error('Invalid report type')
    }
  }
}

class TechReportsExporter {
  constructor () {
    this.bigquery = new BigQueryExport()
    this.firestore = new FirestoreBatch(
      'tech-report-apis-dev' // TODO: change to prod
    )
  }

  async exportDicts (exportData) {
    console.log('Exporting dicts')
    const dictName = exportData.name
    const query = `
SELECT *
FROM reports.cwv_tech_${dictName}
`

    const rows = await this.bigquery.query(query)
    console.log('Exporting ' + rows.length + ' rows for ' + dictName)
    await this.firestore.export(exportData, rows)
  }

  async exportReports (exportData) {
    const metric = exportData.name
    const date = exportData.date
    const query = `
SELECT
  STRING(date) AS date,
  * EXCEPT(date)
FROM httparchive.reports.cwv_tech_${metric}
WHERE date = '${date}'
`
    const rows = await this.bigquery.query(query)
    console.log('Exporting ' + rows.length + ' rows for ' + metric + ' on ' + date)
    await this.firestore.export(exportData, rows)
  }

  async export (exportData) {
    if (exportData.dataform_trigger !== 'report_cwv_tech_complete') {
      console.error('Invalid dataform trigger')
      return
    }

    if (exportData.type === 'report') {
      await this.exportReports(exportData)
    } else if (exportData.type === 'dict') {
      await this.exportDicts(exportData)
    } else {
      console.error('Invalid export type')
    }
  }
}

module.exports = { TechReportsExporter, ReportsExporter }
