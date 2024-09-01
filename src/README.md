# Cloud function for triggering Dataform workflows

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
