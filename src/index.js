const functions = require('@google-cloud/functions-framework')

const currentDate = new Date().toISOString().substring(0, 10)
const TRIGGERS = {
  cwv_tech_report: {
    type: 'poller',
    query: `
SELECT LOGICAL_AND(condition)
FROM (
  SELECT TOTAL_ROWS > 0 AS condition
  FROM \`chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS\`
  WHERE TABLE_NAME = 'device_summary'
    AND PARTITION_ID = FORMAT_DATE('%Y%m%d', DATE_SUB(DATE_TRUNC(DATE '${currentDate}', MONTH), INTERVAL 1 MONTH))
  UNION ALL
  SELECT TOTAL_ROWS > 0 AS condition
  FROM \`chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS\`
  WHERE TABLE_NAME = 'device_summary'
    AND PARTITION_ID = FORMAT_DATE('%Y%m%d', DATE_SUB(DATE_TRUNC(DATE '${currentDate}', MONTH), INTERVAL 1 MONTH))
  UNION ALL
  SELECT NOT TOTAL_ROWS > 0 AS condition
  FROM \`httparchive.core_web_vitals.INFORMATION_SCHEMA.PARTITIONS\`
  WHERE TABLE_NAME = 'technologies'
    AND PARTITION_ID = FORMAT_DATE('%Y%m%d', DATE_SUB(DATE_TRUNC(DATE '${currentDate}', MONTH), INTERVAL 1 MONTH))
);
    `,
    action: 'runDataformRepo',
    actionArgs: {
      repoName: 'crawl-data',
      tags: ['cwv_tech_report']
    }
  },
  crawl_complete: {
    type: 'event',
    action: 'runDataformRepo',
    actionArgs: {
      repoName: 'crawl-data',
      tags: [
        'crawl_complete',
        'blink_features_report',
        'crawl_results_legacy'
      ]
    }
  }
}

/**
 * Handle incoming message and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function messageHandler (req, res) {
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

    if (TRIGGERS[eventName]) {
      const trigger = TRIGGERS[eventName]
      if (trigger.type === 'poller') {
        console.log(`Poller action ${eventName}`)
        const result = await runQuery(trigger.query)
        console.log(`Query result: ${result}`)
        if (result) {
          await executeAction(trigger.action, trigger.actionArgs)
        }
      } else if (trigger.type === 'event') {
        console.log(`Event action ${eventName}`)
        await executeAction(trigger.action, trigger.actionArgs)
      } else {
        console.log(`No action found for event: ${eventName}`)
        res.status(404).send(`No action found for event: ${eventName}`)
      }
      res.status(200).send('Event processed sucessfully')
    } else {
      console.log(`No action found for event: ${eventName}`)
      res.status(404).send(`No action found for event: ${eventName}`)
    }
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
}

/**
 * Run BigQuery poll query.
 *
 * @param {string} query Polling query.
 * @returns {boolean} Query result.
 */
async function runQuery (query) {
  const { BigQuery } = require('@google-cloud/bigquery')
  const bigquery = new BigQuery()

  const [job] = await bigquery.createQueryJob({ query })
  console.log(`Query job ${job.id} started.`)

  const [rows] = await job.getQueryResults()
  return rows.length > 0 && rows[0][Object.keys(rows[0])[0]] === true
}

/**
 * Execute action based on the trigger configuration.
 *
 * @param {string} actionName Action to execute.
 * @param {object} actionArgs Action arguments.
 */
async function executeAction (actionName, actionArgs) {
  if (actionName === 'runDataformRepo') {
    console.log(`Executing action: ${actionName}`)
    await runDataformRepo(actionArgs)
  }
}

/**
 * Run Dataform repo action.
 *
 * @param {object} args Action arguments.
 */
async function runDataformRepo (args) {
  const { getCompilationResults, runWorkflow } = require('./dataform')
  const project = 'httparchive'
  const location = 'us-central1'
  const { repoName, tags } = args

  console.log(`Triggering Dataform repo ${repoName} with tags: [${tags}].`)
  const repoURI = `projects/${project}/locations/${location}/repositories/${repoName}`

  const compilationResult = await getCompilationResults(repoURI)
  await runWorkflow(repoURI, compilationResult, tags)
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
functions.http('dataformTrigger', (req, res) => messageHandler(req, res))
