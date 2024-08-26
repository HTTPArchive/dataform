# HTTP Archive BigQuery pipeline with Dataform

## Pipelines

### Tables in `all` dataset

- [x] httparchive.all.pages
- [ ] httparchive.all.requests
- [ ] httparchive.all.parsed_css

Schedule: no defined schedule

Manual run: execute `after_crawl_all` tag

### The legacy tables

- [ ] httparchive.pages.YYYY_MM_DD_client 
- [ ] httparchive.requests.YYYY_MM_DD_client 
- [x] httparchive.summary_pages.YYYY_MM_DD_client 
- [ ] httparchive.summary_requests.YYYY_MM_DD_client 
- [ ] httparchive.response_bodies.YYYY_MM_DD_client 
- [x] httparchive.lighthouse.YYYY_MM_DD_client 
- [ ] httparchive.technologies.YYYY_MM_DD_client 
- [ ] httparchive.lighthouse.YYYY_MM_DD_client 

Schedule: no defined schedule

Manual run: execute `after_crawl_legacy` tag

### Core Web Vitals Technology Report

- [x] httparchive.core_web_vitals.technologies

Schedule: 20:00 UTC on 2nd Tuesday of the month.
> `0 20 8-14 * 2`

Manual run: execute `before_crawl_cwv` tag

## Contributing

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in Dataform.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the data generated in the test workflow.
