# HTTP Archive BigQuery pipeline with Dataform

This repo handles the HTTP Archive data pipeline, which takes the results of the monthly HTTP Archive run and saves this to the `httparchive` dataset in BigQuery.

## Pipelines

The pipelines are run in Dataform service in Google Cloud Platform (GCP) and are kicked off automatically on crawl completion and other events. The code in the `main` branch is used on each triggered pipeline run.

### Crawl tables in `all` dataset

Tag: `crawl_results_all`

- [x] httparchive.all.pages
- [x] httparchive.all.parsed_css
- [x] httparchive.all.requests

### Core Web Vitals Technology Report

Tag: `cwv_tech_report`

- [x] httparchive.core_web_vitals.technologies

### Legacy crawl tables (to be deprecated)

Tag: `crawl_results_legacy`

- [x] httparchive.lighthouse.YYYY_MM_DD_client
- [x] httparchive.pages.YYYY_MM_DD_client
- [x] httparchive.requests.YYYY_MM_DD_client
- [x] httparchive.response_bodies.YYYY_MM_DD_client
- [x] httparchive.summary_pages.YYYY_MM_DD_client
- [x] httparchive.summary_requests.YYYY_MM_DD_client
- [x] httparchive.technologies.YYYY_MM_DD_client

## Schedules

1. [crawl-complete](https://console.cloud.google.com/cloudpubsub/subscription/detail/dataformTrigger?authuser=7&project=httparchive) PubSub subscription

    Tags:

   - crawl_results_all
   - crawl_results_legacy

2. [bq-poller-cwv-tech-report](https://console.cloud.google.com/cloudscheduler/jobs/edit/us-east4/bq-poller-cwv-tech-report?authuser=7&project=httparchive) Scheduler

    Tags:

    - cwv_tech_report

### Triggering workflows

[see here](./src/README.md)

## Contributing

### Dataform development

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in Dataform.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the BigQuery artifacts generated in the test workflow.

### Dataform development workspace hints

1. In workflow settings vars:
   1. set `env_name: dev` to process sampled data in dev workspace.
   2. change `today` variable to a month in the past. May be helpful for testing pipelines based on `chrome-ux-report` data.
2. `definitions/extra/test_env.sqlx` script helps to setup the tables required to run pipelines when in dev workspace. It's disabled by default.

### Error Monitoring

The issues within the pipeline are being tracked using the following alerts:

1. the event trigger processing fails - [Dataform Trigger Function Error](https://console.cloud.google.com/monitoring/alerting/policies/3950167380893746326?authuser=7&project=httparchive)
2. a job in the workflow fails - "[Dataform Workflow Invocation Failed](https://console.cloud.google.com/monitoring/alerting/policies/7137542315653007241?authuser=7&project=httparchive)

Error notifications are sent to [#10x-infra](https://httparchive.slack.com/archives/C030V4WAVL3) Slack channel.
