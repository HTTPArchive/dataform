import { Firestore } from '@google-cloud/firestore'
import { BigQueryExport } from './bigquery.js'
import { technologyHashId } from './utils.js'

const TECHNOLOGY_QUERY_ID_KEYS = {
  adoption: ['date', 'technology', 'geo', 'rank'],
  lighthouse: ['date', 'technology', 'geo', 'rank'],
  core_web_vitals: ['date', 'technology', 'geo', 'rank'],
  page_weight: ['date', 'technology', 'geo', 'rank'],
  technologies: ['client', 'technology', 'category'],
  categories: ['category']
}

export class FirestoreBatch {
  constructor () {
    this.firestore = new Firestore()
    this.bigquery = new BigQueryExport()
    this.firestore.settings({ databaseId: 'tech-report-apis-dev' })
    this.batchSize = 500
    this.maxConcurrentBatches = 100
  }

  async queueBatch (operation) {
    const batch = this.firestore.batch()

    this.currentBatch.forEach((row) => {
      if (operation === 'delete') {
        const docRef = this.firestore.collection(this.collectionName).doc(row.id)
        batch.delete(docRef)
      } else if (operation === 'set') {
        const docId = technologyHashId(row, this.collectionName, TECHNOLOGY_QUERY_ID_KEYS)
        const docRef = this.firestore.collection(this.collectionName + '_v2').doc(docId) // TODO: remove _v2 used for testing
        batch.set(docRef, row)
      } else {
        throw new Error('Invalid operation')
      }
    })
    this.batchPromises.push(batch)
    this.currentBatch = []
  }

  async commitBatches () {
    console.log(`Committing ${this.batchPromises.length} batches`)
    await Promise.all(
      this.batchPromises.map((batchPromise) => batchPromise.commit()
        .catch((error) => {
          console.error('Batch commit error:', error)
          throw error
        })
      )
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
    console.log('Starting batch deletion...')
    const startTime = Date.now()
    this.currentBatch = []
    this.batchPromises = []

    let totalDocsDeleted = 0
    const collectionRef = this.firestore.collection(this.collectionName + '_v2') // TODO: remove _v2 used for testing

    let collectionQuery
    if (this.collectionType === 'report') {
      console.log('Deleting documents from ' + this.collectionName + ' for date ' + this.date)
      // Query to fetch monthly documents and run delete operations in parallel batches
      collectionQuery = collectionRef.where('date', '==', this.date)
    } else if (this.collectionType === 'dict') {
      console.log('Deleting documents from ' + this.collectionName)
      collectionQuery = collectionRef
    } else {
      throw new Error('Invalid collection type')
    }

    try {
      while (true) {
        const snapshot = await collectionQuery.limit(100000).get()
        if (snapshot.empty) {
          break
        }

        snapshot.forEach(async (doc) => {
          this.currentBatch.push({ id: doc.id })
          if (this.currentBatch.length >= this.batchSize) {
            this.queueBatch('delete')
          }

          if (this.batchPromises.length >= this.maxConcurrentBatches) {
            await this.commitBatches()
          }
          totalDocsDeleted++
        })
        await this.finalFlush('delete')

        const duration = (Date.now() - startTime) / 1000
        console.log(`Deletion complete. Total docs deleted: ${totalDocsDeleted}. Time: ${duration} seconds`)
      }
    } catch (error) {
      console.error('Deletion error:', error)
    }
  }

  /**
   * Streams BigQuery query results into a Firestore collection using batch commits.
   * @param {string} query - The BigQuery SQL query.
   */
  async streamFromBigQuery (query) {
    console.log('Starting BigQuery to Firestore transfer...')
    const startTime = Date.now()
    let totalRowsProcessed = 0

    const rowStream = await this.bigquery.queryResultsStream(query)

    this.currentBatch = []
    this.batchPromises = []

    try {
      for await (const row of rowStream) {
        // console.log('Received chunk:', row)
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
      console.log(`Transfer complete. Total rows processed: ${totalRowsProcessed}. Time: ${duration} seconds`)
    } catch (err) {
      console.error('Error:', err)
    }
  }

  async export (config, query) {
    this.date = config.date
    this.collectionName = config.name
    this.collectionType = config.type

    try {
      // Delete documents for the same date
      // await this.batchDelete()

      await this.streamFromBigQuery(query)
    } catch (error) {
      console.error('Transfer failed:', error)
    }
  }
}
