# Dataform

Runs the batch processing workflows. There are two Dataform repositories for [development](https://console.cloud.google.com/bigquery/dataform/locations/us-central1/repositories/crawl-data-test/details/workspaces?authuser=7&project=httparchive) and [production](https://console.cloud.google.com/bigquery/dataform/locations/us-central1/repositories/crawl-data/details/workspaces?authuser=7&project=httparchive).

The test repository is used [for development and testing purposes](https://cloud.google.com/dataform/docs/workspaces) and not connected to the rest of the pipeline infra.

Pipeline can be [run manually](https://cloud.google.com/dataform/docs/code-lifecycle) from the Dataform UI.

[Configuration](./tf/dataform.tf)

## Dataform Development Workspace

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in test Dataform repository.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the BigQuery artifacts generated in the test workflow.

*Some useful hints:*

1. In workflow settings vars set `dev_name: dev` to process sampled data in dev workspace.
2. Change `current_month` variable to a month in the past. May be helpful for testing pipelines based on `chrome-ux-report` data.
3. `definitions/extra/test_env.sqlx` script helps to setup the tables required to run pipelines when in dev workspace. It's disabled by default.

## Workspace hints

1. In `workflow_settings.yaml` set `environment: dev` to process sampled data.
2. For development and testing, you can modify variables in `includes/constants.js`, but note that these are programmatically generated.

## Repository Structure

- `definitions/` - Contains the core Dataform SQL definitions and declarations
  - `output/` - Contains the main pipeline transformation logic
  - `declarations/` - Contains referenced tables/views declarations and other resources definitions
- `includes/` - Contains shared JavaScript utilities and constants
- `infra/` - Infrastructure code and deployment configurations
  - `bigquery-export/` - BigQuery export service
  - `dataform-service/` - Cloud Run function for dataform workflows automation
  - `tf/` - Terraform configurations
- `docs/` - Additional documentation

## GiHub to Dataform connection

GitHub PAT saved to a [Secret Manager secret](https://console.cloud.google.com/security/secret-manager/secret/GitHub_max-ostapenko_dataform_PAT/versions?authuser=7&project=httparchive).

- repository: HTTPArchive/dataform
- permissions:
  - Commit statuses: read
  - Contents: read, write

## Monitoring

- [Production Dataform workflow execution logs](https://console.cloud.google.com/bigquery/dataform/locations/us-central1/repositories/crawl-data/details/workflows?authuser=7&project=httparchive)

- [Dataform Workflow Invocation Failed](https://console.cloud.google.com/monitoring/alerting/policies/16526940745374967367?authuser=7&project=httparchive) policy
