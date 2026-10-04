# Dataform

Runs the batch processing workflows. There are two Dataform repositories for [development](https://console.cloud.google.com/bigquery/dataform/locations/us-central1/repositories/crawl-data-test/details/workspaces?authuser=7&project=httparchive) and [production](https://console.cloud.google.com/bigquery/dataform/locations/us-central1/repositories/crawl-data/details/workspaces?authuser=7&project=httparchive).

The test repository is used [for development and testing purposes](https://cloud.google.com/dataform/docs/workspaces) and not connected to the rest of the pipeline infra.

Pipelines can be [run manually](https://cloud.google.com/dataform/docs/code-lifecycle) from the Dataform UI or orchestrated automatically via Apache Airflow.

The infrastructure configurations are in the [tech-report-apis](../../tech-report-apis) monorepo. Refer to [terraform/dataform.tf](../../tech-report-apis/terraform/dataform.tf) and [terraform/airflow.tf](../../tech-report-apis/terraform/airflow.tf) for Dataform and Composer IaC.

## Pipeline Orchestration (Apache Airflow)

Production pipeline invocations are managed by Google Cloud Composer ([httparchive-pipelines](https://console.cloud.google.com/composer/environments/detail/us-central1/httparchive-pipelines/overview?authuser=2&project=httparchive)). The DAG definitions are maintained in [`airflow/dags/`](../airflow/dags/):

1. **`crawl_complete` DAG** ([`airflow/dags/crawl_complete.py`](../airflow/dags/crawl_complete.py)):
   - Triggered by the `crawl-complete` Pub/Sub topic via `PubSubPullSensor`.
   - Executes `sync_public_suffix_list` task to fetch the full Public Suffix List (ICANN + private) into `httparchive.urls.public_suffix_list`.
   - Creates a compilation result against the production release config and invokes Dataform with tags:
     - `crawl_complete`
     - `crawl_complete_reports`

2. **`crux_ready` DAG** ([`airflow/dags/crux_ready.py`](../airflow/dags/crux_ready.py)):
   - Scheduled at 08:00, 12:00, and 16:00 UTC during the CrUX release window (8th–14th of each month).
   - Sensor queries BigQuery to verify that the previous month's `chrome-ux-report` table has been published.
   - Creates a compilation result and invokes Dataform with tags:
     - `crux_ready`
     - `crux_ready_reports`

### DAG Deployment

Airflow DAGs are automatically synchronized from `airflow/dags/` to the Cloud Composer Cloud Storage bucket (`gs://us-central1-httparchive-pip-77e1b883-bucket/dags`) via the [Deploy Airflow DAGs GitHub Actions workflow](../.github/workflows/deploy_dags.yaml) on merge to `main`.

## Dataform Development Workspace

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in test Dataform repository.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the BigQuery artifacts generated in the test workflow.

_Some useful hints:_

1. In workflow settings vars set `dev_name: dev` to process sampled data in dev workspace.
2. Change `current_month` variable to a month in the past. May be helpful for testing pipelines based on `chrome-ux-report` data.
3. `definitions/extra/test_env.sqlx` script helps to setup the tables required to run pipelines when in dev workspace. It's disabled by default.

## Workspace hints

1. In `workflow_settings.yaml` set `environment: dev` to process sampled data.
2. For development and testing, you can modify variables in `includes/constants.js`, but note that these are programmatically generated.

## Repository Structure

- `airflow/` - Cloud Composer / Apache Airflow DAG definitions and helper modules
  - `dags/` - Production Airflow DAGs (`crawl_complete.py`, `crux_ready.py`) and shared utilities (`common/`)
- `definitions/` - Contains the core Dataform SQL definitions and declarations
  - `output/` - Contains the main pipeline transformation logic
  - `declarations/` - Contains referenced tables/views declarations and external resources
- `includes/` - Contains shared JavaScript utilities and constants
- `docs/` - Additional documentation

## GitHub to Dataform connection

GitHub PAT saved to a [Secret Manager secret](https://console.cloud.google.com/security/secret-manager/secret/GitHub_max-ostapenko_dataform_PAT/versions?authuser=7&project=httparchive).

- repository: HTTPArchive/dataform
- permissions:
  - Commit statuses: read
  - Contents: read

## Monitoring

- [Airflow Web UI](https://225068d09fdc4614b12e9aa283e4e4ab-dot-us-central1.composer.googleusercontent.com)
- [Production Dataform workflow execution logs](https://console.cloud.google.com/bigquery/dataform/locations/us-central1/repositories/crawl-data/details/workflows?authuser=7&project=httparchive)
- [Dataform Workflow Invocation Failed](https://console.cloud.google.com/monitoring/alerting/policies/16526940745374967367?authuser=7&project=httparchive) policy
