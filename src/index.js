const functions = require('@google-cloud/functions-framework');
const { BigQuery } = require('@google-cloud/bigquery');
const { get_compilation_results, run_workflow } = require('./dataform');

const TRIGGERS = {
  pollers: {
    "cwv_tech_report": {
      query: `
SELECT LOGICAL_AND(row_count)
FROM (
  SELECT TOTAL_ROWS > 0 AS row_count
  FROM \`chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS\`
  WHERE TABLE_NAME = 'device_summary'
    AND PARTITION_ID = '20240701'
  UNION ALL
  SELECT TOTAL_ROWS > 0 AS row_count
  FROM \`chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS\`
  WHERE TABLE_NAME = 'device_summary'
    AND PARTITION_ID = '20240701'
)
      `,
      action: "runDataformRepo",
      actionArgs: {
        repoName: "crawl-data",
        tags: ["cwv_tech_report"]
      }
    }
  },
  events: {
    "crawl-complete": {
      action: "runDataformRepo",
      actionArgs: {
        repoName: "crawl-data",
        tags: ["crawl_results_all", "crawl_results_legacy"]
      }
    }
  }
};

async function pubsubHandler(req, res) {
  try {
    const pubsubMessage = req.body.data.message;
    if (!pubsubMessage) {
      res.status(400).send("Bad Request: No Pub/Sub message received");
      return;
    }

    const messageData = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
    const messageName = JSON.parse(messageData).name;

    if (TRIGGERS.events[messageName]) {
      const eventTrigger = TRIGGERS.events[messageName];
      const actionName = eventTrigger.action;
      const actionArgs = eventTrigger.actionArgs;
      await executeAction(actionName, actionArgs);
      console.log(`Executed action for event: ${messageName}`);
      res.status(200).send(`Processed event: ${messageName}`);
    } else {
      console.log(`No action defined for event: ${messageName}`);
      res.status(200).send(`No action for event: ${messageName}`);
    }
  } catch (error) {
    console.error("Error processing Pub/Sub message:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function schedulerHandler(req, res) {
  try {
    console.log(`Executing scheduler-triggered action: ${req.query.name}`);
    if (req.query.name in TRIGGERS.pollers) {
      const trigger = TRIGGERS.pollers[req.query.name];
      const result = await runQuery(trigger.query);

      if (result) {
        await executeAction(trigger.action, trigger.actionArgs);
      }

      res.status(200).send("Scheduler-triggered actions executed successfully.");
    } else {
      res.status(404).send("Scheduler-triggered action not found.");
    }

  } catch (error) {
    console.error("Error executing scheduler-triggered actions:", error);
    res.status(500).send("Internal Server Error");
  }
}

// Function to run a BigQuery query
async function runQuery(query) {
  const bigquery = new BigQuery();

  try {
    const [job] = await bigquery.createQueryJob({ query });
    console.log(`Query job ${job.id} started.`);

    const [rows] = await job.getQueryResults();
    return rows.length > 0 && rows[0][Object.keys(rows[0])[0]] === true;
  } catch (error) {
    console.error("Error running query:", error);
    return false;
  }
}

// Function to execute an action based on the trigger configuration
async function executeAction(actionName, actionArgs) {
  if (actionName === "runDataformRepo") {
    await runDataformRepo(actionArgs);
  }
}

// Example function to simulate running a Dataform repo action
async function runDataformRepo(args) {
  const project = 'httparchive';
  const location = 'us-central1';
  try {
    const { repoName, tags } = args;
    console.log(`Triggering Dataform repo ${repoName} with tag ${tags}.`);
    const repoURI = `projects/${project}/locations/${location}/repositories/${repoName}`;

    const compilationResult = await get_compilation_results(repoURI);
    const workflowInvocation = await run_workflow(repoURI, compilationResult, tags);
    return `${workflowInvocation.name} complete`;
  } catch (error) {
    console.error("Error triggering Dataform repo:", error);
  }
}

// The main entry point for the Cloud Function
functions.http('dataformTrigger', (req, res) => {
  switch (req.path) {
    case '/':
      console.log('PubSub handler');
      pubsubHandler(req, res);
      break;
    case '/scheduler':
      console.log('Scheduler handler');
      schedulerHandler(req, res)
      break;
    default:
      res.status(404).send("Handler not found");
  }
});
