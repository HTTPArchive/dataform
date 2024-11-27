const { Firestore } = require('@google-cloud/firestore')

class FirestoreBatch {
  constructor () {
    this.db = new Firestore()
    this.batch = this.db.batch()
  }

  async delete () {
    const collectionRef = this.db.collection(this.collectionName)

    // Query to fetch documents for last month
    let query
    if (this.collectionType === 'report') {
      query = collectionRef.where('date', '=', this.date)
    } else {
      query = collectionRef
    }

    let snapshot
    do {
      snapshot = await query.limit(500).get()
      snapshot.docs.forEach((doc) => this.batch.delete(doc.ref))
      await this.batch.commit()
    } while (!snapshot.empty)
  }

  write (data) {
    const batchSize = 500
    for (let i = 0; i < data.length; i += batchSize) {
      const batchData = data.slice(i, i + batchSize)
      const collectionRef = this.db.collection(this.collectionName)

      batchData.forEach((item) => {
        const docRef = collectionRef.doc()
        this.batch.set(docRef, item)
      })
      this.batch.commit()
    }
  }

  export (dbName, config, data) {
    this.date = config.date
    this.collectionName = config.name
    this.collectionType = config.type

    // Delete documents for the same date
    this.delete()

    // Write new documents
    this.write(data)
  }
}

module.exports = {
  FirestoreBatch
}
