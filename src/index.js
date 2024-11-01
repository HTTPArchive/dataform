const functions = require('@google-cloud/functions-framework')

const TRIGGERS = {
  cwv_tech_report: {
    type: 'poller',
    query: `
DECLARE previousMonth STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH));
DECLARE previousMonth_YYYYMM STRING DEFAULT SUBSTR(previousMonth, 1, 6);

WITH crux AS (
  SELECT
    LOGICAL_AND(total_rows > 0) AS rows_available,
    LOGICAL_AND(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_modified_time, HOUR) < 7) AS recent_last_modified
  FROM chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS
  WHERE table_name IN ('device_summary', 'country_summary')
    AND partition_id IN (previousMonth, previousMonth_YYYYMM)
), report AS (
  SELECT TOTAL_ROWS > 0 AS report_exists
  FROM httparchive.core_web_vitals.INFORMATION_SCHEMA.PARTITIONS
  WHERE table_name = 'technologies'
    AND partition_id = previousMonth
)

SELECT
  (rows_available AND NOT report_exists)
    OR (rows_available AND recent_last_modified) AS condition
FROM crux, report;
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
