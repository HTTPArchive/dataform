# HTTP Archive datasets pipeline

This repository handles the HTTP Archive data pipeline, which takes the results of the monthly HTTP Archive run and saves this to the `httparchive` dataset in BigQuery.

## Pipelines

The pipelines are run in Dataform service in Google Cloud Platform (GCP) and are kicked off automatically on crawl completion and other events. The code in the `main` branch is used on each triggered pipeline run.

### HTTP Archive Crawl

Tag: `crawl_complete`

- Crawl dataset `httparchive.crawl.*`

  Consumers:

  - public dataset and [BQ Sharing Listing](https://console.cloud.google.com/bigquery/analytics-hub/discovery/projects/httparchive/locations/us/dataExchanges/httparchive/listings/crawl)

- Blink Features Report `httparchive.blink_features.usage`

  Consumers:

  - [chromestatus.com](https://chromestatus.com/metrics/feature/timeline/popularity/2089)

### HTTP Archive Technology Report

Tag: `crux_ready`

- `httparchive.reports.cwv_tech_*` and `httparchive.reports.tech_*`

  Consumers:

  - [HTTP Archive Tech Report](https://httparchive.org/reports/techreport/landing)

## Schedules

1. [crawl-complete](https://console.cloud.google.com/cloudpubsub/subscription/detail/dataform-service-crawl-complete?authuser=2&project=httparchive) PubSub subscription

    Tags: ["crawl_complete"]

2. [bq-poller-crux-ready](https://console.cloud.google.com/cloudscheduler/jobs/edit/us-central1/bq-poller-crux-ready?authuser=7&project=httparchive) Scheduler

    Tags: ["crux_ready"]

### Triggering workflows

In order to unify the workflow triggering mechanism, we use [a Cloud Run function](./infra/README.md) that can be invoked in a number of ways (e.g. listen to PubSub messages), do intermediate checks and trigger the particular Dataform workflow execution configuration.

## Cloud resources overview

```mermaid
graph TB;
    subgraph Cloud Run
        dataform-service[dataform-service service]
        bigquery-export[bigquery-export job]
    end

    subgraph PubSub
        crawl-complete[crawl-complete topic]
        dataform-service-crawl-complete[dataform-service-crawl-complete subscription]
        crawl-complete --> dataform-service-crawl-complete
    end

    dataform-service-crawl-complete --> dataform-service

    subgraph Cloud_Scheduler
        bq-poller-crux-ready[bq-poller-crux-ready Poller Scheduler Job]
        bq-poller-crux-ready --> dataform-service
    end

    subgraph Dataform
        dataform[Dataform Repository]
        dataform_release_config[dataform Release Configuration]
        dataform_workflow[dataform Workflow Execution]
    end

    dataform-service --> dataform[Dataform Repository]
    dataform --> dataform_release_config
    dataform_release_config --> dataform_workflow

    subgraph BigQuery
        bq_jobs[BigQuery jobs]
        bq_datasets[BigQuery table updates]
        bq_jobs --> bq_datasets
    end

    dataform_workflow --> bq_jobs

    bq_jobs --> bigquery-export

    subgraph Monitoring
        cloud_run_logs[Cloud Run logs]
        dataform_logs[Dataform logs]
        bq_logs[BigQuery logs]
        alerting_policies[Alerting Policies]
        slack_notifications[Slack notifications]

        cloud_run_logs --> alerting_policies
        dataform_logs --> alerting_policies
        bq_logs --> alerting_policies
        alerting_policies --> slack_notifications
    end

    dataform-service --> cloud_run_logs
    dataform_workflow --> dataform_logs
    bq_jobs --> bq_logs
    bigquery-export --> cloud_run_logs
```

## Development Setup

1. Install dependencies:

    ```bash
    npm install
    ```

2. Available Scripts:

    - `npm run format` - Format code using Standard.js, fix Markdown issues, and format Terraform files
    - `npm run lint` - Run linting checks on JavaScript, Markdown files, and compile Dataform configs
    - `make tf_apply` - Apply Terraform configurations

## Code Quality

This repository uses:

- Standard.js for JavaScript code style
- Markdownlint for Markdown file formatting
- Dataform's built-in compiler for SQL validation
