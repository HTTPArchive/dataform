const { Storage } = require('@google-cloud/storage')
const { Readable } = require('stream')
const zlib = require('zlib')

const storage = new Storage()

class StorageExport {
  constructor (bucket) {
    this.bucket = bucket
    this.stream = new Readable({
      objectMode: true,
      read () {}
    })
  }

  async exportToJson (data, fileName) {
    const bucket = storage.bucket(this.bucket)
    const file = bucket.file(fileName)

    const jsonData = JSON.stringify(data)
    this.stream.push(jsonData)
    this.stream.push(null)

    const gzip = zlib.createGzip()

    await new Promise((resolve, reject) => {
      this.stream
        .pipe(gzip)
        .pipe(file.createWriteStream({
          metadata: {
            contentEncoding: 'gzip'
          }
        }))
        .on('error', reject)
        .on('finish', () => {
          console.log(`File ${fileName} successfully written to ${this.bucket}`)
          resolve()
        })
    })
  }
}

module.exports = {
  StorageExport
}
