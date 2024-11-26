# Infrastructure for the HTTP Archive data pipeline

## Cloud function for triggering Dataform workflows

[dataformTrigger](https://console.cloud.google.com/functions/details/us-central1/dataformTrigger?env=gen2&authuser=7&project=httparchive) Cloud Run Function

This function may be triggered by a PubSub message or Cloud Scheduler and triggers a Dataform workflow based on the trigger configuration provided.

### Configuration

Trigger types:

1. `event` - immediately triggers a Dataform workflow using tags provided in configuration.

2. `poller` - first triggers a BigQuery polling query. If the query returns TRUE, the Dataform workflow is triggered using the tags provided in configuration.

See [available trigger configurations](https://github.com/HTTPArchive/dataform/blob/main/src/index.js#L4).

Request body example with trigger name:

```json
{
  "name": "cwv_tech_report"
}
```

### Local testing

Run the following command to test the function locally:

```bash
make start
```

Then, in a separate terminal, run the following command to trigger the function:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "name": "cwv_tech_report"
    }
  }'
```

## Cloud Function for report data exports

[exportReport](https://console.cloud.google.com/functions/details/us-central1/bqExport?env=gen2&authuser=7&project=httparchive) Cloud Run Function

This function exports reports data to GCS or Firestore.

### Report configuration

TODO

### Trigger configuration

TODO

## Monitoring

The issues within the pipeline are being tracked using the following alerts:

1. the event trigger processing fails - [Dataform Trigger Function Error](https://console.cloud.google.com/monitoring/alerting/policies/570799173843203905?authuser=7&project=httparchive)
2. a job in the workflow fails - "[Dataform Workflow Invocation Failed](https://console.cloud.google.com/monitoring/alerting/policies/16526940745374967367?authuser=7&project=httparchive)
3. the export function fails - [Dataform Export Function Error](https://console.cloud.google.com/monitoring/alerting/policies/570799173843203905?authuser=7&project=httparchive)

Error notifications are sent to [#10x-infra](https://httparchive.slack.com/archives/C030V4WAVL3) Slack channel.

## Deployment

When you're under `infra/` run:

```bash
make deploy
```
