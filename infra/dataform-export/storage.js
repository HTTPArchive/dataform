const { Storage } = require('@google-cloud/storage')
const { Readable } = require('stream')

const storage = new Storage()

class StorageExport {
  constructor (bucket) {
    this.bucket = bucket
  }

  async exportToJson (data, fileName) {
    const bucket = storage.bucket(this.bucket)
    const file = bucket.file(fileName)

    const stream = new Readable({
      objectMode: true,
      read () {
        this.push(JSON.stringify(data))
        this.push(null)
      }
    })

    await new Promise((resolve, reject) => {
      stream.pipe(file.createWriteStream())
        .on('error', reject)
        .on('finish', resolve)
    })
  }
}

module.exports = {
  StorageExport
}
