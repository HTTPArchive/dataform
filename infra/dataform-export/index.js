import functions from '@google-cloud/functions-framework'
import run from '@google-cloud/run'

const projectId = 'httparchive'
const location = 'us-central1'
const jobId = 'bigquery-export'

async function callCreateJob (
  payload = {}
) {
  const client = new run.v2.JobsClient()
  const parent = `projects/${projectId}/locations/${location}`

  const request = {
    parent,
    jobId,
    job: {
      template: {
        template: {
          containers: [
            {
              image: `gcr.io/httparchive/${jobId}:latest`,
              env: [
                {
                  name: 'CONFIG_DATA',
                  value: JSON.stringify(payload)
                }
              ]
            }
          ]
        }
      }
    }
  }
  // console.log(request)

  const [operation] = await client.createJob(request)
  const [response] = await operation.promise()

  console.info(`Job created: ${response.name}`)
}

/**
 * Handle incoming message and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function messageHandler (req, res) {
  try {
    const message = req.body.message
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
    await callCreateJob(eventData)

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
 *
 * Example request payload:
 * {
 *  "message": {
 *    "protoPayload": {
 *      "serviceData": {
 *        "jobCompletedEvent": {
 *          "job": {
 *            "jobConfiguration": {
 *              "query": {
 *                "query": "/* {"dataform_trigger": "report_complete", "date": "2024-11-01", "name": "bytesTotal", "type": "histogram"} *\/"
 *              }
 *           }
 *        }
 *     }
 *   }
 * }
 */
functions.http('dataform-export', (req, res) => messageHandler(req, res))
