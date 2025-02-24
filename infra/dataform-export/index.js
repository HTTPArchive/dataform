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

function hasRequiredKeys (obj) {
  const requiredKeys = ['dataform_trigger', 'name', 'type', 'environment']
  if (obj.type === 'report') {
    requiredKeys.push('date')
  }

  return requiredKeys.every(key => Object.hasOwn(obj, key))
}

/**
 * Handle incoming message and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
functions.http('dataform-export', async (req, res) => {
  console.log(JSON.stringify(req.body))
  try {
    const payload = req.body.calls[0][0]
    if (!payload) {
      res.status(400).json({
        replies: [400],
        errorMessage: 'Bad Request: no payload received'
      })
    }

    if (!hasRequiredKeys(payload)) {
      res.status(400).json({
        replies: [400],
        errorMessage: 'Bad Request: unexpected payload structure'
      })
    }

    await callRunJob(payload)

    res.status(200).json({
      replies: [200]
    })
  } catch (error) {
    res.status(400).json({
      replies: [400],
      errorMessage: error
    })
  }
})
