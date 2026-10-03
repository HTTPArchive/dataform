"""Airflow DAG to orchestrate HTTP Archive Dataform pipelines upon crawl completion."""

from datetime import datetime
from airflow import DAG
import sys
from pathlib import Path
from airflow.decorators import task
from airflow.providers.google.cloud.operators.dataform import (
    DataformCreateCompilationResultOperator,
    DataformCreateWorkflowInvocationOperator,
)
from airflow.providers.google.cloud.sensors.pubsub import PubSubPullSensor

# Ensure DAG directory is in sys.path for Composer environment
sys.path.append(str(Path(__file__).parent))

from common.config import (
    CRAWL_COMPLETE_SUBSCRIPTION,
    DATAFORM_REGION,
    DATAFORM_RELEASE_CONFIG,
    DATAFORM_REPOSITORY,
    DEFAULT_DAG_ARGS,
    PROJECT_ID,
)
from common.public_suffix import sync_public_suffix_private

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
    )

    # 2. Download latest Public Suffix List private domains and sync into BigQuery
    @task(task_id="sync_public_suffix_private")
    def update_public_suffix_table() -> int:
        """Download latest Public Suffix List private domains and load into BigQuery."""
        return sync_public_suffix_private(project_id=PROJECT_ID)

    sync_psl = update_public_suffix_table()

    # 3. Create compilation result from the Dataform production release configuration
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

    # 4. Invoke Dataform workflow with crawl_complete and crawl_complete_reports tags
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
                    "crawl_complete",
                    "crawl_complete_reports",
                ],
                "fully_refresh_incremental_tables_enabled": False,
                "transitive_dependencies_included": False,
                "transitive_dependents_included": False,
            },
        },
    )

    wait_for_crawl_complete >> sync_psl >> create_compilation_result >> run_dataform_workflow
