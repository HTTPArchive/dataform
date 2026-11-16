"""BigQuery partition-copy and post-copy cleaning utilities for HTTP Archive crawl tables."""

from datetime import datetime
import logging
from typing import Any, Dict, Optional
from google.cloud import bigquery

logger = logging.getLogger(__name__)

LATEST_STAGING_PARTITION_QUERY = """
SELECT MAX(partition_id) AS partition_id
FROM `{project_id}.crawl_staging.INFORMATION_SCHEMA.PARTITIONS`
WHERE table_name = @table_name
  AND partition_id != '__UNPARTITIONED__'
  AND total_rows > 0;
"""

NEEDS_PROCESSING_QUERY = """
WITH staging AS (
  SELECT
    MAX(last_modified_time) AS last_modified_time,
    SUM(total_rows) AS total_rows
  FROM `{project_id}.crawl_staging.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name = @table_name
    AND partition_id = @partition_id
),
target AS (
  SELECT MAX(last_modified_time) AS last_modified_time
  FROM `{project_id}.crawl.INFORMATION_SCHEMA.PARTITIONS`
  WHERE table_name = @table_name
    AND partition_id = @partition_id
)
SELECT
  COALESCE(
    staging.last_modified_time > COALESCE(target.last_modified_time, TIMESTAMP('1970-01-01'))
    AND staging.total_rows > 0,
    FALSE
  ) AS needs_processing
FROM staging, target;
"""

CORRUPTED_TECHNOLOGY_VALUES_QUERY = """
WITH valid_technologies AS (
  SELECT DISTINCT name
  FROM `{project_id}.wappalyzer.technologies`
),
valid_categories AS (
  SELECT DISTINCT name
  FROM `{project_id}.wappalyzer.categories`
)
SELECT COUNT(DISTINCT page) AS cnt_pages
FROM `{project_id}.crawl_staging.pages` AS pages
LEFT JOIN pages.technologies AS tech
LEFT JOIN tech.categories AS category
LEFT JOIN valid_technologies AS vt
  ON tech.technology = vt.name
LEFT JOIN valid_categories AS vc
  ON category = vc.name
WHERE date = DATE(@partition_date)
  AND (
    (tech.technology IS NOT NULL AND vt.name IS NULL)
    OR (category IS NOT NULL AND vc.name IS NULL)
    OR ARRAY_LENGTH(tech.categories) = 0
  )
HAVING cnt_pages > 200;
"""

PAGES_PER_CLIENT_QUERY = """
SELECT
  client,
  COUNT(DISTINCT page) AS cnt_pages
FROM `{project_id}.crawl_staging.pages`
WHERE date = DATE(@partition_date)
GROUP BY client
HAVING cnt_pages < 20000000;
"""

CLEAN_PAGES_TECHNOLOGIES_SCRIPT = """
SET @@RESERVATION='none';

CREATE TEMP TABLE technologies_cleaned AS (
  WITH technologies AS (
    SELECT DISTINCT
      name AS technology,
      categories
    FROM `{project_id}.wappalyzer.technologies`
  ),
  valid_tech_categories AS (
    SELECT DISTINCT
      t.technology,
      category
    FROM technologies AS t
    INNER JOIN t.categories AS category
  ),
  pages AS (
    SELECT
      client,
      page,
      tech.technology,
      tech.categories,
      tech.info
    FROM `{project_id}.crawl.pages` AS pages
    LEFT JOIN pages.technologies AS tech
    WHERE date = DATE(@partition_date)
  ),
  impacted_pages AS (
    SELECT DISTINCT
      p.client,
      p.page
    FROM pages AS p
    LEFT JOIN p.categories AS category
    LEFT JOIN technologies AS t
      ON p.technology = t.technology
    LEFT JOIN valid_tech_categories AS vtc
      ON p.technology = vtc.technology
      AND category = vtc.category
    WHERE (p.technology IS NOT NULL AND t.technology IS NULL)
      OR (p.technology IS NOT NULL AND category IS NOT NULL AND vtc.technology IS NULL)
  ),
  reconstructed_technologies AS (
    SELECT
      client,
      page,
      ARRAY_AGG(
        STRUCT(
          pages.technology,
          technologies.categories,
          pages.info
        )
      ) AS technologies
    FROM pages
    INNER JOIN impacted_pages
      USING (client, page)
    INNER JOIN technologies
      USING (technology)
    GROUP BY
      client,
      page
  )
  SELECT
    client,
    page,
    reconstructed_technologies.technologies
  FROM impacted_pages
  LEFT JOIN reconstructed_technologies
    USING (client, page)
);

UPDATE `{project_id}.crawl.pages` AS pages
SET technologies = technologies_cleaned.technologies
FROM technologies_cleaned
WHERE pages.date = DATE(@partition_date)
  AND pages.client = technologies_cleaned.client
  AND pages.page = technologies_cleaned.page;
"""


def partition_id_to_date(partition_id: str) -> str:
    """Convert YYYYMMDD partition ID to YYYY-MM-DD ISO date string."""
    return datetime.strptime(partition_id, "%Y%m%d").strftime("%Y-%m-%d")


def _get_client(project_id: str, client: Optional[bigquery.Client]) -> bigquery.Client:
    return client or bigquery.Client(project=project_id, location="US")


