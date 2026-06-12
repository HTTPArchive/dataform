import { Storage } from '@google-cloud/storage'
import { Transform } from 'stream'
import zlib from 'zlib'

const storage = new Storage()

export class StorageUpload {
  constructor (bucket) {
    this.bucket = bucket
  }

  async exportToJson (stream, fileName) {
    const bucket = storage.bucket(this.bucket)
    const file = bucket.file(fileName)

    let first = true
    let batch = []
    const BATCH_SIZE = 1000

    const jsonTransform = new Transform({
      writableObjectMode: true,
      transform (chunk, encoding, callback) {
        batch.push(chunk)
        if (batch.length >= BATCH_SIZE) {
          let str = ''
          if (first) {
            str = '[\n  ' + JSON.stringify(batch[0])
            for (let i = 1; i < batch.length; i++) {
              str += ',\n  ' + JSON.stringify(batch[i])
            }
            first = false
          } else {
            for (let i = 0; i < batch.length; i++) {
              str += ',\n  ' + JSON.stringify(batch[i])
            }
          }
          batch = []
          callback(null, str)
        } else {
          callback()
        }
      },
      flush (callback) {
        let str = ''
        if (batch.length > 0) {
          if (first) {
            str = '[\n  ' + JSON.stringify(batch[0])
            for (let i = 1; i < batch.length; i++) {
              str += ',\n  ' + JSON.stringify(batch[i])
            }
            first = false
          } else {
            for (let i = 0; i < batch.length; i++) {
              str += ',\n  ' + JSON.stringify(batch[i])
            }
          }
        }

        if (first) {
          str += '[]'
        } else {
          str += '\n]'
        }
        callback(null, str)
      }
    })

    const gzip = zlib.createGzip()

    await new Promise((resolve, reject) => {
      stream
        .pipe(jsonTransform)
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
