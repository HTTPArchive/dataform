import functions from '@google-cloud/functions-framework'
import { BigQuery } from '@google-cloud/bigquery'

import { callRunJob } from './cloud_run.js'
import { getCompilationResults, runWorkflow } from './dataform.js'

const projectId = 'httparchive'
const location = 'us-central1'
const jobId = 'bigquery-export'

const TRIGGERS = {
  crux_ready: {
    type: 'poller',
    query: `
DECLARE previousMonth STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH));
DECLARE previousMonth_YYYYMM STRING DEFAULT SUBSTR(previousMonth, 1, 6);

WITH crux AS (
  SELECT
    LOGICAL_AND(total_rows > 0) AS rows_available,
    LOGICAL_OR(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_modified_time, HOUR) < 8) AS recent_last_modified
  FROM chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS
  WHERE table_name IN ('device_summary', 'country_summary')
    AND partition_id IN (previousMonth, previousMonth_YYYYMM)
), report AS (
  SELECT MAX(partition_id) = previousMonth AS report_exists
  FROM httparchive.reports.INFORMATION_SCHEMA.PARTITIONS
  WHERE table_name = 'tech_report_categories'
    AND partition_id != '__NULL__'
)

SELECT
  (rows_available AND NOT report_exists)
    OR (rows_available AND recent_last_modified) AS condition
FROM crux, report;
    `,
    action: 'runDataformRepo',
    actionArgs: {
      repoName: 'crawl-data',
      tags: ['crux_ready']
    }
  },
  crawl_complete: {
    type: 'event',
    action: 'runDataformRepo',
    actionArgs: {
      repoName: 'crawl-data',
      tags: [
        'crawl_complete'
      ]
    }
  }
}

function hasRequiredKeys (obj) {
  const requiredKeys = ['destination', 'config', 'query']
  return requiredKeys.every(key => key in obj)
}

/**
 * Handle export requests.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function handleExport (req, res) {
  console.log(JSON.stringify(req.body))
  try {
    const payload = req.body.calls[0][0]
    if (!payload) {
      res.status(400).json({
        replies: [400],
        errorMessage: 'Bad Request: no payload received, expected JSON object'
      })
      return
    }

    if (!hasRequiredKeys(payload)) {
      res.status(400).json({
        replies: [400],
        errorMessage: 'Bad Request: unexpected payload structure, required keys: destination, config, query'
      })
      return
    }

    const jobName = `projects/${projectId}/locations/${location}/jobs/${jobId}`
    await callRunJob(jobName, payload)

    res.status(200).json({
      replies: [200],
      message: 'Export job initialized'
    })
  } catch (error) {
    res.status(400).json({
      replies: [400],
      errorMessage: error
    })
  }
}

// Trigger functionality
/**
 * Handle trigger messages and trigger the appropriate action.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function handleTrigger (req, res) {
  try {
    const message = req.body.message
    if (!message) {
      const msg = 'no message received'
      console.error(`error: ${msg}`)
      console.log(req.body)
      res.status(400).send(`Bad Request: ${msg}`)
      return
    }

    const messageData = message.data
      ? JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'))
      : message
    if (!messageData) {
      console.error(message)
      res.status(400).send('Bad Request: invalid message format')
      return
    }

    const eventName = messageData.name
    if (!eventName) {
      console.error(messageData)
      res.status(400).send('Bad Request: no trigger name found')
      return
    }

    if (TRIGGERS[eventName]) {
      const trigger = TRIGGERS[eventName]
      if (trigger.type === 'poller') {
        console.info(`Poller action ${eventName}`)
        const result = await runQuery(trigger.query)
        console.info(`Query result: ${result}`)
        if (result) {
          await executeAction(trigger.action, trigger.actionArgs)
        }
      } else if (trigger.type === 'event') {
        console.info(`Event action ${eventName}`)
        await executeAction(trigger.action, trigger.actionArgs)
      } else {
        console.error(`No action found for event: ${eventName}`)
        res.status(404).send(`No action found for event: ${eventName}`)
        return
      }
      res.status(200).send('Event processed successfully')
    } else {
      console.error(`No action found for event: ${eventName}`)
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
  const bigquery = new BigQuery()

  const [job] = await bigquery.createQueryJob({ query })
  console.info(`Query job ${job.id} started.`)

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
    console.info(`Executing action: ${actionName}`)
    await runDataformRepo(actionArgs)
  }
}

/**
 * Run Dataform repo action.
 *
 * @param {object} args Action arguments.
 */
async function runDataformRepo (args) {
  const project = 'httparchive'
  const location = 'us-central1'
  const { repoName, tags } = args

  console.info(`Triggering Dataform repo ${repoName} with tags: [${tags}].`)
  const repoURI = `projects/${project}/locations/${location}/repositories/${repoName}`

  const compilationResult = await getCompilationResults(repoURI)
  await runWorkflow(repoURI, compilationResult, tags)
}

/**
 * Main HTTP handler that routes requests based on path.
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 */
async function mainHandler (req, res) {
  const path = req.path || req.url

  console.info(`Received request for path: ${path}`)

  if (path === '/trigger' || path.startsWith('/trigger/')) {
    await handleTrigger(req, res)
  } else if (path === '/') {
    await handleExport(req, res)
  } else {
    res.status(404).json({
      error: 'Not Found',
      message: 'Available endpoints: /, /export'
    })
  }
}

/**
 * Main entry point for the combined Dataform service.
 * Handles both trigger and export operations based on the request path.
 *
 * Routes:
 * - /trigger: Handles Dataform workflow triggers
 * - /: Handles BigQuery export jobs
 *
 * @param {object} req Cloud Function request context.
 * @param {object} res Cloud Function response context.
 *
 * Example trigger request payload:
 * {
 *  "message": {
 *     "name": "crux_ready"
 *   }
 * }
 *
 * Example export request payload:
 * {
 *   "calls": [[{
 *     "destination": "...",
 *     "config": "...",
 *     "query": "..."
 *   }]]
 * }
 */
functions.http('dataform-service', mainHandler)
