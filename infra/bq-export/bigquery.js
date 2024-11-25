const { BigQuery } = require('@google-cloud/bigquery')
const { Storage } = require('@google-cloud/storage')
const { Readable } = require('stream')

const bigquery = new BigQuery()
const storage = new Storage()

class BigQueryExport {
  constructor (datasetId) {
    this.datasetId = datasetId
  }

  async query (query) {
    const options = {
      query,
      location: 'US'
    }

    const [job] = await bigquery.createQueryJob(options)
    const [rows] = await job.getQueryResults()

    return rows
  }

  async exportToJson (query, bucketName, fileName) {
    const rows = await this.query(query)
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(fileName)

    const stream = new Readable({
      objectMode: true,
      read () {
        this.push(JSON.stringify(rows))
        this.push(null)
      }
    })

    await new Promise((resolve, reject) => {
      stream.pipe(file.createWriteStream())
        .on('error', reject)
        .on('finish', resolve)
    })
  }
}

module.exports = {
  BigQueryExport
}
