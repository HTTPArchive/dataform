"""BigQuery staging table verification and cleanup utilities for HTTP Archive."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import TYPE_CHECKING, Any, Dict, List, Mapping, Optional, Sequence

if TYPE_CHECKING:
    from google.cloud import bigquery

logger = logging.getLogger(__name__)

CRAWL_STAGING_TABLES = ("pages", "requests", "parsed_css")
DEFAULT_RETENTION_DAYS = 7

STAGING_CLEANUP_STATUS_QUERY = """
WITH staging AS (
  SELECT
    table_name,
    partition_id,
    total_rows AS staging_rows,
    last_modified_time AS staging_last_modified
  FROM `{project_id}.crawl_staging.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name IN UNNEST(@table_names)
    AND total_rows > 0
),
prod AS (
  SELECT
    table_name,
    partition_id,
    total_rows AS prod_rows,
    last_modified_time AS prod_last_modified
  FROM `{project_id}.crawl.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name IN UNNEST(@table_names)
)
SELECT
  s.table_name,
  s.partition_id,
  s.staging_rows,
  s.staging_last_modified,
  p.prod_rows,
  p.prod_last_modified,
  CURRENT_TIMESTAMP() AS checked_at
FROM staging AS s
LEFT JOIN prod AS p
  ON s.table_name = p.table_name
  AND s.partition_id = p.partition_id
ORDER BY
  s.table_name,
  s.partition_id;
"""


def _ensure_utc(dt: datetime) -> datetime:
    """Normalize naive datetimes to UTC so comparisons are timezone-consistent."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def validate_table_name(table_name: str) -> str:
    """Validate that table_name is a managed crawl_staging table."""
    if table_name not in CRAWL_STAGING_TABLES:
        raise ValueError(
            f"Unsupported crawl_staging table {table_name!r}; expected one of {CRAWL_STAGING_TABLES}."
        )
    return table_name


