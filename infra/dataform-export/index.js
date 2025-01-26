import functions from '@google-cloud/functions-framework'
import run from '@google-cloud/run'

const projectId = 'httparchive'
const location = 'us-central1'
const jobId = 'bigquery-export'

async function callRunJob (payload = {}) {
  const client = new run.v2.JobsClient()
  const name = `projects/${projectId}/locations/${location}/jobs/${jobId}`

  const request = {
    name,
    overrides: {
      containerOverrides: [{
        env: [
          {
            name: 'EXPORT_CONFIG',
            value: JSON.stringify(payload)
          }
        ]
      }]
    }
  }

  const [operation] = await client.runJob(request)

  console.info(`Job initialized: ${operation.name}`)
}

/**
 * Handle incoming message and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
functions.http('dataform-export', async (req, res) => {
  try {
    const message = req.body.message
    if (!message) {
      console.log(`no message received: ${JSON.stringify(req.body)}`)
      res.status(400).send('Bad Request: no message received')
    }

    const messageData = (message.data && JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'))) || message
    if (!messageData) {
      console.info(JSON.stringify(message))
      res.status(400).send('Bad Request: invalid message format')
    }

    const query = messageData.protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.query.query
    if (!query) {
      console.log(`no query found: ${JSON.stringify(messageData)}`)
      res.status(400).send('Bad Request: no query found')
    }

    const repoEnvironment = messageData.protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.labels.dataform_repository_id
    if (!repoEnvironment) {
      console.log(`no repo environment found: ${JSON.stringify(messageData)}`)
      res.status(400).send('Bad Request: no repo environment found')
    }

    const regex = /\/\* ({"dataform_trigger":.+) \*\//
    const reportConfig = regex.exec(query)
    if (!reportConfig) {
      console.log(`no trigger config found: ${query}`)
      res.status(400).send('Bad Request: no trigger config found')
    }

    const eventData = JSON.parse(reportConfig[1])
    if (!eventData) {
      console.log(`no event data found: ${reportConfig[1]}`)
      res.status(400).send('Bad Request: no event data found')
    }
    eventData.environment = repoEnvironment === 'crawl-data' ? 'prod' : 'dev'
    await callRunJob(eventData)

    res.status(200).send('OK')
  } catch (error) {
    console.log(JSON.stringify(req.body))
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
})
