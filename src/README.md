# Cloud function for triggering Dataform workflows

[dataformTrigger](https://console.cloud.google.com/functions/details/us-central1/dataformTrigger?env=gen2&authuser=7&project=httparchive) Cloud Run Function

This function may be triggered by a PubSub message or Cloud Scheduler and triggers a Dataform workflow based on the trigger configuration provided.

## Configuration

Trigger types:

1. `event` - immediately triggers a Dataform workflow using tags provided in configuration.

2. `poller` - first triggers a BigQuery polling query. If the query returns TRUE, the Dataform workflow is triggered using the tags provided in configuration.

See [available trigger configurations](https://github.com/HTTPArchive/dataform/blob/30a3304bf0e903ec0c54ce1318aa4eed8ae828ed/src/index.js#L4).

Request body example with trigger name:

```json
{
    "name": "cwv_tech_report"
}
```

## Local testing

Run the following command to test the function locally:

```bash
npm run start
```

Then, in a separate terminal, run the following command to trigger the function:

```bash
curl -X POST "http://localhost:8080" -H "Content-Type: application/json" -d '{"name": "cwv_tech_report"}'
```

## Deployment

When you're under `src/` run:

```bash
npm run deploy
```
