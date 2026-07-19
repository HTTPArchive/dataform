# Restoring BigQuery Datasets and Tables

BigQuery provides built-in recovery capabilities including Time Travel and Dataset Undrop to restore deleted or modified assets within the retention period (7 days by default).

## Restoring a Deleted Dataset

To restore an accidentally dropped dataset (schema):

```sql
UNDROP SCHEMA httparchive.crawl;
```

> For details, see [Google Cloud BigQuery Documentation: Restore deleted datasets](https://docs.cloud.google.com/bigquery/docs/restore-deleted-datasets#restore_a_dataset).

## Restoring a Deleted Table

To restore a deleted table from a specific snapshot timestamp using the `bq` command-line tool:

```bash
bq cp httparchive.crawl.pages@$(date -d '2025-08-04 16:00:00.000000Z' +%s000) httparchive.scratchspace.pages_restored_20250804
```

> For details, see [Google Cloud BigQuery Documentation: Restore deleted tables](https://docs.cloud.google.com/bigquery/docs/restore-deleted-tables#restore_a_table).

## Restoring a Table to a Specific Point in Time

To query and restore a table to a specific point in time using SQL Time Travel (`FOR SYSTEM_TIME AS OF`):

```sql
CREATE TABLE httparchive.scratchspace.pages_restored_20250804 AS
SELECT *
FROM httparchive.crawl.pages
  FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR);
```

> For details, see [Google Cloud BigQuery Documentation: Restore tables to a point in time](https://cloud.google.com/bigquery/docs/restore-tables#restoring_a_table_to_a_specific_point_in_time).