def get_latest_staging_partition(
    project_id: str,
    table_name: str,
    client: Optional[bigquery.Client] = None,
    labels: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    """Return the latest non-empty YYYYMMDD partition ID in crawl_staging."""
    bq_client = _get_client(project_id, client)
    job_config = bigquery.QueryJobConfig(
        labels=labels or {},
        query_parameters=[
            bigquery.ScalarQueryParameter("table_name", "STRING", table_name),
        ],
    )
    rows = list(
        bq_client.query(
            LATEST_STAGING_PARTITION_QUERY.format(project_id=project_id),
            job_config=job_config,
        ).result()
    )
    return rows[0]["partition_id"] if rows else None


def needs_partition_copy(
    project_id: str,
    table_name: str,
    partition_id: str,
    client: Optional[bigquery.Client] = None,
    labels: Optional[Dict[str, str]] = None,
) -> bool:
    """Return True if staging partition is non-empty and newer than prod partition."""
    bq_client = _get_client(project_id, client)
    job_config = bigquery.QueryJobConfig(
        labels=labels or {},
        query_parameters=[
            bigquery.ScalarQueryParameter("table_name", "STRING", table_name),
            bigquery.ScalarQueryParameter("partition_id", "STRING", partition_id),
        ],
    )
    rows = list(
        bq_client.query(
            NEEDS_PROCESSING_QUERY.format(project_id=project_id),
            job_config=job_config,
        ).result()
    )
    return bool(rows and rows[0]["needs_processing"])


def assert_crawl_staging_pages(
    project_id: str,
    partition_id: Optional[str] = None,
    client: Optional[bigquery.Client] = None,
    labels: Optional[Dict[str, str]] = None,
) -> str:
    """Validate crawl_staging.pages partition before copying to crawl.pages."""
    bq_client = _get_client(project_id, client)
    target_partition = partition_id or get_latest_staging_partition(
        project_id, "pages", client=bq_client, labels=labels
    )
    if not target_partition:
        raise ValueError("No non-empty partition found in crawl_staging.pages.")

    partition_date = partition_id_to_date(target_partition)
    job_config = bigquery.QueryJobConfig(
        labels=labels or {},
        query_parameters=[
            bigquery.ScalarQueryParameter("partition_date", "STRING", partition_date),
        ],
    )

    corrupted = list(
        bq_client.query(
            CORRUPTED_TECHNOLOGY_VALUES_QUERY.format(project_id=project_id),
            job_config=job_config,
        ).result()
    )
    if corrupted:
        raise ValueError(
            f"corrupted_technology_values assertion failed for {partition_date}: "
            f"cnt_pages={corrupted[0]['cnt_pages']}"
        )

    low_counts = list(
        bq_client.query(
            PAGES_PER_CLIENT_QUERY.format(project_id=project_id),
            job_config=job_config,
        ).result()
    )
    if low_counts:
        details = ", ".join(f"{r['client']}={r['cnt_pages']}" for r in low_counts)
        raise ValueError(
            f"pages_per_client assertion failed for {partition_date}: {details}"
        )

    logger.info(
        "crawl_staging.pages assertions passed for partition %s.", target_partition
    )
    return target_partition


def copy_crawl_partition(
    project_id: str,
    table_name: str,
    partition_id: Optional[str] = None,
    client: Optional[bigquery.Client] = None,
    labels: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Zero-slot BigQuery partition copy from crawl_staging.<table> to crawl.<table>."""
    bq_client = _get_client(project_id, client)
    target_partition = partition_id or get_latest_staging_partition(
        project_id, table_name, client=bq_client, labels=labels
    )
    if not target_partition:
        raise ValueError(f"No non-empty partition found in crawl_staging.{table_name}.")

    if not needs_partition_copy(
        project_id, table_name, target_partition, client=bq_client, labels=labels
    ):
        logger.info(
            "Partition %s in crawl.%s is already up to date (or staging is empty); skipping copy.",
            target_partition,
            table_name,
        )
        return {
            "table": table_name,
            "partition_id": target_partition,
            "copied": False,
        }

    src = f"{project_id}.crawl_staging.{table_name}${target_partition}"
    dst = f"{project_id}.crawl.{table_name}${target_partition}"
    job_config = bigquery.CopyJobConfig(
        labels=labels or {},
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    logger.info("Copying BigQuery partition %s -> %s", src, dst)
    copy_job = bq_client.copy_table(src, dst, job_config=job_config)
    copy_job.result()
    logger.info("Copied %s -> %s (job_id=%s)", src, dst, copy_job.job_id)

    return {
        "table": table_name,
        "partition_id": target_partition,
        "copied": True,
        "job_id": copy_job.job_id,
    }


def clean_crawl_pages_technologies(
    project_id: str,
    partition_id: str,
    client: Optional[bigquery.Client] = None,
    labels: Optional[Dict[str, str]] = None,
) -> None:
    """Repair corrupted technology/category entries on the copied crawl.pages partition."""
    bq_client = _get_client(project_id, client)
    partition_date = partition_id_to_date(partition_id)
    job_config = bigquery.QueryJobConfig(
        labels=labels or {},
        query_parameters=[
            bigquery.ScalarQueryParameter("partition_date", "STRING", partition_date),
        ],
    )
    logger.info("Cleaning crawl.pages technologies for %s...", partition_date)
    job = bq_client.query(
        CLEAN_PAGES_TECHNOLOGIES_SCRIPT.format(project_id=project_id),
        job_config=job_config,
    )
    job.result()
    logger.info(
        "Cleaned crawl.pages technologies for %s (job_id=%s).",
        partition_date,
        job.job_id,
    )
