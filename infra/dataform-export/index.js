const functions = require('@google-cloud/functions-framework')
const { ReportsExporter, TechReportsExporter } = require('./reports')

/**
 * Handle incoming message and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function messageHandler (req, res) {
  console.log('messageHandler')
  console.log(JSON.stringify(req.body))
  try {
    if (!req.body) {
      const msg = 'no message received'
      console.error(`error: ${msg}`)
      res.status(400).send(`Bad Request: ${msg}`)
      return
    }
    let message = req?.body?.message
    if (!message) {
      res.status(400).send('Bad Request: invalid message format')
      return
    }

    message = message.data
      ? JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'))
      : message
    const eventName = message.name
    if (!eventName) {
      res.status(400).send('Bad Request: no trigger name found')
      return
    }

    if (eventName === 'exportReports') {
      const reports = new ReportsExporter()
      reports.export()
    } else if (eventName === 'exportTechReports') {
      const techReports = new TechReportsExporter()
      techReports.export()
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
