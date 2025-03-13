import { StorageUpload } from './storage.js'
import { FirestoreBatch } from './firestore.js'

async function main () {
  const { query, destination, config } = process.env.EXPORT_CONFIG && JSON.parse(process.env.EXPORT_CONFIG)
  if (!destination) {
    throw new Error('No destination found')
  }

  if (destination === 'cloud_storage') {
    console.info('Cloud Storage export')
    console.log(query, config)

    const storage = new StorageUpload(config.bucket)
    await storage.exportToJson(query, config.name)
  } else if (destination === 'firestore') {
    console.info('Firestore export')
    console.log(query, config)

    const firestore = new FirestoreBatch()
    await firestore.export(config, query)
  } else {
    throw new Error('Bad Request: destination unknown')
  }
  console.info('Export finished successfully')
  return 'OK'
}

await main().catch((error) => {
  console.error(error)
  process.exit(1)
})
