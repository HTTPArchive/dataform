# HTTP Archive BigQuery pipeline with Dataform

## Tables

### Crawl tables in `all` dataset

Tag: `after_crawl_all`

- [x] httparchive.all.pages
- [x] httparchive.all.requests
- [x] httparchive.all.parsed_css

### Legacy crawl tables

Tag: `after_crawl_legacy`

- [ ] httparchive.pages.YYYY_MM_DD_client
- [ ] httparchive.requests.YYYY_MM_DD_client
- [x] httparchive.summary_pages.YYYY_MM_DD_client
- [ ] httparchive.summary_requests.YYYY_MM_DD_client
- [ ] httparchive.response_bodies.YYYY_MM_DD_client
- [x] httparchive.lighthouse.YYYY_MM_DD_client
- [ ] httparchive.technologies.YYYY_MM_DD_client
- [ ] httparchive.lighthouse.YYYY_MM_DD_client

### Core Web Vitals Technology Report

Tag: `before_crawl_cwv`

- [x] httparchive.core_web_vitals.technologies

## Schedules

1. [crawl-complete](https://console.cloud.google.com/cloudpubsub/topic/detail/crawl-complete?authuser=7&project=httparchive&supportedpurview=project&tab=subscriptions) PubSub topic + [crawl-complete](https://console.cloud.google.com/workflows/workflow/us-central1/crawl-complete/metrics?authuser=7&project=httparchive&supportedpurview=project) Workflow

    Tags:

   - after_crawl_all
   - after_crawl_legacy

2. [???](https://console.cloud.google.com/cloudpubsub/topic/list?authuser=7&project=httparchive&supportedpurview=project) PubSub topic + [???](https://console.cloud.google.com/workflows?authuser=7&project=httparchive&supportedpurview=project) Workflow

    Tags:

    - before_crawl_cwv

## Contributing

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in Dataform.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the BigQuery artifacts generated in the test workflow.
