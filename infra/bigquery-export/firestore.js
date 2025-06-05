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
      timeout: 10 * 60 * 1000, // 10 minutes
      progressReportInterval: 200000, // Report progress every N operations
      flushThreshold: 200000 // Flush BulkWriter every N operations
    }

    this.reset()
  }

  reset () {
    this.processedDocs = 0
    this.totalDocs = 0
    this.bulkWriter = null
  }

  createBulkWriter (operation) {
    const bulkWriter = this.firestore.bulkWriter()

    // Configure error handling with progress info
    bulkWriter.onWriteError((error) => {
      const progressInfo = this.totalDocs > 0 ? ` (${this.processedDocs}/${this.totalDocs})` : ''
      console.warn(`${operation} operation failed${progressInfo}:`, error.message)

      // Retry on transient errors, fail on permanent ones
      const retryableErrors = ['deadline-exceeded', 'unavailable', 'resource-exhausted']
      return retryableErrors.includes(error.code)
    })

    // Track progress on successful writes
    bulkWriter.onWriteResult(() => {
      this.processedDocs++

      // Report progress periodically
      if (this.processedDocs % this.config.progressReportInterval === 0) {
        const progressInfo = this.totalDocs > 0 ? ` (${this.processedDocs}/${this.totalDocs})` : ` (${this.processedDocs} processed)`
        console.log(`Progress${progressInfo} - ${operation}ing documents in ${this.collectionName}`)
      }
    })

    return bulkWriter
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

  async getDocumentCount (query) {
    try {
      const countSnapshot = await query.count().get()
      return countSnapshot.data().count
    } catch (error) {
      console.warn('Could not get document count for progress tracking:', error.message)
      return 0
    }
  }

  async batchDelete () {
    console.info('Starting batch deletion...')
    const startTime = Date.now()
    this.reset()

    const collectionRef = this.firestore.collection(this.collectionName)
    const collectionQuery = this.buildQuery(collectionRef)

    // Get total count for progress tracking
    this.totalDocs = await this.getDocumentCount(collectionQuery)
    if (this.totalDocs > 0) {
      console.info(`Total documents to delete: ${this.totalDocs}`)
    }

    // Create BulkWriter for delete operations
    this.bulkWriter = this.createBulkWriter('delet')

    let deletedCount = 0
    const batchSize = this.config.flushThreshold // Process documents in chunks

    while (deletedCount < this.totalDocs || this.totalDocs === 0) {
      const snapshot = await collectionQuery.limit(batchSize).get()
      if (snapshot.empty) break

      // Add all delete operations to BulkWriter
      snapshot.docs.forEach(doc => {
        this.bulkWriter.delete(doc.ref)
        deletedCount++
      })

      // Periodically flush to manage memory
      // if (deletedCount % this.config.flushThreshold === 0) {
      console.log(`Flushing BulkWriter at ${deletedCount} operations...`)
      await this.bulkWriter.flush()
      // }
    }

    // Final flush and close
    console.log('Finalizing deletion operations...')
    await this.bulkWriter.close()

    const duration = (Date.now() - startTime) / 1000
    console.info(`Deletion complete. Total docs deleted: ${this.processedDocs}. Time: ${duration} seconds`)
  }

  async streamFromBigQuery (rowStream) {
    console.info('Starting BigQuery to Firestore transfer...')
    const startTime = Date.now()
    this.reset()

    // Create BulkWriter for write operations
    this.bulkWriter = this.createBulkWriter('writ')

    let rowCount = 0
    const collectionRef = this.firestore.collection(this.collectionName)

    for await (const row of rowStream) {
      // Add document to BulkWriter
      const docRef = collectionRef.doc()
      this.bulkWriter.set(docRef, row)

      rowCount++
      this.totalDocs = rowCount // Update total as we go since we can't predict BigQuery result size

      // Periodically flush to manage memory
      if (rowCount % this.config.flushThreshold === 0) {
        console.log(`Flushing BulkWriter at ${rowCount} operations...`)
        await this.bulkWriter.flush()
      }
    }

    // Final flush and close
    console.log('Finalizing write operations...')
    await this.bulkWriter.close()

    const duration = (Date.now() - startTime) / 1000
    console.info(`Transfer to ${this.collectionName} complete. Total rows processed: ${this.processedDocs}. Time: ${duration} seconds`)
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
