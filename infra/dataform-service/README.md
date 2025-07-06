# Dataform Service

A unified [dataform-service](https://console.cloud.google.com/functions/details/us-central1/dataform-service?authuser=7&project=httparchive) Cloud Run service that provides two main endpoints for different operations.

## `/trigger` Trigger Dataform workflows

This service may be triggered by a PubSub message or Cloud Scheduler and invokes a Dataform workflow based on the provided configuration.

Trigger types:

1. `event` - immediately triggers a Dataform workflow using tags provided in configuration.

2. `poller` - first triggers a BigQuery polling query. If the query returns TRUE, the Dataform workflow is triggered using the tags provided in configuration.

Supported Triggers:

- `crux_ready` - polls for Chrome UX Report data availability and triggers processing when conditions are met
- `crawl_complete` - event-based trigger for when crawl data processing is complete

Request body example:

```json
{
  "message": {
    "name": "crux_ready"
  }
}
```

Request example for local development:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "name": "crux_ready"
    }
  }'
```

## `/` Trigger data exports

[exportReport](https://console.cloud.google.com/functions/details/us-central1/bqExport?env=gen2&authuser=7&project=httparchive) Cloud Run Function

This function triggers a job to export data to GCS or Firestore.

Request body example:

```json
{
  "calls": [[{
    "destination": "gs://httparchive-reports/tech-report-2024",
    "config": {
      "format": "PARQUET",
      "compression": "SNAPPY"
    },
    "query": "SELECT * FROM httparchive.reports.tech_report_categories WHERE _TABLE_SUFFIX = '2024_01_01'"
  }]]
}
```

Request example for local development:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
  "calls": [[{
    "destination": "gs://httparchive-reports/tech-report-2024",
    "config": {
      "format": "PARQUET",
      "compression": "SNAPPY"
    },
    "query": "SELECT * FROM httparchive.reports.tech_report_categories WHERE _TABLE_SUFFIX = '2024_01_01'"
  }]]
}'
```

## Cloud Run Job for exporting data

[exportData](https://console.cloud.google.com/run/detail/us-central1/export-data?authuser=7&project=httparchive) Cloud Run Job

This job exports data to GCS or Firestore based on the provided configuration.

Input parameters:

- `EXPORT_CONFIG` - JSON string with the export configuration.

Example values:

```plaintext
{"dataform_trigger":"report_cwv_tech_complete","name":"technologies","type":"dict"}
{"dataform_trigger":"report_cwv_tech_complete","date":"2024-11-01","name":"page_weight","type":"report"}
{"dataform_trigger":"report_complete","name":"bytesTotal","type":"timeseries"}
{"dataform_trigger":"report_complete","date":"2024-11-01","name":"bytesTotal","type":"histogram"}
```

## Monitoring

The issues within the pipeline are being tracked using the following alerts:

- [Dataform Trigger Function Error](https://console.cloud.google.com/monitoring/alerting/policies/570799173843203905?authuser=2&project=httparchive) policy
- [Dataform Export Function Error](https://console.cloud.google.com/monitoring/alerting/policies/2588749473925942477?authuser=2&project=httparchive) policy

Error notifications are sent to [#10x-infra](https://httparchive.slack.com/archives/C030V4WAVL3) Slack channel.

## Local development

To test the function locally run from the function directory:

```bash
npm run start_dev
```

Then, in a separate terminal, run the command with the test trigger payload.

## Deployment

From project root directory run:

```bash
make tf_apply
```
