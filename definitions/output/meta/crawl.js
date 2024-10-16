publish('meta_crawl', {
  type: 'table',
  description: 'Used in dashboard: https://lookerstudio.google.com/u/7/reporting/1jh_ScPlCIbSYTf2r2Y6EftqmX9SQy4Gn/page/p_an38lbzywc/edit',
  schema: 'scratchspace',
  tags: ['crawl_results_all']
}).query(`
WITH metadata AS (
  SELECT * FROM pages.__TABLES__
  UNION ALL
  SELECT * FROM requests.__TABLES__
  UNION ALL
  SELECT * FROM response_bodies.__TABLES__
  UNION ALL
  SELECT * FROM summary_pages.__TABLES__
  UNION ALL
  SELECT * FROM summary_requests.__TABLES__
  UNION ALL
  SELECT * FROM lighthouse.__TABLES__
  UNION ALL
  SELECT * FROM technologies.__TABLES__
  UNION ALL
  SELECT
    'httparchive' AS project_id,
    'blink_features' AS dataset_id,
    CONCAT(REGEXP_REPLACE(yyyymmdd, r'(\\d{4})(\\d{2})(\\d{2})', r'\\1_\\2_\\3_'), client)  AS table_id,
    NULL AS creation_time,
    NULL AS last_modified_time,
    COUNT(0) AS row_count,
    SUM(LENGTH(CONCAT(yyyymmdd, client, id, feature, type, CAST(num_urls AS STRING), CAST(total_urls AS STRING), CAST(pct_urls AS STRING), ARRAY_TO_STRING(sample_urls, ' ')))) AS size_bytes,
    1 AS type
  FROM blink_features.usage
  GROUP BY
    table_id,
    client
  UNION ALL
  SELECT
    'httparchive' AS project_id,
    'all.' || table_name AS dataset_id,
    PARTITION_ID AS table_id,
    NULL AS creation_time,
    NULL AS last_modified_time,
    TOTAL_ROWS AS row_count,
    TOTAL_LOGICAL_BYTES AS size_bytes,
    1 AS type
  FROM \`all.INFORMATION_SCHEMA.PARTITIONS\`
  UNION ALL
  SELECT
    'httparchive' AS project_id,
    'core_web_vitals.' || table_name AS dataset_id,
    PARTITION_ID AS table_id,
    NULL AS creation_time,
    NULL AS last_modified_time,
    TOTAL_ROWS AS row_count,
    TOTAL_LOGICAL_BYTES AS size_bytes,
    1 AS type
  FROM core_web_vitals.INFORMATION_SCHEMA.PARTITIONS
  WHERE table_name = 'technologies'
  -- TODO: Remove this when the tables are migrated to the 'all' dataset
  SELECT
    'httparchive' AS project_id,
    'all_dev.' || table_name AS dataset_id,
    PARTITION_ID AS table_id,
    NULL AS creation_time,
    NULL AS last_modified_time,
    TOTAL_ROWS AS row_count,
    TOTAL_LOGICAL_BYTES AS size_bytes,
    1 AS type
  FROM \`all_dev.INFORMATION_SCHEMA.PARTITIONS\`
  UNION ALL
)

SELECT
  REPLACE(SUBSTR(table_id, 0, 10), '_', '') AS yyyymmdd,
  REGEXP_EXTRACT(table_id, r'(desktop|mobile)') AS client,
  *
FROM metadata
`)
