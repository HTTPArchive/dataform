import { Firestore, FieldPath } from '@google-cloud/firestore'
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
    this.pendingCount = 0

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
    const bulkWriter = this.firestore.bulkWriter({
      isThrottlingEnabled: false,
      maxBatchSize: 500
    })

    // Configure error handling with progress info
    bulkWriter.onWriteError((error) => {
      const progressInfo = this.totalDocs > 0 ? ` (${this.processedDocs}/${this.totalDocs})` : ''
      console.warn(`${operation} operation failed${progressInfo}:`, error.message)

      // Limit retry attempts to prevent infinite retry loops on persistent transient errors
      const MAX_RETRIES = 5
      if (error.failedAttempts >= MAX_RETRIES) {
        console.error(`Operation failed after ${error.failedAttempts} attempts. Skipping/failing.`)
        this.pendingCount--
        return false
      }

      // Retry on transient errors, fail on permanent ones
      const retryableErrorCodes = [
        4,  // DEADLINE_EXCEEDED
        8,  // RESOURCE_EXHAUSTED
        10, // ABORTED
        14  // UNAVAILABLE
      ]
      const retryableErrorStrings = [
        'deadline-exceeded',
        'unavailable',
        'resource-exhausted',
        'aborted'
      ]

      const isRetryable =
        retryableErrorCodes.includes(error.code) ||
        (typeof error.code === 'string' && retryableErrorStrings.includes(error.code.toLowerCase()))

      if (isRetryable) {
        console.log(`Retrying failed operation (attempt ${error.failedAttempts + 1}/${MAX_RETRIES})...`)
        return true
      }

      this.pendingCount--
      return false
    })

    // Track progress on successful writes
    bulkWriter.onWriteResult(() => {
      this.processedDocs++
      this.pendingCount--

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

  async waitIfNeeded() {
    const limit = 100000
    const target = 50000
    if (this.pendingCount > limit) {
      console.log(`Pipeline full (${this.pendingCount} pending). Waiting for queue to drain below ${target}...`)
      while (this.pendingCount > target) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      console.log(`Pipeline drained (${this.pendingCount} pending). Resuming...`)

      // Force garbage collection after queue drains
      if (global.gc) {
        global.gc()
      }
    }
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

    const pageSize = 10000 // 10,000 documents per query page

    try {
      // Split the deletion query into 4 parallel partitions manually using document ID ranges
      // Optimized for lowercase strings/domain names (e.g. h, o, v splits)
      const partitions = [
        { start: '', end: 'h' },
        { start: 'h', end: 'o' },
        { start: 'o', end: 'v' },
        { start: 'v', end: '\uf8ff' }
      ]

      console.info(`Split deletion into ${partitions.length} manual parallel partitions`)

      await Promise.all(partitions.map(async (partition, index) => {
        let lastDocId = null
        let partitionDeletedCount = 0

        while (true) {
          let pageQuery = collectionQuery
            .select()
            .orderBy(FieldPath.documentId())
            .limit(pageSize)

          if (lastDocId) {
            pageQuery = pageQuery.startAfter(lastDocId)
          } else if (partition.start !== '') {
            pageQuery = pageQuery.startAt(partition.start)
          }

          if (partition.end) {
            pageQuery = pageQuery.endBefore(partition.end)
          }

          const snapshot = await pageQuery.get()
          if (snapshot.empty) {
            break
          }

          // Remember the last document ID of the sorted page for query cursor pagination
          lastDocId = snapshot.docs[snapshot.docs.length - 1].id

          // Shuffle document references in memory to prevent sequential index updates (hotspotting)
          const docs = [...snapshot.docs]
          for (let i = docs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const temp = docs[i]
            docs[i] = docs[j]
            docs[j] = temp
          }

          for (const doc of docs) {
            this.bulkWriter.delete(doc.ref)
            this.pendingCount++
            partitionDeletedCount++
          }

          // Wait if the pending operations queue is too full
          await this.waitIfNeeded()
        }
        console.log(`Partition ${index + 1}/${partitions.length} complete. Deleted ${partitionDeletedCount} documents.`)
      }))
    } catch (error) {
      console.error('Error during batch deletion pagination:', error)
      throw error
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
    const collectionRef = this.firestore.collection(this.collectionName)

    try {
      for await (const row of rowStream) {
        // Add document to BulkWriter
        const docRef = collectionRef.doc()
        this.bulkWriter.set(docRef, row)
        this.pendingCount++
        rowCount++
        this.totalDocs = rowCount // Update totalDocs for progress tracking

        // Wait if the pending operations queue is too full
        await this.waitIfNeeded()
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

      // Avoid dumping the massive Firestore client instance (contained in documentRef)
      if (error && error.documentRef) {
        const cleanError = {
          message: error.message,
          code: error.code,
          documentPath: error.documentRef.path,
          failedAttempts: error.failedAttempts
        }
        console.error(`❌ Export to ${exportConfig.collection} failed:`, cleanError)
        throw new Error(`Export failed at document ${cleanError.documentPath}: ${cleanError.message} (code: ${cleanError.code})`, { cause: error })
      }

      console.error(`❌ Export to ${exportConfig.collection} failed:`, error)
      throw error
    }
  }
}
