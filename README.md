# HTTP Archive BigQuery pipeline with Dataform

## Tables

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

1. [crawl-complete](https://console.cloud.google.com/cloudpubsub/topic/detail/crawl-complete?authuser=7&project=httparchive&supportedpurview=project&tab=subscriptions) PubSub topic + [dataform-trigger](https://console.cloud.google.com/functions/details/us-central1/dataform-trigger?env=gen2&authuser=7&project=httparchive&tab=source&cloudshell=true) Function

    Tags:

   - crawl_results_all
   - crawl_results_legacy

2. [bq-poller-cwv-tech-report](https://console.cloud.google.com/cloudscheduler/jobs/edit/us-east4/bq-poller-cwv-tech-report?authuser=7&project=httparchive) Scheduler + [dataform-trigger](https://console.cloud.google.com/functions/details/us-central1/dataform-trigger?env=gen2&authuser=7&project=httparchive&tab=source&cloudshell=true) Function

    Tags:

    - cwv_tech_report

## Contributing

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in Dataform.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the BigQuery artifacts generated in the test workflow.

Development workspace hints:

1. In workflow settings vars set `dev_name: dev` to process sampled data in dev workspace.
2. Change `current_month` variable to a month in the past. May be helpful for testing pipelines based on `chrome-ux-report` data.
3. `definitions/extra/test_env.sqlx` script helps to setup the tables required to run pipelines when in dev workspace. It's disabled by default.
