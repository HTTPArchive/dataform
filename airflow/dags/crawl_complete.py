"""Airflow DAG to orchestrate HTTP Archive BigQuery partition copies and Dataform pipelines."""

from datetime import datetime
import logging
import sys
from pathlib import Path
from typing import Any, Dict, Optional
from airflow import DAG
from airflow.decorators import task
from airflow.operators.python import ShortCircuitOperator, get_current_context
from airflow.providers.google.cloud.hooks.bigquery import BigQueryHook
from airflow.providers.google.cloud.operators.dataform import (
    DataformCreateCompilationResultOperator,
    DataformCreateWorkflowInvocationOperator,
)
from airflow.providers.google.cloud.sensors.dataform import DataformWorkflowInvocationStateSensor
from airflow.providers.google.cloud.sensors.pubsub import PubSubPullSensor
from google.cloud import bigquery
from google.cloud.dataform_v1beta1 import WorkflowInvocation

# Ensure DAG directory is in sys.path for Composer environment
sys.path.append(str(Path(__file__).parent))

from common.config import (
    CRAWL_COMPLETE_SUBSCRIPTION,
    DATAFORM_REGION,
    DATAFORM_RELEASE_CONFIG,
    DATAFORM_REPOSITORY,
    DEFAULT_DAG_ARGS,
    PROJECT_ID,
    build_bq_labels,
)
from common.crawl_copy import (
    assert_crawl_staging_pages,
    clean_crawl_pages_technologies,
    copy_crawl_partition,
)
from common.public_suffix import sync_public_suffix_list

logger = logging.getLogger(__name__)

CRAWL_READINESS_QUERY = f"""
WITH staging AS (
  SELECT
    MAX(partition_id) AS staging_partition,
    MAX(last_modified_time) AS staging_last_modified
  FROM `{PROJECT_ID}.crawl_staging.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name = 'pages' AND total_rows > 0
),
prod AS (
  SELECT
    MAX(partition_id) AS prod_partition,
    MAX(last_modified_time) AS prod_last_modified
  FROM `{PROJECT_ID}.crawl.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name = 'pages' AND total_rows > 0
)
SELECT
  staging_partition IS NOT NULL AND (
    staging_partition > IFNULL(prod_partition, '')
    OR staging_last_modified > IFNULL(prod_last_modified, TIMESTAMP('1970-01-01'))
  ) AS needs_processing
FROM staging, prod;
"""


def check_crawl_readiness(**context: Any) -> bool:
    """Check if staging crawl data is ready and newer than production.

    Returns True if new or updated crawl data needs processing, False to skip.
    """
    logger.info("Checking if crawl staging data needs processing...")
    hook = BigQueryHook(gcp_conn_id="google_cloud_default", use_legacy_sql=False)
    client = hook.get_client(project_id=PROJECT_ID, location="US")

    job_config = bigquery.QueryJobConfig(labels=build_bq_labels(context))
    query_job = client.query(CRAWL_READINESS_QUERY, job_config=job_config)
    results = list(query_job.result())

    if not results:
        logger.info("No rows returned from crawl readiness query. Short-circuiting.")
        return False

    needs_processing = bool(results[0].get("needs_processing", False))
    logger.info("Crawl readiness evaluated to: %s", needs_processing)
    return needs_processing


