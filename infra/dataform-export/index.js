const functions = require('@google-cloud/functions-framework')
const { ReportsExporter, TechReportsExporter } = require('./reports')

/**
 * Handle incoming message and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function messageHandler (req, res) {
  try {
    if (!req.body.jsonPayload.message.data) {
      const msg = 'no message received'
      console.error(`error: ${msg}`)
      res.status(400).send(`Bad Request: ${msg}`)
      return
    }
    const message = Buffer.from(req.body.jsonPayload.message.data, 'base64').toString('utf-8')
    query = JSON.parse(message)?.protoPayload?.serviceData?.jobCompletedEvent?.job?.jobConfiguration?.query?.query
    if (!query) {
      res.status(400).send('Bad Request: invalid message format')
      return
    }
    console.log(query.substring(0,30))

    const regex = /\/\* (\{\\"dataform_trigger\\":.*) \*\//gm
    const reportConfig = regex.exec(query)
    if (!reportConfig) {
      res.status(400).send('Bad Request: no trigger config found')
      return
    }
    const eventData = JSON.parse(reportConfig[1])
    const eventName = eventData.dataform_trigger
    if (!eventName) {
      res.status(400).send('Bad Request: no trigger name found')
      return
    }

    if (eventName === 'reports_complete') {
      const reports = new ReportsExporter(eventData)
      reports.export(eventData)
    } else if (eventName === 'reports_cwv_tech_complete') {
      const techReports = new TechReportsExporter()
      techReports.export(eventData)
    } else {
      res.status(400).send('Bad Request: unknown trigger name')
    }
    res.status(200).send('OK')
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
}

/**
 * Trigger function for Dataform workflows.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 *
 * Example request payload:
 * {
 *  "message": {
 *     "name": "cwv_tech_report"
 *   }
 * }
 */
functions.http('dataform-export', (req, res) => messageHandler(req, res))
