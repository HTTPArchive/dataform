import { Firestore } from '@google-cloud/firestore'
import { BigQueryExport } from './bigquery.js'

export class FirestoreBatch {
  constructor () {
    this.firestore = new Firestore({
      // Increase timeout to 10 minutes for large batch operations
      gaxOptions: {
        grpc: {
          max_receive_message_length: 100 * 1024 * 1024, // 100MB
          max_send_message_length: 100 * 1024 * 1024, // 100MB
          'grpc.max_connection_idle_ms': 5 * 60 * 1000, // 5 minutes
          'grpc.keepalive_time_ms': 30 * 1000, // 30 seconds
          'grpc.keepalive_timeout_ms': 60 * 1000, // 1 minute
          'grpc.keepalive_permit_without_calls': true
        }
      }
    })
    this.bigquery = new BigQueryExport()
    this.batchSizeDelete = 500
    this.batchSizeWrite = 400 // Reduced batch size for better performance
    this.maxConcurrentBatches = 100 // Reduced concurrent batches to avoid overwhelming
  }

  queueBatch (operation) {
    const batch = this.firestore.batch()

    this.currentBatch.forEach((doc) => {
      if (operation === 'delete') {
        batch.delete(doc.ref)
      } else if (operation === 'set') {
        const docRef = this.firestore.collection(this.collectionName).doc()
        batch.set(docRef, doc)
      } else {
        throw new Error('Invalid operation')
      }
    })
    this.batchPromises.push(batch)
    this.currentBatch = []
  }

  async commitBatches () {
    console.log(`Committing ${this.batchPromises.length} batches to ${this.collectionName}`)

    await Promise.all(
      this.batchPromises.map(async (batchPromise, index) => {
        const retryCount = 3
        let lastError

        for (let attempt = 1; attempt <= retryCount; attempt++) {
          try {
            await batchPromise.commit()
            return
          } catch (error) {
            lastError = error
            console.warn(`Batch ${index} attempt ${attempt} failed:`, error.message)

            if (attempt < retryCount) {
              // Exponential backoff: 2^attempt seconds
              const delayMs = Math.pow(2, attempt) * 1000
              console.log(`Retrying batch ${index} in ${delayMs}ms...`)
              await new Promise(resolve => setTimeout(resolve, delayMs))
            }
          }
        }

        console.error(`Batch ${index} failed after ${retryCount} attempts:`, lastError)
        throw lastError
      })
    )

    this.batchPromises = []
  }

  async finalFlush (operation) {
    if (this.currentBatch.length > 0) {
      this.queueBatch(operation)
    }

    if (this.batchPromises.length > 0) {
      await this.commitBatches()
    }
  }

  async batchDelete () {
    console.info('Starting batch deletion...')
    const startTime = Date.now()
    this.currentBatch = []
    this.batchPromises = []

    let totalDocsDeleted = 0
    const collectionRef = this.firestore.collection(this.collectionName)

    let collectionQuery
    if (this.collectionType === 'report') {
      console.info('Deleting documents from ' + this.collectionName + ' for date ' + this.date)
      // Query to fetch monthly documents
      collectionQuery = collectionRef.where('date', '==', this.date)
    } else if (this.collectionType === 'dict') {
      console.info('Deleting documents from ' + this.collectionName)
      collectionQuery = collectionRef
    } else {
      throw new Error('Invalid collection type')
    }

    while (true) {
      const snapshot = await collectionQuery.limit(this.batchSizeDelete * this.maxConcurrentBatches).get()
      if (snapshot.empty) {
        break
      }

      for await (const doc of snapshot.docs) {
        this.currentBatch.push(doc)

        if (this.currentBatch.length >= this.batchSize) {
          this.queueBatch('delete')
        }
        if (this.batchPromises.length >= this.maxConcurrentBatches) {
          await this.commitBatches()
        }
        totalDocsDeleted++
      }
    }
    await this.finalFlush('delete')

    const duration = (Date.now() - startTime) / 1000
    console.info(`Deletion complete. Total docs deleted: ${totalDocsDeleted}. Time: ${duration} seconds`)
  }

  /**
   * Streams BigQuery query results into a Firestore collection using batch commits.
   * @param {string} query - The BigQuery SQL query.
   */
  async streamFromBigQuery (rowStream) {
    console.info('Starting BigQuery to Firestore transfer...')
    const startTime = Date.now()
    let totalRowsProcessed = 0

    this.currentBatch = []
    this.batchPromises = []

    for await (const row of rowStream) {
      this.currentBatch.push(row)

      // Write batch when it reaches specified size
      if (this.currentBatch.length >= this.batchSize) {
        this.queueBatch('set')
      }

      if (this.batchPromises.length >= this.maxConcurrentBatches) {
        await this.commitBatches()
      }
      totalRowsProcessed++
    }
    await this.finalFlush('set')

    const duration = (Date.now() - startTime) / 1000
    console.info(`Transfer to ${this.collectionName} complete. Total rows processed: ${totalRowsProcessed}. Time: ${duration} seconds`)
  }

  async export (query, exportConfig) {
    this.firestore.settings({
      databaseId: exportConfig.database,
      timeout: 10 * 60 * 1000 // 10 minutes timeout
    })
    this.collectionName = exportConfig.collection
    this.collectionType = exportConfig.type
    this.date = exportConfig.date

    await this.batchDelete()

    const rowStream = await this.bigquery.queryResultsStream(query)
    await this.streamFromBigQuery(rowStream)
  }
}
