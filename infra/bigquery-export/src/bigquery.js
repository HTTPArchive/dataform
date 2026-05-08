import { BigQuery } from '@google-cloud/bigquery'
import { BigQueryReadClient } from '@google-cloud/bigquery-storage'
import { tableFromIPC } from 'apache-arrow'

export class BigQueryExport {
  constructor (options = {}) {
    options.projectId = options.projectId || 'httparchive'
    options.location = options.location || 'US'
    this.bigquery = new BigQuery(options)
    this.projectId = options.projectId
    this.storageClient = new BigQueryReadClient()
  }

  async queryResults (query) {
    const options = {
      query,
      projectId: this.projectId,
      location: this.location
    }

    const [job] = await this.bigquery.createQueryJob(options)
    console.info(`Running BigQuery query: ${job.id}`)
    const [rows] = await job.getQueryResults()
    console.log('Fetching query results completed')
    return rows
  }

  async queryResultsStream (query) {
    const [job] = await this.bigquery.createQueryJob({
      query,
      projectId: this.projectId,
      location: 'US'
    })
    console.info(`Running BigQuery query: ${job.id}`)

    // Wait for completion without buffering results into memory
    await job.getQueryResults({ maxResults: 0 })

    const [metadata] = await job.getMetadata()
    if (metadata.status.errorResult) {
      throw new Error(`Query failed: ${metadata.status.errorResult.message}`)
    }

    const { projectId, datasetId, tableId } = metadata.configuration.query.destinationTable
    console.info(`Query complete. Reading ${projectId}.${datasetId}.${tableId} via Storage Read API`)

    return this._tableStream(projectId, datasetId, tableId)
  }

  async * _tableStream (projectId, datasetId, tableId) {
    const [session] = await this.storageClient.createReadSession({
      parent: `projects/${projectId}`,
      readSession: {
        table: `projects/${projectId}/datasets/${datasetId}/tables/${tableId}`,
        dataFormat: 'ARROW'
      },
      maxStreamCount: 0
    })

    const schema = Buffer.from(session.arrowSchema.serializedSchema)
    console.info(`Storage Read session created with ${session.streams.length} stream(s)`)

    for (const stream of session.streams) {
      const rowStream = this.storageClient.readRows({ readStream: stream.name, offset: 0 })
      for await (const response of rowStream) {
        if (!response.arrowRecordBatch?.serializedRecordBatch?.length) continue
        const batch = Buffer.from(response.arrowRecordBatch.serializedRecordBatch)
        const table = tableFromIPC([schema, batch])
        for (const row of table) {
          yield row.toJSON()
        }
      }
    }
  }
}
