import { BigQueryExport } from './bigquery.js'
import { StorageExport } from './storage.js'
import { FirestoreBatch } from './firestore.js'

export class ReportsExporter {
  constructor () {
    this.bigquery = new BigQueryExport()
    this.storage = new StorageExport()
  }

  // Export timeseries reports
  async exportTimeseries (exportData) {
    const metric = exportData.name
    const query = `
SELECT
  FORMAT_DATE('%Y_%m_%d', date) AS date,
  * EXCEPT(date)
FROM reports.${metric}_timeseries
`
    const rows = await this.bigquery.queryResults(query)
    await this.storage.exportToJson(rows, metric)
  }

  // Export monthly histogram report
  async exportHistogram (exportData) {
    const metric = exportData.name
    const date = exportData.date

    const query = `
SELECT * EXCEPT(date)
FROM reports.${metric}_histogram
WHERE date = '${date}'
`
    const rows = await this.bigquery.queryResults(query)
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

export class TechReportsExporter {
  constructor () {
    this.firestore = new FirestoreBatch()
  }

  async export (exportData) {
    if (exportData.dataform_trigger !== 'report_cwv_tech_complete') {
      console.error('Invalid dataform trigger')
      return
    }

    let query = ''
    if (exportData.type === 'report') {
      query = `
SELECT
  STRING(date) AS date,
  * EXCEPT(date)
FROM httparchive.reports.cwv_tech_${exportData.name}
WHERE date = '${exportData.date}'
`
    } else if (exportData.type === 'dict') {
      query = `
SELECT *
FROM reports.cwv_tech_${exportData.name}
`
    } else {
      console.error('Invalid export type')
    }

    await this.firestore.export(exportData, query)
  }
}
