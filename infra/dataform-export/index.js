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
async function messageHandler (req, res) {
  try {
    console.log(JSON.stringify(req.body))
    const message = req.body
    if (!message) {
      console.log(`no message received: ${JSON.stringify(req.body)}`)
      res.status(400).send('Bad Request: no message received')
      return
    }

    const query = message.protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.query.query
    if (!query) {
      console.log(`no query found: ${JSON.stringify(message)}`)
      res.status(400).send('Bad Request: no query found')
      return
    }

    const regex = /\/\* ({"dataform_trigger":.+) \*\//
    const reportConfig = regex.exec(query)
    if (!reportConfig) {
      console.log(`no trigger config found: ${query}`)
      res.status(400).send('Bad Request: no trigger config found')
      return
    }

    const eventData = JSON.parse(reportConfig[1])
    await callRunJob(eventData)

    res.status(200).send('OK')
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
}

/**
 * Trigger function for Dataform export.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
functions.http('dataform-export', (req, res) => messageHandler(req, res))
