# Infrastructure Overview

## Architecture

```mermaid
flowchart TD
    CR_SCHEDULER["Cloud Scheduler\nbq-poller-crux-ready"]
    PS["Pub/Sub\ncrawl-complete"]
    DS["Cloud Run\ndataform-service"]
    DF["Dataform\nHTTPArchive/dataform"]
    BQ_CRAWL["BigQuery\ncrawl dataset"]
    BQ_REPORTS["BigQuery\nreports dataset"]
    BQ_EXPORT["Cloud Run Job\nbigquery-export"]
    AH["Analytics Hub\nHTTP Archive exchange"]
    FS["Firestore\ntech-report-api-prod"]
    ALLOY["AlloyDB\ndefault / primary\n(Postgres 17)"]
    GCS["Cloud Storage"]
    API["Cloud Run\nreport-api"]
    CDN["Cloud CDN / GLB\ncdn.httparchive.org"]
    CLIENTS["Website / MCP clients"]

    CR_SCHEDULER -->|"polls CrUX readiness"| DS
    PS -->|"crawl-complete event"| DS
    DS -->|"invokes workflow"| DF
    DS -->|"exports files"| GCS
    DF -->|"transforms"| BQ_CRAWL
    BQ_CRAWL -->|"produces"| BQ_REPORTS
    BQ_REPORTS -->|"BQ FDW foreign tables"| ALLOY
    BQ_REPORTS -->|"triggers"| BQ_EXPORT
    BQ_CRAWL -->|"triggers"| DS
    BQ_EXPORT -->|"pushes report data"| FS
    BQ_CRAWL -->|"published via"| AH
    FS -->|"technologies, categories,\nversions, adoption..."| API
    ALLOY -->|"ranks, geos"| API
    BQ_CRAWL -->|"cwv-distribution"| API
    GCS -->|"static assets"| API
    API -->|"proxies"| CDN
    CDN -->|"REST API / MCP"| CLIENTS
```

## Components

| Component | Service | Repo / Config |
| --- | --- | --- |
| Workflow orchestration | Cloud Run (`dataform-service`) | `dataform/infra/main.tf` |
| Dataform pipelines | Dataform (`HTTPArchive/dataform`) | `dataform/infra/dataform.tf` |
| BigQuery export | Cloud Run Job (`bigquery-export`) | `dataform/infra/main.tf` |
| Public data sharing | Analytics Hub | `dataform/infra/data_exchange.tf` |
| AlloyDB cluster + instance | AlloyDB Postgres 17, `n2-highmem-8` | `dataform/infra/alloy.tf` |
| Report API | Cloud Run (`report-api`) | `tech-report-apis/terraform/` |
| CDN / Load Balancer | Cloud CDN + GLB | `tech-report-apis/terraform/cdn-glb/` |
| IAM bindings | Google IAM | `dataform/infra/iam.tf` |
| Alerting | Cloud Monitoring | `dataform/infra/monitoring.tf` |

## Data Sources per API Endpoint

| Endpoint | Backend |
| --- | --- |
| `/technologies`, `/categories`, `/versions` | Firestore (`tech-report-api-prod`) |
| `/ranks`, `/geos` | AlloyDB (`tech_report_ranks`, `tech_report_geos`) |
| `/cwv-distribution` | BigQuery (`crawl` dataset, direct query) |
| `/adoption`, `/cwv`, `/lighthouse`, `/page-weight` | Firestore (`tech-report-api-prod`) |
| Static assets | Cloud Storage (GCS) |

## AlloyDB & BigQuery FDW

Some tables in the `reports` BigQuery dataset are exposed to AlloyDB via the built-in `bigquery_fdw` extension. AlloyDB handles Postgres connections; BigQuery handles all analytical computation. The `report-api` connects via AlloyDB Auth Proxy (IAM auth, no password).

See SQL setup script in [`alloy.tf`](../infra/alloy.tf) (block comment at the bottom).

## Trigger Flow

1. **CrUX data ready** → Cloud Scheduler polls → `dataform-service` invoked
2. **New crawl data in `crawl` dataset** → triggers `dataform-service` → Dataform workflow runs → `crawl` dataset transformed into `reports` dataset; files exported to GCS
3. **`reports` dataset updated** → triggers `bigquery-export` → pushes report data to Firestore; `crawl` dataset published via Analytics Hub
4. **AlloyDB** serves `ranks` and `geos` from report tables via BigQuery FDW
