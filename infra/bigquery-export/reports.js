import { BigQueryExport } from './bigquery.js'
import { StorageExport } from './storage.js'
import { FirestoreBatch } from './firestore.js'

export class ReportsExporter {
  constructor () {
    this.bigquery = new BigQueryExport()
    this.storage = new StorageExport()
    this.storagePath = 'reports/dev/' // TODO change to prod
  }

  // Export timeseries reports
  async exportTimeseries (exportConfig) {
    const metric = exportConfig.name
    const query = `
SELECT
  FORMAT_DATE('%Y_%m_%d', date) AS date,
  * EXCEPT(date)
FROM reports.${metric}_timeseries
`
    const rows = await this.bigquery.queryResults(query)
    await this.storage.exportToJson(rows, `${this.storagePath}${metric}.json`)
  }

  // Export monthly histogram report
  async exportHistogram (exportConfig) {
    const metric = exportConfig.name
    const date = exportConfig.date

    const query = `
SELECT * EXCEPT(date)
FROM reports.${metric}_histogram
WHERE date = '${date}'
`
    const rows = await this.bigquery.queryResults(query)
    await this.storage.exportToJson(rows, `${this.storagePath}${date.replaceAll('-', '_')}/${metric}.json`)
  }

  async export (exportConfig) {
    if (exportConfig.dataform_trigger !== 'report_complete') {
      console.error('Invalid dataform trigger')
      return
    }

    if (exportConfig.lense && exportConfig.lense !== 'all') {
      this.storagePath = this.storagePath + `${exportConfig.lense}/`
    }

    if (exportConfig.type === 'histogram') {
      await this.exportHistogram(exportConfig)
    } else if (exportConfig.type === 'timeseries') {
      await this.exportTimeseries(exportConfig)
    } else {
      console.error('Invalid report type')
    }
  }
}

export class TechReportsExporter {
  constructor () {
    this.firestore = new FirestoreBatch()
  }

  async export (exportConfig) {
    if (exportConfig.dataform_trigger !== 'report_cwv_tech_complete') {
      console.error('Invalid dataform trigger')
      return
    }

    let query = ''
    if (exportConfig.type === 'report') {
      query = `
SELECT
  STRING(date) AS date,
  * EXCEPT(date)
FROM httparchive.reports.cwv_tech_${exportConfig.name}
WHERE date = '${exportConfig.date}'
`
    } else if (exportConfig.type === 'dict') {
      query = `
SELECT *
FROM reports.cwv_tech_${exportConfig.name}
`
    } else {
      console.error('Invalid export type')
    }

    await this.firestore.export(exportConfig, query)
  }
}
