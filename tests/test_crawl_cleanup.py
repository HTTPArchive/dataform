"""Unit tests for crawl_staging cleanup evaluation and BigQuery execution guards."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import MagicMock, patch

DAGS_DIR = Path(__file__).resolve().parent.parent / "airflow" / "dags"
if str(DAGS_DIR) not in sys.path:
    sys.path.insert(0, str(DAGS_DIR))

from common.crawl_cleanup import (  # noqa: E402
    CRAWL_STAGING_TABLES,
    DEFAULT_STAGING_RETENTION_DAYS,
    check_crawl_staging_cleanup_readiness,
    clean_old_response_bodies,
    evaluate_all_tables,
    evaluate_table_cleanup,
    get_response_body_cutoff_date,
    should_run_cleanup,
    truncate_crawl_staging_table,
    validate_table_name,
)

NOW = datetime(2026, 11, 24, 6, 0, 0, tzinfo=timezone.utc)


def make_row(
    table_name="pages",
    partition_id="20261101",
    staging_rows=48_573_675,
    staging_age_days=8.0,
    prod_rows=48_573_675,
    prod_age_days=7.5,
):
    """Build a synthetic INFORMATION_SCHEMA.PARTITIONS join row."""
    staging_last_modified = NOW - timedelta(days=staging_age_days)
    prod_last_modified = (
        NOW - timedelta(days=prod_age_days) if prod_age_days is not None else None
    )
    return {
        "table_name": table_name,
        "partition_id": partition_id,
        "staging_rows": staging_rows,
        "staging_last_modified": staging_last_modified,
        "prod_rows": prod_rows,
        "prod_last_modified": prod_last_modified,
        "checked_at": NOW,
    }


def make_fake_bigquery_module():
    """Create a minimal fake google.cloud.bigquery module for offline tests."""
    fake_google = ModuleType("google")
    fake_cloud = ModuleType("google.cloud")
    fake_bq = ModuleType("google.cloud.bigquery")

    class FakeArrayQueryParameter:
        def __init__(self, name, array_type, values):
            self.name = name
            self.array_type = array_type
            self.values = values

    class FakeScalarQueryParameter:
        def __init__(self, name, param_type, value):
            self.name = name
            self.param_type = param_type
            self.value = value

    class FakeQueryJobConfig:
        def __init__(self, labels=None, query_parameters=None):
            self.labels = labels or {}
            self.query_parameters = query_parameters or []

    fake_bq.ArrayQueryParameter = FakeArrayQueryParameter
    fake_bq.ScalarQueryParameter = FakeScalarQueryParameter
    fake_bq.QueryJobConfig = FakeQueryJobConfig
    fake_cloud.bigquery = fake_bq
    fake_google.cloud = fake_cloud
    return {
        "google": fake_google,
        "google.cloud": fake_cloud,
        "google.cloud.bigquery": fake_bq,
    }


class CrawlCleanupEvaluationTests(unittest.TestCase):
    """Tests for the pure cleanup evaluation logic."""

    def test_empty_table_returns_empty(self):
        result = evaluate_table_cleanup("pages", [])
        self.assertEqual(result["status"], "empty")
        self.assertEqual(result["partitions"], [])
        self.assertIsNone(result["error"])

    def test_copied_and_matched_under_retention_waits(self):
        row = make_row(staging_age_days=6.5, prod_age_days=6.0)
        result = evaluate_table_cleanup("pages", [row])
        self.assertEqual(result["status"], "waiting")
        self.assertIsNone(result["error"])

    def test_staging_old_but_prod_updated_recently_waits(self):
        row = make_row(staging_age_days=8.0, prod_age_days=3.0)
        result = evaluate_table_cleanup("pages", [row])
        self.assertEqual(result["status"], "waiting")
        self.assertIsNone(result["error"])

    def test_copied_and_matched_over_retention_is_ready(self):
        row = make_row(staging_age_days=8.0, prod_age_days=7.0)
        result = evaluate_table_cleanup("pages", [row])
        self.assertEqual(result["status"], "ready")
        self.assertIsNone(result["error"])
        self.assertEqual(len(result["partitions"]), 1)
        self.assertEqual(result["partitions"][0]["partition_id"], "20261101")

    def test_uncopied_under_retention_waits_without_failing(self):
        row = make_row(
            staging_age_days=2.0,
            prod_rows=None,
            prod_age_days=None,
        )
        result = evaluate_table_cleanup("requests", [row])
        self.assertEqual(result["status"], "waiting")
        self.assertIsNone(result["error"])

    def test_uncopied_over_retention_errors(self):
        row = make_row(
            staging_age_days=7.5,
            prod_rows=None,
            prod_age_days=None,
        )
        result = evaluate_table_cleanup("requests", [row])
        self.assertEqual(result["status"], "error")
        self.assertIn("20261101", result["error"])
        self.assertIn("missing partition in crawl", result["error"])

    def test_row_count_mismatch_over_retention_errors(self):
        row = make_row(
            staging_rows=50_000_000,
            prod_rows=49_999_000,
            staging_age_days=9.0,
            prod_age_days=8.0,
        )
        result = evaluate_table_cleanup("parsed_css", [row])
        self.assertEqual(result["status"], "error")
        self.assertIn("row count mismatch", result["error"])

    def test_staging_modified_after_prod_over_retention_errors(self):
        row = make_row(
            staging_age_days=7.5,
            prod_age_days=8.0,
        )
        result = evaluate_table_cleanup("pages", [row])
        self.assertEqual(result["status"], "error")
        self.assertIn("staging modified after crawl", result["error"])

    def test_multi_partition_ready_and_waiting_blocks_truncate(self):
        ready_row = make_row(
            partition_id="20261101",
            staging_age_days=15.0,
            prod_age_days=14.0,
        )
        active_crawl_row = make_row(
            partition_id="20261201",
            staging_rows=100_000,
            staging_age_days=0.5,
            prod_rows=None,
            prod_age_days=None,
        )
        result = evaluate_table_cleanup("pages", [ready_row, active_crawl_row])
        self.assertEqual(result["status"], "waiting")
        self.assertIsNone(result["error"])

    def test_multi_partition_stale_unverified_and_waiting_errors(self):
        stale_row = make_row(
            partition_id="20261101",
            staging_age_days=10.0,
            prod_rows=None,
            prod_age_days=None,
        )
        active_crawl_row = make_row(
            partition_id="20261201",
            staging_age_days=1.0,
            prod_rows=None,
            prod_age_days=None,
        )
        result = evaluate_table_cleanup("pages", [stale_row, active_crawl_row])
        self.assertEqual(result["status"], "error")
        self.assertIn("20261101", result["error"])

    def test_should_run_cleanup_truth_table(self):
        self.assertFalse(
            should_run_cleanup(
                {
                    "pages": {"status": "empty"},
                    "requests": {"status": "waiting"},
                    "parsed_css": {"status": "empty"},
                }
            )
        )
        self.assertTrue(
            should_run_cleanup(
                {
                    "pages": {"status": "ready"},
                    "requests": {"status": "waiting"},
                    "parsed_css": {"status": "empty"},
                }
            )
        )
        self.assertTrue(
            should_run_cleanup(
                {
                    "pages": {"status": "empty"},
                    "requests": {"status": "error"},
                    "parsed_css": {"status": "empty"},
                }
            )
        )

    def test_evaluate_all_tables_groups_by_table(self):
        rows = [
            make_row(table_name="pages", staging_age_days=9.0, prod_age_days=8.0),
            make_row(table_name="requests", staging_age_days=2.0, prod_age_days=1.5),
        ]
        evaluations = evaluate_all_tables(rows, retention_days=DEFAULT_STAGING_RETENTION_DAYS)
        self.assertEqual(set(evaluations.keys()), set(CRAWL_STAGING_TABLES))
        self.assertEqual(evaluations["pages"]["status"], "ready")
        self.assertEqual(evaluations["requests"]["status"], "waiting")
        self.assertEqual(evaluations["parsed_css"]["status"], "empty")

    def test_validate_table_name_rejects_unknown(self):
        with self.assertRaises(ValueError):
            validate_table_name("script_chunks")


class CrawlCleanupExecutionTests(unittest.TestCase):
    """Tests for the BigQuery execution shell using a mocked BigQuery client."""

    def _mock_client_with_rows(self, rows):
        client = MagicMock()
        metadata_job = MagicMock()
        metadata_job.result.return_value = rows
        truncate_job = MagicMock()
        truncate_job.job_id = "bqjob_truncate_123"
        truncate_job.result.return_value = None
        client.query.side_effect = [metadata_job, truncate_job]
        return client

    def test_truncate_executes_when_ready_with_labels(self):
        rows = [make_row(table_name="pages", staging_age_days=9.0, prod_age_days=8.0)]
        client = self._mock_client_with_rows(rows)
        labels = {"airflow-dag": "crawl_staging_cleanup", "airflow-task": "cleanup_crawl_staging_pages"}

        with patch.dict(sys.modules, make_fake_bigquery_module()):
            result = truncate_crawl_staging_table(
                project_id="httparchive",
                table_name="pages",
                client=client,
                labels=labels,
            )

        self.assertTrue(result["truncated"])
        self.assertEqual(result["status"], "truncated")
        self.assertEqual(result["partitions"], ["20261101"])
        self.assertEqual(result["job_id"], "bqjob_truncate_123")
        self.assertEqual(client.query.call_count, 2)
        truncate_sql = client.query.call_args_list[1].args[0]
        truncate_config = client.query.call_args_list[1].kwargs["job_config"]
        self.assertEqual(
            truncate_sql,
            "TRUNCATE TABLE `httparchive.crawl_failures.pages`;\n"
            "TRUNCATE TABLE `httparchive.crawl_staging.pages`;",
        )
        self.assertEqual(truncate_config.labels, labels)

    def test_truncate_skips_without_sql_when_empty_or_waiting(self):
        for rows, expected_status in [
            ([], "empty"),
            ([make_row(table_name="pages", staging_age_days=3.0, prod_age_days=2.5)], "waiting"),
        ]:
            with self.subTest(expected_status=expected_status):
                client = self._mock_client_with_rows(rows)
                with patch.dict(sys.modules, make_fake_bigquery_module()):
                    result = truncate_crawl_staging_table(
                        project_id="httparchive",
                        table_name="pages",
                        client=client,
                    )
                self.assertFalse(result["truncated"])
                self.assertEqual(result["status"], expected_status)
                self.assertEqual(client.query.call_count, 1)

    def test_truncate_raises_without_sql_when_stale_unverified(self):
        rows = [
            make_row(
                table_name="requests",
                staging_age_days=10.0,
                prod_rows=None,
                prod_age_days=None,
            )
        ]
        client = self._mock_client_with_rows(rows)

        with patch.dict(sys.modules, make_fake_bigquery_module()):
            with self.assertRaises(ValueError):
                truncate_crawl_staging_table(
                    project_id="httparchive",
                    table_name="requests",
                    client=client,
                )

        self.assertEqual(client.query.call_count, 1)

    def test_truncate_rejects_unknown_table_without_query(self):
        client = MagicMock()
        with patch.dict(sys.modules, make_fake_bigquery_module()):
            with self.assertRaises(ValueError):
                truncate_crawl_staging_table(
                    project_id="httparchive",
                    table_name="unknown_table",
                    client=client,
                )
        client.query.assert_not_called()

    def test_readiness_check_returns_expected_boolean(self):
        rows = [make_row(table_name="pages", staging_age_days=9.0, prod_age_days=8.0)]
        client = self._mock_client_with_rows(rows)
        with patch.dict(sys.modules, make_fake_bigquery_module()):
            self.assertTrue(
                check_crawl_staging_cleanup_readiness(
                    project_id="httparchive",
                    client=client,
                    labels={"airflow-dag": "crawl_staging_cleanup"},
                )
            )


class ResponseBodyCleanupTests(unittest.TestCase):
    """Tests for cleaning response_body on the cutoff partition."""

    def test_cutoff_date_calculation(self):
        self.assertEqual(
            get_response_body_cutoff_date(14, as_of=datetime(2026, 11, 27, tzinfo=timezone.utc)),
            "2025-09-01",
        )
        self.assertEqual(
            get_response_body_cutoff_date(14, as_of=datetime(2026, 1, 25, tzinfo=timezone.utc)),
            "2024-11-01",
        )

    def test_clean_old_response_bodies_runs_single_partition_update(self):
        update_job = MagicMock(job_id="bqjob_clean_resp_1")
        update_job.result.return_value = None
        client = MagicMock()
        client.query.return_value = update_job
        labels = {"airflow-dag": "crawl_staging_cleanup"}

        with patch.dict(sys.modules, make_fake_bigquery_module()):
            result = clean_old_response_bodies(
                "httparchive",
                as_of=datetime(2026, 11, 27, tzinfo=timezone.utc),
                client=client,
                labels=labels,
            )

        self.assertEqual(
            result,
            {"partition_date": "2025-05-01", "job_id": "bqjob_clean_resp_1"},
        )
        self.assertEqual(client.query.call_count, 1)
        update_sql = client.query.call_args.args[0]
        update_cfg = client.query.call_args.kwargs["job_config"]
        self.assertIn("UPDATE `httparchive.crawl.requests`", update_sql)
        self.assertIn("SET response_body = NULL", update_sql)
        self.assertIn("WHERE date = DATE(@cutoff_date)", update_sql)
        self.assertEqual(update_cfg.labels, labels)
        self.assertEqual(update_cfg.query_parameters[0].name, "cutoff_date")
        self.assertEqual(update_cfg.query_parameters[0].value, "2025-05-01")


if __name__ == "__main__":
    unittest.main()
