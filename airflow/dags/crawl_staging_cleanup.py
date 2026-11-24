"""Airflow DAG to verify crawl copies and truncate crawl_staging tables after retention."""

from datetime import datetime
import sys
from pathlib import Path
from typing import Any, Dict
from airflow import DAG
from airflow.decorators import task
from airflow.operators.python import ShortCircuitOperator, get_current_context
from airflow.providers.google.cloud.hooks.bigquery import BigQueryHook

# Ensure DAG directory is in sys.path for Composer environment
sys.path.append(str(Path(__file__).parent))

from common.config import DEFAULT_DAG_ARGS, PROJECT_ID, build_bq_labels
from common.crawl_cleanup import (
    CRAWL_STAGING_TABLES,
    DEFAULT_RETENTION_DAYS,
    check_crawl_staging_cleanup_readiness,
    truncate_crawl_staging_table,
)


def check_cleanup_readiness_callable(**context: Any) -> bool:
    """Short-circuit unless at least one staging table is ready or stale-unverified."""
    hook = BigQueryHook(gcp_conn_id="google_cloud_default", use_legacy_sql=False)
    client = hook.get_client(project_id=PROJECT_ID, location="US")
    return check_crawl_staging_cleanup_readiness(
        project_id=PROJECT_ID,
        retention_days=DEFAULT_RETENTION_DAYS,
        client=client,
        labels=build_bq_labels(context),
    )


with DAG(
    dag_id="crawl_staging_cleanup",
    default_args=DEFAULT_DAG_ARGS,
    description="Verifies crawl_staging tables were copied to crawl and truncates them 7 days after crawl finish",
    # 4th Tuesday falls on 22nd-28th (+ 4 days = up to 26th-31st or 1st-4th in shorter months)
    schedule_interval="0 18 1-4,22-31 * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["crawl", "cleanup"],
) as dag:
    check_cleanup_readiness = ShortCircuitOperator(
        task_id="check_crawl_staging_cleanup_readiness",
        python_callable=check_cleanup_readiness_callable,
    )

    @task
    def cleanup_crawl_staging_table(table_name: str) -> Dict[str, Any]:
        """Re-verify staging copy invariants for one table and truncate if eligible."""
        context = get_current_context()
        hook = BigQueryHook(gcp_conn_id="google_cloud_default", use_legacy_sql=False)
        client = hook.get_client(project_id=PROJECT_ID, location="US")
        return truncate_crawl_staging_table(
            project_id=PROJECT_ID,
            table_name=table_name,
            retention_days=DEFAULT_RETENTION_DAYS,
            client=client,
            labels=build_bq_labels(context),
        )

    cleanup_tasks = [
        cleanup_crawl_staging_table.override(
            task_id=f"cleanup_crawl_staging_{table_name}"
        )(table_name)
        for table_name in CRAWL_STAGING_TABLES
    ]

    check_cleanup_readiness >> cleanup_tasks
