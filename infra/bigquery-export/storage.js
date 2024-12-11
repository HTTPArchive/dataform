import { Storage } from '@google-cloud/storage'
import { Readable } from 'stream'
import zlib from 'zlib'

const storage = new Storage()

export class StorageExport {
  constructor (bucket = 'httparchive') {
    this.bucket = bucket
    this.storagePath = 'reports/dev/' // TODO change to prod
    this.stream = new Readable({
      objectMode: true,
      read () {}
    })
  }

  async exportToJson (data, fileName) {
    fileName = this.storagePath + fileName + '.json'

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
          console.info(`File ${fileName} successfully written to ${this.bucket}`)
          resolve()
        })
    })
  }
}
