"""Airflow DAG to monitor CrUX partition readiness and trigger CWV Tech Report Dataform workflows."""

from datetime import datetime
import logging
import sys
from pathlib import Path
from airflow import DAG
from airflow.operators.python import ShortCircuitOperator
from airflow.providers.google.cloud.hooks.bigquery import BigQueryHook
from airflow.providers.google.cloud.operators.dataform import (
    DataformCreateCompilationResultOperator,
    DataformCreateWorkflowInvocationOperator,
)

# Ensure DAG directory is in sys.path for Composer environment
sys.path.append(str(Path(__file__).parent))

from common.config import (
    DATAFORM_REGION,
    DATAFORM_RELEASE_CONFIG,
    DATAFORM_REPOSITORY,
    DEFAULT_DAG_ARGS,
    PROJECT_ID,
)

logger = logging.getLogger(__name__)

CRUX_READY_QUERY = """
DECLARE previousMonth STRING DEFAULT FORMAT_DATE('%Y%m%d', DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH));
DECLARE previousMonth_YYYYMM STRING DEFAULT SUBSTR(previousMonth, 1, 6);

WITH crux AS (
  SELECT
    LOGICAL_AND(total_rows > 0) AS rows_available,
    LOGICAL_OR(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_modified_time, HOUR) < 4) AS recent_last_modified
  FROM `chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name IN ('device_summary', 'country_summary')
    AND partition_id IN (previousMonth, previousMonth_YYYYMM)
), report AS (
  SELECT MAX(partition_id) = previousMonth AS report_exists
  FROM `httparchive.reports.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name = 'tech_crux'
    AND partition_id != '__NULL__'
)

SELECT
  (rows_available AND NOT report_exists)
    OR (rows_available AND recent_last_modified) AS condition
FROM crux, report;
"""


def check_crux_readiness() -> bool:
    """Execute BigQuery readiness check for Chrome UX Report data.

    Returns True if CrUX data is ready and needs processing, False to skip.
    """
    logger.info("Executing CrUX readiness query against BigQuery...")
    hook = BigQueryHook(gcp_conn_id="google_cloud_default", use_legacy_sql=False)
    client = hook.get_client(project_id=PROJECT_ID, location="US")

    query_job = client.query(CRUX_READY_QUERY)
    results = list(query_job.result())

    if not results:
        logger.info("No rows returned from readiness query. Short-circuiting.")
        return False

    is_ready = bool(results[0].get("condition", False))
    logger.info("CrUX readiness condition evaluated to: %s", is_ready)
    return is_ready


with DAG(
    dag_id="crux_ready",
    default_args=DEFAULT_DAG_ARGS,
    description="Polls CrUX partition availability and executes Dataform crux_ready and crux_ready_reports",
    schedule_interval="0 8,12,16 8-14 * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["dataform", "crux", "reports"],
) as dag:
    # 1. Evaluate CrUX partition readiness; skips downstream tasks cleanly if condition is False
    check_crux_condition = ShortCircuitOperator(
        task_id="check_crux_readiness",
        python_callable=check_crux_readiness,
    )

    # 2. Create compilation result from Dataform production release config
    create_compilation_result = DataformCreateCompilationResultOperator(
        task_id="create_compilation_result",
        project_id=PROJECT_ID,
        region=DATAFORM_REGION,
        repository_id=DATAFORM_REPOSITORY,
        compilation_result={
            "release_config": (
                f"projects/{PROJECT_ID}/locations/{DATAFORM_REGION}"
                f"/repositories/{DATAFORM_REPOSITORY}/releaseConfigs/{DATAFORM_RELEASE_CONFIG}"
            )
        },
    )

    # 3. Invoke Dataform workflow with crux_ready and crux_ready_reports tags
    run_dataform_workflow = DataformCreateWorkflowInvocationOperator(
        task_id="run_dataform_workflow",
        project_id=PROJECT_ID,
        region=DATAFORM_REGION,
        repository_id=DATAFORM_REPOSITORY,
        asynchronous=False,
        workflow_invocation={
            "compilation_result": (
                "{{ task_instance.xcom_pull('create_compilation_result')['name'] "
                "if task_instance.xcom_pull('create_compilation_result') is mapping "
                "else task_instance.xcom_pull('create_compilation_result') }}"
            ),
            "invocation_config": {
                "included_tags": [
                    "crux_ready",
                    "crux_ready_reports",
                ],
                "fully_refresh_incremental_tables_enabled": False,
                "transitive_dependencies_included": False,
                "transitive_dependents_included": False,
            },
        },
    )

    check_crux_condition >> create_compilation_result >> run_dataform_workflow
