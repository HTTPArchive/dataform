import functions from '@google-cloud/functions-framework'
import { ReportsExporter, TechReportsExporter } from './reports.js'

/**
 * Handle incoming message and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function messageHandler (req, res) {
  try {
    const message = req.body.message // TODO: switch to unwrapped payload https://cloud.google.com/pubsub/docs/payload-unwrapping
    if (!message) {
      const msg = 'no message received'
      console.error(`error: ${msg}`)
      console.info(req.body)
      res.status(400).send(`Bad Request: ${msg}`)
      return
    }

    const messageData = (message.data && JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'))) || message
    if (!messageData) {
      console.info(message)
      res.status(400).send('Bad Request: invalid message format')
      return
    }

    const query = messageData.protoPayload.serviceData.jobCompletedEvent.job.jobConfiguration.query.query
    if (!query) {
      console.info(messageData)
      res.status(400).send('Bad Request: no query found')
      return
    }

    const regex = /\/\* ({"dataform_trigger":.+) \*\//
    // console.log(query)
    const reportConfig = regex.exec(query)
    // console.log(reportConfig)
    if (!reportConfig) {
      console.info(query.substring(0, 30))
      res.status(400).send('Bad Request: no trigger config found')
      return
    }

    const eventData = JSON.parse(reportConfig[1])
    const eventName = eventData.dataform_trigger
    if (!eventName) {
      console.info(eventData)
      res.status(400).send('Bad Request: no trigger name found')
      return
    }

    if (eventName === 'report_complete') {
      console.info('Report export')
      console.info(eventData)
      const reports = new ReportsExporter()
      await reports.export(eventData)
    } else if (eventName === 'report_cwv_tech_complete') {
      console.info('Tech Report export')
      console.info(eventData)
      const techReports = new TechReportsExporter()
      await techReports.export(eventData)
    } else {
      console.info(eventData)
      res.status(400).send('Bad Request: unknown trigger name')
      return
    }
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
