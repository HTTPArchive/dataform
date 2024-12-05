const { BigQuery } = require('@google-cloud/bigquery')

const bigquery = new BigQuery()

class BigQueryExport {
  async query (query) {
    const options = {
      query
    }

    const [job] = await bigquery.createQueryJob(options)
    console.log(`Job ${job.id} started`)
    const [rows] = await job.getQueryResults()
    console.log(`Job ${job.id} completed`)

    return rows
  }
}

module.exports = {
  BigQueryExport
}
