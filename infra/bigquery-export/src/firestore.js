import { Firestore } from '@google-cloud/firestore'
import { BigQueryExport } from './bigquery.js'

export class FirestoreBatch {
  constructor() {
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
      progressReportInterval: 100000, // Report progress every N operations
      flushThreshold: 50000, // Flush BulkWriter every N operations
      gcInterval: 50000 // Force garbage collection interval
    }

    this.reset()
  }

  // Memory monitoring utility
  logMemoryUsage(operation = '') {
    const used = process.memoryUsage()
    const memoryInfo = {
      rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
      external: Math.round(used.external / 1024 / 1024 * 100) / 100
    }

    console.log(`Memory usage ${operation}: RSS ${memoryInfo.rss}MB, Heap Used ${memoryInfo.heapUsed}MB, Heap Total ${memoryInfo.heapTotal}MB, External ${memoryInfo.external}MB`)

    // Configurable memory warning threshold from environment
    const warningThreshold = parseInt(process.env.MEMORY_WARNING_THRESHOLD_MB || '1500')
    if (memoryInfo.heapUsed > warningThreshold) {
      console.warn(`⚠️ High memory usage detected: ${memoryInfo.heapUsed}MB heap used (threshold: ${warningThreshold}MB)`)
    }

    return memoryInfo
  }

  // Enhanced reset with memory cleanup
  reset() {
    this.processedDocs = 0
    this.totalDocs = 0

    // Clean up existing BulkWriter if it exists
    if (this.bulkWriter) {
      try {
        this.bulkWriter.close()
      } catch (error) {
        console.warn('Error closing existing BulkWriter:', error.message)
      }
    }
    this.bulkWriter = null

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }

    // Log memory usage after reset
    this.logMemoryUsage('after reset')
  }

  createBulkWriter(operation) {
    const bulkWriter = this.firestore.bulkWriter()

    bulkWriter.maxBatchSize = 500 // Reduce batch size for memory efficiency

    // Configure error handling with progress info
    bulkWriter.onWriteError((error) => {
      const progressInfo = this.totalDocs > 0 ? ` (${this.processedDocs}/${this.totalDocs})` : ''
      console.warn(`${operation} operation failed${progressInfo}:`, error.message)

      // Retry on transient errors, fail on permanent ones
      const retryableErrors = ['deadline-exceeded', 'unavailable', 'resource-exhausted', 'aborted']
      return retryableErrors.includes(error.code)
    })

    // Track progress on successful writes
    bulkWriter.onWriteResult(() => {
      this.processedDocs++

      // Report progress periodically
      if (this.processedDocs % this.config.progressReportInterval === 0) {
        const progressInfo = this.totalDocs > 0 ? ` (${this.processedDocs}/${this.totalDocs})` : ` (${this.processedDocs} processed)`
        console.log(`Progress${progressInfo} - ${operation}ing documents in ${this.collectionName}`)

        // Force garbage collection periodically
        if (this.processedDocs % this.config.gcInterval === 0 && global.gc) {
          global.gc()
        }
      }
    })

    return bulkWriter
  }

  buildQuery(collectionRef) {
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

  async getDocumentCount(query) {
    try {
      const countSnapshot = await query.count().get()
      return countSnapshot.data().count
    } catch (error) {
      console.warn('Could not get document count for progress tracking:', error.message)
      return 0
    }
  }

  async batchDelete() {
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
      for (const doc of snapshot.docs) {
        this.bulkWriter.delete(doc.ref)
        deletedCount++

        // Frequent flushing to prevent memory buildup
        if (deletedCount % this.config.flushThreshold === 0) {
          console.log(`Flushing BulkWriter at ${deletedCount} operations...`)
          await this.bulkWriter.flush()

          // Force garbage collection after flush
          if (global.gc) {
            global.gc()
          }
        }
      }
    }

    // Final flush and close
    console.log('Finalizing deletion operations...')
    await this.bulkWriter.flush()
    await this.bulkWriter.close()

    const duration = (Date.now() - startTime) / 1000
    console.info(`Deletion complete. Total docs deleted: ${this.processedDocs}. Time: ${duration} seconds`)
  }

  async streamFromBigQuery(rowStream) {
    console.info('Starting BigQuery to Firestore transfer...')
    const startTime = Date.now()
    this.reset()

    // Create BulkWriter for write operations
    this.bulkWriter = this.createBulkWriter('writ')

    let rowCount = 0
    let batchCount = 0
    const collectionRef = this.firestore.collection(this.collectionName)

    try {
      for await (const row of rowStream) {
        // Add document to BulkWriter
        const docRef = collectionRef.doc()
        this.bulkWriter.set(docRef, row)

        rowCount++
        this.totalDocs = rowCount // Update totalDocs for progress tracking

        if (rowCount % this.config.flushThreshold === 0) {
          console.log(`Flushing BulkWriter at ${rowCount} operations...`)
          await this.bulkWriter.flush()
          batchCount++

          if (batchCount % 5 === 0 && global.gc) {
            console.log(`Forcing garbage collection at batch ${batchCount}...`)
            global.gc()
          }
        }
      }
    } catch (error) {
      console.error('Error during BigQuery streaming:', error)
      throw error
    }

    // Final flush and close
    console.log('Finalizing write operations...')
    await this.bulkWriter.flush()
    await this.bulkWriter.close()

    // Final garbage collection
    if (global.gc) {
      global.gc()
    }

    const duration = (Date.now() - startTime) / 1000
    console.info(`Transfer to ${this.collectionName} complete. Total rows processed: ${this.processedDocs}. Time: ${duration} seconds`)
  }

  async export(query, exportConfig) {
    console.log(`Starting export to ${exportConfig.collection}...`)
    this.logMemoryUsage('at start')

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

    try {
      await this.batchDelete()
      this.logMemoryUsage('after deletion')

      const rowStream = await this.bigquery.queryResultsStream(query)
      await this.streamFromBigQuery(rowStream)

      this.logMemoryUsage('at completion')
      console.log(`✅ Export to ${exportConfig.collection} completed successfully`)
    } catch (error) {
      this.logMemoryUsage('on error')
      console.error(`❌ Export to ${exportConfig.collection} failed:`, error)
      throw error
    }
  }
}
