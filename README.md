# HTTP Archive datasets pipeline

This repository handles the HTTP Archive data pipeline, which takes the results of the monthly HTTP Archive run and saves this to the `httparchive` dataset in BigQuery.

## Pipelines

The pipelines are run in Dataform service in Google Cloud Platform (GCP) and are kicked off automatically on crawl completion and other events. The code in the `main` branch is used on each triggered pipeline run.

### Crawl results

Tag: `crawl_complete`

- httparchive.crawl.pages
- httparchive.crawl.parsed_css
- httparchive.crawl.requests

### Core Web Vitals Technology Report

Tag: `crux_ready`

- httparchive.core_web_vitals.technologies

Consumers:

- [HTTP Archive Tech Report](https://httparchive.org/reports/techreport/landing)

### Blink Features Report

Tag: `crawl_complete`

- httparchive.blink_features.features
- httparchive.blink_features.usage

Consumers:

- chromestatus.com - [example](https://chromestatus.com/metrics/feature/timeline/popularity/2089)

## Schedules

1. [crawl-complete](https://console.cloud.google.com/cloudpubsub/subscription/detail/dataformTrigger?authuser=7&project=httparchive) PubSub subscription

    Tags: ["crawl_complete"]

2. [bq-poller-crux-ready](https://console.cloud.google.com/cloudscheduler/jobs/edit/us-central1/bq-poller-crux-ready?authuser=7&project=httparchive) Scheduler

    Tags: ["crux_ready"]

### Triggering workflows

In order to unify the workflow triggering mechanism, we use [a Cloud Run function](./infra/README.md) that can be invoked in a number of ways (e.g. listen to PubSub messages), do intermediate checks and trigger the particular Dataform workflow execution configuration.

## Contributing

### Dataform development

1. [Create new dev workspace](https://cloud.google.com/dataform/docs/quickstart-dev-environments) in Dataform.
2. Make adjustments to the dataform configuration files and manually run a workflow to verify.
3. Push all your changes to a dev branch & open a PR with the link to the BigQuery artifacts generated in the test workflow.

#### Workspace hints

1. In `workflow_settings.yaml` set `environment: dev` to process sampled data.
2. For development and testing, you can modify variables in `includes/constants.js`, but note that these are programmatically generated.

## Repository Structure

- `definitions/` - Contains the core Dataform SQL definitions and declarations
  - `output/` - Contains the main pipeline transformation logic
  - `declarations/` - Contains referenced tables/views declarations and other resources definitions
- `includes/` - Contains shared JavaScript utilities and constants
- `infra/` - Infrastructure code and deployment configurations
  - `dataform-trigger/` - Cloud Run function for workflow automation
  - `tf/` - Terraform configurations
  - `bigquery-export/` - BigQuery export configurations
- `docs/` - Additional documentation

## Development Setup

1. Install dependencies:

    ```bash
    npm install
    ```

2. Available Scripts:

    - `npm run format` - Format code using Standard.js, fix Markdown issues, and format Terraform files
    - `npm run lint` - Run linting checks on JavaScript, Markdown files, and compile Dataform configs

## Code Quality

This repository uses:

- Standard.js for JavaScript code style
- Markdownlint for Markdown file formatting
- Dataform's built-in compiler for SQL validation
