# HTTP Archive BigQuery pipeline with Dataform

## Datasets

### Crawl results

Tag: `crawl_results_all`

- httparchive.all.pages
- httparchive.all.parsed_css
- httparchive.all.requests

### Core Web Vitals Technology Report

Tag: `cwv_tech_report`

- httparchive.core_web_vitals.technologies

Consumers:

- [HTTP Archive Tech Report](https://httparchive.org/reports/techreport/landing)

### Blink Features Report

Tag: `blink_features_report`

- httparchive.blink_features.features
- httparchive.blink_features.usage

Consumers:

- [chromestatus.com](https://chromestatus.com/metrics/feature/timeline/popularity/2089)

### Legacy crawl results (to be deprecated)

Tag: `crawl_results_legacy`

- httparchive.lighthouse.YYYY_MM_DD_client
- httparchive.pages.YYYY_MM_DD_client
- httparchive.requests.YYYY_MM_DD_client
- httparchive.response_bodies.YYYY_MM_DD_client
- httparchive.summary_pages.YYYY_MM_DD_client
- httparchive.summary_requests.YYYY_MM_DD_client
- httparchive.technologies.YYYY_MM_DD_client

## Schedules

1. [crawl-complete](https://console.cloud.google.com/cloudpubsub/subscription/detail/dataformTrigger?authuser=7&project=httparchive) PubSub subscription

    Tags: ["crawl_results_all", "blink_features_report", "crawl_results_legacy"]

2. [bq-poller-cwv-tech-report](https://console.cloud.google.com/cloudscheduler/jobs/edit/us-east4/bq-poller-cwv-tech-report?authuser=7&project=httparchive) Scheduler

    Tags: ["cwv_tech_report"]

### Triggering workflows

[see here](./src/README.md)

## Contributing

### Dataform development

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in Dataform.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the BigQuery artifacts generated in the test workflow.

### Dataform development workspace hints

1. In workflow settings vars set `dev_name: dev` to process sampled data in dev workspace.
2. Change `today` variable to a date in the past. May be helpful for testing pipelines based on `chrome-ux-report` data.
3. `definitions/extra/test_env.sqlx` script helps to setup the tables required to run pipelines when in dev workspace. It's disabled by default.
