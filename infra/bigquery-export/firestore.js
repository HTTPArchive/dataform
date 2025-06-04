import { Firestore } from '@google-cloud/firestore'
import { BigQueryExport } from './bigquery.js'

export class FirestoreBatch {
  constructor () {
    this.firestore = new Firestore({
      gaxOptions: {
        grpc: {
          max_receive_message_length: 500 * 1024 * 1024, // 500MB
          max_send_message_length: 500 * 1024 * 1024, // 500MB
          'grpc.max_connection_idle_ms': 5 * 60 * 1000, // 5 minutes
          'grpc.keepalive_time_ms': 30 * 1000, // 30 seconds
          'grpc.keepalive_timeout_ms': 60 * 1000, // 1 minute
          'grpc.keepalive_permit_without_calls': true
        }
      }
    })
    this.bigquery = new BigQueryExport()

    // Configuration constants
    this.config = {
      batchSize: {
        delete: 500,
        write: 400
      },
      maxConcurrentBatches: 200,
      retryCount: 5,
      timeout: 10 * 60 * 1000 // 10 minutes
    }

    this.reset()
  }

  reset () {
    this.currentBatch = []
    this.batchPromises = []
  }

  getCurrentBatchSize (operation) {
    return this.config.batchSize[operation === 'delete' ? 'delete' : 'write']
  }

  async commitWithRetry (batch, index) {
    let lastError

    for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
      try {
        await batch.commit()
        return
      } catch (error) {
        lastError = error
        console.warn(`Batch ${index} attempt ${attempt} failed:`, error.message)

        if (attempt < this.config.retryCount) {
          const delayMs = Math.pow(2, attempt) * 500
          console.log(`Retrying batch ${index} in ${delayMs}ms...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }
    }

    console.error(`Batch ${index} failed after ${this.config.retryCount} attempts:`, lastError)
    throw lastError
  }

  createBatch (operation) {
    const batch = this.firestore.batch()

    this.currentBatch.forEach((doc) => {
      if (operation === 'delete') {
        batch.delete(doc.ref)
      } else if (operation === 'set') {
        const docRef = this.firestore.collection(this.collectionName).doc()
        batch.set(docRef, doc)
      } else {
        throw new Error(`Invalid operation: ${operation}`)
      }
    })

    return batch
  }

  queueBatch (operation) {
    const batch = this.createBatch(operation)
    this.batchPromises.push(batch)
    this.currentBatch = []
  }

  async commitBatches () {
    if (this.batchPromises.length === 0) return

    console.log(`Committing ${this.batchPromises.length} batches to ${this.collectionName}`)

    await Promise.all(
      this.batchPromises.map((batch, index) =>
        this.commitWithRetry(batch, index)
      )
    )

    this.batchPromises = []
  }

  async processInBatches (operation, shouldFlush = false) {
    const batchSize = this.getCurrentBatchSize(operation)

    if (this.currentBatch.length >= batchSize || shouldFlush) {
      this.queueBatch(operation)
    }

    if (this.batchPromises.length >= this.config.maxConcurrentBatches || shouldFlush) {
      await this.commitBatches()
    }
  }

  buildQuery (collectionRef) {
    const queryMap = {
      report: () => {
        console.info(`Deleting documents from ${this.collectionName} for date ${this.date}`)
        return collectionRef.where('date', '==', this.date)
      },
      dict: () => {
        console.info(`Deleting documents from ${this.collectionName}`)
        return collectionRef
      }
    }

    const queryBuilder = queryMap[this.collectionType]
    if (!queryBuilder) {
      throw new Error(`Invalid collection type: ${this.collectionType}`)
    }

    return queryBuilder()
  }

  async batchDelete () {
    console.info('Starting batch deletion...')
    const startTime = Date.now()
    this.reset()

    let totalDocsDeleted = 0
    const collectionRef = this.firestore.collection(this.collectionName)
    const collectionQuery = this.buildQuery(collectionRef)
    const batchSize = this.getCurrentBatchSize('delete')

    while (true) {
      const snapshot = await collectionQuery.limit(batchSize * this.config.maxConcurrentBatches).get()
      if (snapshot.empty) break

      for (const doc of snapshot.docs) {
        this.currentBatch.push(doc)
        await this.processInBatches('delete')
        totalDocsDeleted++
      }
    }

    // Final flush
    await this.processInBatches('delete', true)

    const duration = (Date.now() - startTime) / 1000
    console.info(`Deletion complete. Total docs deleted: ${totalDocsDeleted}. Time: ${duration} seconds`)
  }

  async streamFromBigQuery (rowStream) {
    console.info('Starting BigQuery to Firestore transfer...')
    const startTime = Date.now()
    let totalRowsProcessed = 0

    this.reset()

    for await (const row of rowStream) {
      this.currentBatch.push(row)
      await this.processInBatches('set')
      totalRowsProcessed++
    }

    // Final flush
    await this.processInBatches('set', true)

    const duration = (Date.now() - startTime) / 1000
    console.info(`Transfer to ${this.collectionName} complete. Total rows processed: ${totalRowsProcessed}. Time: ${duration} seconds`)
  }

  async export (query, exportConfig) {
    // Configure Firestore settings
    this.firestore.settings({
      databaseId: exportConfig.database,
      timeout: this.config.timeout
    })

    // Set instance properties
    Object.assign(this, {
      collectionName: exportConfig.collection,
      collectionType: exportConfig.type,
      date: exportConfig.date
    })

    await this.batchDelete()

    const rowStream = await this.bigquery.queryResultsStream(query)
    await this.streamFromBigQuery(rowStream)
  }
}
