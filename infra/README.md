# Infrastructure for the HTTP Archive data pipeline

## Cloud function for triggering Dataform workflows

[dataformTrigger](https://console.cloud.google.com/functions/details/us-central1/dataformTrigger?env=gen2&authuser=7&project=httparchive) Cloud Run Function

This function may be triggered by a PubSub message or Cloud Scheduler and triggers a Dataform workflow based on the trigger configuration provided.

### Trigger configuration

Trigger types:

1. `event` - immediately triggers a Dataform workflow using tags provided in configuration.

2. `poller` - first triggers a BigQuery polling query. If the query returns TRUE, the Dataform workflow is triggered using the tags provided in configuration.

See [available trigger configurations](https://github.com/HTTPArchive/dataform/blob/main/src/index.js#L4).

Request body example with trigger name:

```json
{
  "message": {
    "name": "crux_ready"
  }
}
```

Trigger for local development:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "name": "crux_ready"
    }
  }'
```

## Cloud Function for report data exports

[exportReport](https://console.cloud.google.com/functions/details/us-central1/bqExport?env=gen2&authuser=7&project=httparchive) Cloud Run Function

This function exports reports data to GCS or Firestore.

### Export configuration

```json
{
  "message": {
    "protoPayload": {
      "serviceData": {
        "jobCompletedEvent": {
          "job": {
            "jobConfiguration": {
              "query": {
                "query": "/* {\"dataform_trigger\": \"report_cwv_tech_complete\", \"date\": \"2024-11-01\", \"name\": \"technologies\", \"type\": \"dict\"} *\/"
              }
            }
          }
        }
      }
    }
  }
}
```

Trigger for local development:

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
  "message": {
    "protoPayload": {
      "serviceData": {
        "jobCompletedEvent": {
          "job": {
            "jobConfiguration": {
              "query": {
                "query": "/* {\"dataform_trigger\": \"report_complete\", \"date\": \"2024-11-01\", \"name\": \"bytesTotal\", \"type\": \"timeseries\"} *\/"
              }
            }
          }
        }
      }
    }
  }
}'
```

or

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
  "message": {
    "protoPayload": {
      "serviceData": {
        "jobCompletedEvent": {
          "job": {
            "jobConfiguration": {
              "query": {
                "query": "/* {\"dataform_trigger\": \"report_cwv_tech_complete\", \"date\": \"2024-10-01\", \"name\": \"adoption\", \"type\": \"report\"} *\/"
              }
            }
          }
        }
      }
    }
  }
}'
```

## Monitoring

The issues within the pipeline are being tracked using the following alerts:

1. the event trigger processing fails - [Dataform Trigger Function Error](https://console.cloud.google.com/monitoring/alerting/policies/570799173843203905?authuser=7&project=httparchive)
2. a job in the workflow fails - "[Dataform Workflow Invocation Failed](https://console.cloud.google.com/monitoring/alerting/policies/16526940745374967367?authuser=7&project=httparchive)
3. the export function fails - [Dataform Export Function Error](https://console.cloud.google.com/monitoring/alerting/policies/570799173843203905?authuser=7&project=httparchive)

Error notifications are sent to [#10x-infra](https://httparchive.slack.com/archives/C030V4WAVL3) Slack channel.

## Local development

To test the function locally run from the function directory:

```bash
npm run start
```

Then, in a separate terminal, run the command with the test trigger payload.

## Deployment

From project root directory run:

```bash
make tf_apply
```
