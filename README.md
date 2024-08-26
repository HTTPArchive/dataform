# HTTP Archive BigQuery pipeline with Dataform

## Pipelines

### Tables in `all` dataset

- [x] httparchive.all.pages
- [ ] httparchive.all.requests
- [ ] httparchive.all.parsed_css

Using tag `after_crawl` and scheduled 
Schedule: no defined schedule

### The legacy tables

- [ ] httparchive.pages.YYYY_MM_DD_client 
- [ ] httparchive.requests.YYYY_MM_DD_client 
- [x] httparchive.summary_pages.YYYY_MM_DD_client 
- [ ] httparchive.summary_requests.YYYY_MM_DD_client 
- [ ] httparchive.response_bodies.YYYY_MM_DD_client 
- [x] httparchive.lighthouse.YYYY_MM_DD_client 
- [ ] httparchive.technologies.YYYY_MM_DD_client 
- [ ] httparchive.lighthouse.YYYY_MM_DD_client 

Tag: `after_crawl`
Schedule: same as `all` dataset

### Core Web Vitals Technology Report

- [x] httparchive.core_web_vitals.technologies

Tag: `before_crawl`
Schedule: 20:00 UTC on 2nd Tuesday of the month.
> `0 20 8-14 * 2`

## Contributing

1. Open [a Dataform page](https://console.cloud.google.com/bigquery/dataform) in BigQuery console.
2. Create a personal development workspace. ([?](https://cloud.google.com/dataform/docs/create-workspace#create-workspace))
3. Make adjustments to the dataform configuration files and run a test workflow to verify the pipeline.
4. Push all your changes to a remote git branch &open a PR with the link to the data generated in the test workflow.
