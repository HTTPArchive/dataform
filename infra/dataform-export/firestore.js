const { Firestore } = require('@google-cloud/firestore')
const { technologyHashId } = require('./utils')

const TECHNOLOGY_QUERY_ID_KEYS = {
  adoption: ['date', 'technology', 'geo', 'rank'],
  lighthouse: ['date', 'technology', 'geo', 'rank'],
  core_web_vitals: ['date', 'technology', 'geo', 'rank'],
  page_weight: ['date', 'technology', 'geo', 'rank'],
  technologies: ['client', 'technology', 'category'],
  categories: ['category']
}

class FirestoreBatch {
  constructor (databaseId) {
    this.db = new Firestore()
    this.db.settings({ databaseId })
    this.batchSize = 500
  }

  async delete () {
    const collectionRef = this.db.collection(this.collectionName)

    if (this.collectionType === 'report') {
      console.log('Deleting documents from ' + this.collectionName + ' for date ' + this.date)
      while (true) {
        // Query to fetch monthly documents and run delete operations in parallel batches
        const snapshot = await collectionRef.where('date', '==', this.date).limit(100000).get()
        if (snapshot.empty) {
          break
        }

        const chunks = []
        for (let i = 0; i < snapshot.docs.length; i += this.batchSize) {
          chunks.push(snapshot.docs.slice(i, i + this.batchSize))
        }

        await Promise.all(
          chunks.map(async (chunk) => {
            const batch = this.db.batch()
            chunk.forEach(doc => batch.delete(doc.ref))
            await batch.commit()
          })
        )
      }
    } else if (this.collectionType === 'dict') {
      console.log('Deleting documents from ' + this.collectionName)
      await this.db.recursiveDelete(collectionRef)
    } else {
      throw new Error('Invalid collection type')
    }
  }

  async write (data) {
    const collectionRef = this.db.collection(this.collectionName + '_v2') // TODO: _v2 used for testing

    const chunks = []
    for (let i = 0; i < data.length; i += this.batchSize) {
      chunks.push(data.slice(i, i + this.batchSize))
    }
    console.log('Exporting ' + chunks.length + ' chunks')

    await Promise.all(
      chunks.map(async (chunk, i) => {
        const batch = this.db.batch()
        chunk.forEach(doc => {
          const docId = technologyHashId(doc, this.collectionName, TECHNOLOGY_QUERY_ID_KEYS)
          batch.set(collectionRef.doc(docId), doc)
        })
        await batch.commit()
        console.log('Committed ' + i + ' chunk')
      })
    )
  }

  async export (config, data) {
    this.date = config.date
    this.collectionName = config.name
    this.collectionType = config.type

    // Delete documents for the same date
    // await this.delete()

    // Write new documents
    await this.write(data)

    console.log('Exported ' + data.length + ' documents to ' + this.collectionName)
  }
}

module.exports = {
  FirestoreBatch
}
