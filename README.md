# HTTP Archive datasets pipeline

This repository handles the HTTP Archive data pipeline, which takes the results of the monthly HTTP Archive run and saves this to the `httparchive` dataset in BigQuery.

## Pipelines & Orchestration

Pipelines are transformed via Dataform and orchestrated by Google Cloud Composer (Apache Airflow) in GCP. Airflow DAGs reside in [`airflow/dags/`](./airflow/dags/) and are synced to Cloud Composer on merge to `main`.

| Pipeline               | DAG                                                                  | Dataform Tags                              | Primary Outputs                                                                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP Archive Crawl** | [`airflow/dags/crawl_complete.py`](./airflow/dags/crawl_complete.py) | `crawl_complete`, `crawl_complete_reports` | `httparchive.crawl.*` ([Analytics Hub](https://console.cloud.google.com/bigquery/analytics-hub/discovery/projects/httparchive/locations/us/dataExchanges/httparchive/listings/crawl)), `httparchive.blink_features.usage` ([chromestatus.com](https://chromestatus.com/metrics/feature/timeline/popularity/2089)) |
| **Technology Report**  | [`airflow/dags/crux_ready.py`](./airflow/dags/crux_ready.py)         | `crux_ready`, `crux_ready_reports`         | `httparchive.reports.cwv_tech_*`, `httparchive.reports.tech_*` ([Tech Report](https://httparchive.org/reports/techreport/landing))                                                                                                                                                                                |

For complete orchestration details (triggers, sensors, pre-tasks) and development workspace guidelines, see [Dataform Documentation](docs/dataform.md).
For overall GCP infrastructure and data flows, see [Infrastructure Overview](../tech-report-apis/docs/infra.md).

## Development Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Available Scripts:

   - `npm run format` - Format code and fix Markdown issues
   - `npm run lint` - Run linting checks on Markdown files, and compile Dataform configs

## Code Quality

This repository uses:

- Markdownlint for Markdown file formatting
- Dataform's built-in compiler for SQL validation
