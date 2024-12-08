import { BigQuery } from '@google-cloud/bigquery'

export class BigQueryExport {
  constructor (options = {}) {
    options.projectId = options.projectId || 'httparchive'
    options.location = options.location || 'US'
    this.bigquery = new BigQuery(options)
  }

  async queryResults (query) {
    const options = {
      query,
      projectId: this.projectId,
      location: this.location
    }

    const [job] = await this.bigquery.createQueryJob(options)
    console.log(`Job ${job.id} started`)
    const [rows] = await job.getQueryResults()
    console.log(`Fetching query results for ${job.id} completed`)
    return rows
  }

  async queryResultsStream (query) {
    const options = {
      query,
      projectId: this.projectId,
      location: this.location
    }

    const [job] = await this.bigquery.createQueryJob(options)
    console.log(`Job ${job.id} started`)
    const rows = job.getQueryResultsStream()
    console.log(`Created rows stream from ${job.id}`)
    return rows
  }
}