def evaluate_partition_cleanup(
    row: Mapping[str, Any],
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> Dict[str, Any]:
    """Evaluate copy verification and retention eligibility for one staging partition."""
    checked_at = _ensure_utc(row["checked_at"])
    staging_last_modified = _ensure_utc(row["staging_last_modified"])
    prod_last_modified_raw = row["prod_last_modified"]
    prod_last_modified = (
        _ensure_utc(prod_last_modified_raw)
        if prod_last_modified_raw is not None
        else None
    )
    staging_rows = row["staging_rows"]
    prod_rows = row["prod_rows"]

    cutoff = checked_at - timedelta(days=retention_days)
    staging_age_ok = staging_last_modified <= cutoff

    issues: List[str] = []
    if prod_rows is None:
        issues.append("missing partition in crawl")
    else:
        if prod_rows != staging_rows:
            issues.append(
                f"row count mismatch (staging={staging_rows}, crawl={prod_rows})"
            )
        if prod_last_modified is None or prod_last_modified < staging_last_modified:
            prod_ts = (
                prod_last_modified.isoformat()
                if prod_last_modified is not None
                else "missing"
            )
            issues.append(
                "staging modified after crawl "
                f"(staging={staging_last_modified.isoformat()}, crawl={prod_ts})"
            )

    copied_ok = len(issues) == 0
    copy_age_ok = prod_last_modified is not None and prod_last_modified <= cutoff

    if copied_ok and staging_age_ok and copy_age_ok:
        status = "ready"
    elif staging_age_ok and not copied_ok:
        status = "stale_unverified"
    else:
        status = "waiting"

    return {
        "partition_id": row["partition_id"],
        "status": status,
        "staging_rows": staging_rows,
        "staging_last_modified": staging_last_modified,
        "prod_rows": prod_rows,
        "prod_last_modified": prod_last_modified,
        "checked_at": checked_at,
        "copied_ok": copied_ok,
        "staging_age_ok": staging_age_ok,
        "copy_age_ok": copy_age_ok,
        "issues": issues,
    }


def evaluate_table_cleanup(
    table_name: str,
    partition_rows: Sequence[Mapping[str, Any]],
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> Dict[str, Any]:
    """Aggregate partition cleanup evaluations for a single crawl_staging table."""
    validate_table_name(table_name)
    if not partition_rows:
        return {
            "table": table_name,
            "status": "empty",
            "partitions": [],
            "error": None,
        }

    partitions = [
        evaluate_partition_cleanup(row, retention_days=retention_days)
        for row in partition_rows
    ]
    stale = [p for p in partitions if p["status"] == "stale_unverified"]
    waiting = [p for p in partitions if p["status"] == "waiting"]

    if stale:
        details = "; ".join(
            f"{p['partition_id']}: {', '.join(p['issues'])}" for p in stale
        )
        return {
            "table": table_name,
            "status": "error",
            "partitions": partitions,
            "error": (
                f"crawl_staging.{table_name} has stale unverified partition(s) "
                f"(>= {retention_days}d): {details}"
            ),
        }

    if waiting:
        return {
            "table": table_name,
            "status": "waiting",
            "partitions": partitions,
            "error": None,
        }

    return {
        "table": table_name,
        "status": "ready",
        "partitions": partitions,
        "error": None,
    }


def evaluate_all_tables(
    rows: Sequence[Mapping[str, Any]],
    table_names: Sequence[str] = CRAWL_STAGING_TABLES,
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> Dict[str, Dict[str, Any]]:
    """Group metadata rows by table and evaluate cleanup status for each table."""
    grouped: Dict[str, List[Mapping[str, Any]]] = {}
    for table_name in table_names:
        validate_table_name(table_name)
        grouped[table_name] = []

    for row in rows:
        table_name = row["table_name"]
        if table_name in grouped:
            grouped[table_name].append(row)

    return {
        table_name: evaluate_table_cleanup(
            table_name,
            grouped[table_name],
            retention_days=retention_days,
        )
        for table_name in table_names
    }


def should_run_cleanup(evaluations: Mapping[str, Mapping[str, Any]]) -> bool:
    """Return True if any table is ready to truncate or requires failure escalation."""
    return any(
        evaluation["status"] in ("ready", "error")
        for evaluation in evaluations.values()
    )


def _get_client(
    project_id: str,
    client: Optional["bigquery.Client"],
) -> "bigquery.Client":
    if client is not None:
        return client
    from google.cloud import bigquery

    return bigquery.Client(project=project_id, location="US")


def fetch_staging_cleanup_rows(
    project_id: str,
    table_names: Sequence[str] = CRAWL_STAGING_TABLES,
    client: Optional["bigquery.Client"] = None,
    labels: Optional[Dict[str, str]] = None,
) -> List[Mapping[str, Any]]:
    """Query INFORMATION_SCHEMA.PARTITIONS for staging and prod partition metadata."""
    from google.cloud import bigquery

    validated_tables = [validate_table_name(name) for name in table_names]
    bq_client = _get_client(project_id, client)
    job_config = bigquery.QueryJobConfig(
        labels=labels or {},
        query_parameters=[
            bigquery.ArrayQueryParameter("table_names", "STRING", validated_tables),
        ],
    )
    return list(
        bq_client.query(
            STAGING_CLEANUP_STATUS_QUERY.format(project_id=project_id),
            job_config=job_config,
        ).result()
    )


def check_crawl_staging_cleanup_readiness(
    project_id: str,
    table_names: Sequence[str] = CRAWL_STAGING_TABLES,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    client: Optional["bigquery.Client"] = None,
    labels: Optional[Dict[str, str]] = None,
) -> bool:
    """Evaluate all staging tables and return True if any table is ready or errored."""
    rows = fetch_staging_cleanup_rows(
        project_id,
        table_names=table_names,
        client=client,
        labels=labels,
    )
    evaluations = evaluate_all_tables(
        rows,
        table_names=table_names,
        retention_days=retention_days,
    )

    for table_name, evaluation in evaluations.items():
        partition_ids = [p["partition_id"] for p in evaluation["partitions"]]
        if evaluation["status"] == "error":
            logger.error(
                "crawl_staging.%s status=error partitions=%s: %s",
                table_name,
                partition_ids,
                evaluation["error"],
            )
        else:
            logger.info(
                "crawl_staging.%s status=%s partitions=%s",
                table_name,
                evaluation["status"],
                partition_ids,
            )

    run_cleanup = should_run_cleanup(evaluations)
    logger.info("crawl_staging cleanup readiness evaluated to: %s", run_cleanup)
    return run_cleanup


def truncate_crawl_staging_table(
    project_id: str,
    table_name: str,
    retention_days: int = DEFAULT_RETENTION_DAYS,
    client: Optional["bigquery.Client"] = None,
    labels: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Re-verify staging copy invariants for table_name and truncate if eligible."""
    from google.cloud import bigquery

    validate_table_name(table_name)
    bq_client = _get_client(project_id, client)
    rows = fetch_staging_cleanup_rows(
        project_id,
        table_names=[table_name],
        client=bq_client,
        labels=labels,
    )
    evaluation = evaluate_table_cleanup(
        table_name,
        rows,
        retention_days=retention_days,
    )
    status = evaluation["status"]

    if status in ("empty", "waiting"):
        partition_ids = [p["partition_id"] for p in evaluation["partitions"]]
        logger.info(
            "Skipping TRUNCATE on crawl_staging.%s (status=%s, partitions=%s).",
            table_name,
            status,
            partition_ids,
        )
        return {
            "table": table_name,
            "status": status,
            "truncated": False,
        }

    if status == "error":
        raise ValueError(evaluation["error"])

    partition_ids = [p["partition_id"] for p in evaluation["partitions"]]
    truncate_sql = f"TRUNCATE TABLE `{project_id}.crawl_staging.{table_name}`;"
    job_config = bigquery.QueryJobConfig(labels=labels or {})
    logger.info(
        "Truncating %s.crawl_staging.%s (verified partitions=%s)...",
        project_id,
        table_name,
        partition_ids,
    )
    job = bq_client.query(truncate_sql, job_config=job_config)
    job.result()
    logger.info(
        "Truncated %s.crawl_staging.%s (partitions=%s, job_id=%s).",
        project_id,
        table_name,
        partition_ids,
        job.job_id,
    )
    return {
        "table": table_name,
        "status": "truncated",
        "truncated": True,
        "partitions": partition_ids,
        "job_id": job.job_id,
    }
