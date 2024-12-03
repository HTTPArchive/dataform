const { Firestore } = require('@google-cloud/firestore')

class FirestoreBatch {
  constructor (databaseId) {
    this.db = new Firestore()
    this.db.settings({ databaseId })
    this.batchSize = 500
  }

  async delete () {
    console.log('Deleting documents from ' + this.collectionName)
    const collectionRef = this.db.collection(this.collectionName)

    if (this.collectionType === 'report') {
      // Query to fetch monthly documents
      const query = collectionRef.where('date', '=', this.date)

      while (true) {
        const snapshot = await query.limit(this.batchSize).get()
        if (snapshot.empty) {
          break
        }

        const batch = this.db.batch()
        snapshot.docs.forEach(doc => batch.delete(doc.ref))
        await batch.commit()
      }
    } else if (this.collectionType === 'dict') {
      await this.db.recursiveDelete(collectionRef)
    } else {
      throw new Error('Invalid collection type')
    }
  }

  async write (data) {
    console.log('Writing documents')
    const collectionRef = this.db.collection(this.collectionName)

    const chunks = []
    for (let i = 0; i < data.length; i += this.batchSize) {
      chunks.push(data.slice(i, i + this.batchSize))
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const batch = this.db.batch()
        chunk.forEach(doc => {
          console.log(doc.technology)
          batch.set(collectionRef.doc(), doc)
        })
        await batch.commit()
      })
    )
  }

  async export (dbName, config, data) {
    console.log('Exporting data to Firestore')
    this.date = config.date
    this.collectionName = config.name
    this.collectionType = config.type

    // Delete documents for the same date
    await this.delete()

    // Write new documents
    await this.write(data)
  }
}

module.exports = {
  FirestoreBatch
}
