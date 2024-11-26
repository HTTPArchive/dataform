const { Firestore } = require('@google-cloud/firestore')

class FirestoreBatch {
  constructor (collectionName) {
    this.collectionName = collectionName
    this.firestore = new Firestore()
    this.batch = this.firestore.batch()
  }

  write (data) {
    const docRef = this.firestore.collection(this.collectionName).doc()
    this.batch.set(docRef, data)
  }

  commit () {
    return this.batch.commit()
  }
}

module.exports = {
  FirestoreBatch
}