with DAG(
    dag_id="crawl_complete",
    default_args=DEFAULT_DAG_ARGS,
    # Crawl starts on 2nd Tuesday (~8th-14th) and runs ~1 week, finishing around 3rd Tuesday (~15th-21st) +/- 3-4 days
    # Checks hourly during the expected readiness window
    schedule_interval="0 * 12-25 * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["dataform", "crawl", "reports"],
) as dag:
    # 1. Wait for Pub/Sub notification on the crawl-complete subscription
    wait_for_crawl_complete = PubSubPullSensor(
        task_id="wait_for_crawl_complete",
        project_id=PROJECT_ID,
        subscription=CRAWL_COMPLETE_SUBSCRIPTION,
        max_messages=1,
        ack_messages=True,
        deferrable=True,
        poke_interval=60,
        timeout=3600,
        mode="reschedule",
        soft_fail=True,
    )

    # 2. Check if crawl data in staging is newer than production and needs processing
    check_crawl_condition = ShortCircuitOperator(
        task_id="check_crawl_readiness",
        python_callable=check_crawl_readiness,
    )

    # 3. Download latest Public Suffix List (ICANN + private) and sync into BigQuery
    @task(task_id="sync_public_suffix_list")
    def update_public_suffix_table() -> int:
        """Download latest Public Suffix List and load into BigQuery."""
        context = get_current_context()
        return sync_public_suffix_list(
            project_id=PROJECT_ID,
            labels=build_bq_labels(context),
        )

    sync_psl = update_public_suffix_table()

    # 3b. Verify crawl_staging.pages, copy crawl partitions (0 slots), and clean pages.technologies
    @task(task_id="verify_crawl_staging_pages")
    def verify_pages_staging() -> str:
        """Run pre-copy quality assertions on crawl_staging.pages."""
        context = get_current_context()
        hook = BigQueryHook(gcp_conn_id="google_cloud_default", use_legacy_sql=False)
        client = hook.get_client(project_id=PROJECT_ID, location="US")
        return assert_crawl_staging_pages(
            project_id=PROJECT_ID,
            client=client,
            labels=build_bq_labels(context),
        )

    @task
    def copy_crawl_table(
        table_name: str,
        partition_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Copy latest staging partition to production crawl table via BigQuery Copy Job."""
        context = get_current_context()
        hook = BigQueryHook(gcp_conn_id="google_cloud_default", use_legacy_sql=False)
        client = hook.get_client(project_id=PROJECT_ID, location="US")
        return copy_crawl_partition(
            project_id=PROJECT_ID,
            table_name=table_name,
            partition_id=partition_id,
            client=client,
            labels=build_bq_labels(context),
        )

    @task(task_id="clean_crawl_pages_technologies")
    def clean_pages_technologies_task(copy_result: Dict[str, Any]) -> None:
        """Repair corrupted technology/category entries on the copied crawl.pages partition."""
        if not copy_result.get("copied"):
            logger.info("crawl.pages was not copied in this run; skipping technology cleanup.")
            return
        context = get_current_context()
        hook = BigQueryHook(gcp_conn_id="google_cloud_default", use_legacy_sql=False)
        client = hook.get_client(project_id=PROJECT_ID, location="US")
        clean_crawl_pages_technologies(
            project_id=PROJECT_ID,
            partition_id=copy_result["partition_id"],
            client=client,
            labels=build_bq_labels(context),
        )

    verify_pages = verify_pages_staging()
    copy_pages = copy_crawl_table.override(task_id="copy_crawl_pages")(
        "pages",
        partition_id=verify_pages,
    )
    clean_pages = clean_pages_technologies_task(copy_pages)
    copy_requests = copy_crawl_table.override(task_id="copy_crawl_requests")("requests")
    copy_parsed_css = copy_crawl_table.override(task_id="copy_crawl_parsed_css")(
        "parsed_css"
    )

    # 4. Create compilation result from the Dataform production release configuration
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

    # 5. Trigger Dataform workflow asynchronously (fail-fast, retries=0 prevents duplicate invocations)
    trigger_dataform_workflow = DataformCreateWorkflowInvocationOperator(
        task_id="trigger_dataform_workflow",
        project_id=PROJECT_ID,
        region=DATAFORM_REGION,
        repository_id=DATAFORM_REPOSITORY,
        asynchronous=True,
        retries=0,
        workflow_invocation={
            "compilation_result": (
                "{{ task_instance.xcom_pull('create_compilation_result')['name'] "
                "if task_instance.xcom_pull('create_compilation_result') is mapping "
                "else task_instance.xcom_pull('create_compilation_result') }}"
            ),
            "invocation_config": {
                "included_tags": [
                    "crawl_complete",
                    "crawl_complete_reports",
                ],
                "fully_refresh_incremental_tables_enabled": False,
                "transitive_dependencies_included": False,
                "transitive_dependents_included": False,
            },
        },
    )

    # 6. Wait for Dataform workflow completion using sensor in reschedule mode
    wait_for_dataform_workflow = DataformWorkflowInvocationStateSensor(
        task_id="wait_for_dataform_workflow",
        project_id=PROJECT_ID,
        region=DATAFORM_REGION,
        repository_id=DATAFORM_REPOSITORY,
        workflow_invocation_id=(
            "{{ (task_instance.xcom_pull('trigger_dataform_workflow')['name'] "
            "if task_instance.xcom_pull('trigger_dataform_workflow') is mapping "
            "else task_instance.xcom_pull('trigger_dataform_workflow')).split('/')[-1] }}"
        ),
        expected_statuses={WorkflowInvocation.State.SUCCEEDED},
        failure_statuses={
            WorkflowInvocation.State.FAILED,
            WorkflowInvocation.State.CANCELLED,
        },
        poke_interval=120,
        timeout=12 * 3600,
        mode="reschedule",
    )

    (
        wait_for_crawl_complete
        >> check_crawl_condition
        >> [sync_psl, copy_requests, copy_parsed_css, verify_pages]
    )
    verify_pages >> copy_pages >> clean_pages
    (
        [sync_psl, copy_requests, copy_parsed_css, clean_pages]
        >> create_compilation_result
        >> trigger_dataform_workflow
        >> wait_for_dataform_workflow
    )
