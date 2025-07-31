import { FirestoreBatch } from './firestore.js'

async function main () {
  const { query, destination, config } = process.env.EXPORT_CONFIG && JSON.parse(process.env.EXPORT_CONFIG)

  if (destination === 'firestore') {
    console.log(query, config)

    const firestore = new FirestoreBatch()
    await firestore.export(query, config)
  }

  console.info('Export finished successfully')
  return 'OK'
}

await main().catch((error) => {
  console.error(error)
  process.exit(1)
})
