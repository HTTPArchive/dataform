const columns = descriptions.columns.requests

publish('requests', {
  type: 'incremental',
  protected: true,
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'type', 'rank'],
    requirePartitionFilter: true
  },
  columns: columns,
  tags: ['crawl_complete']
})
  .preOps(
    (ctx) => `
BEGIN
  DECLARE needs_processing BOOL DEFAULT COALESCE(
    (
      SELECT
        MAX(staging.last_modified_time) > COALESCE(
          MAX(target.last_modified_time),
          TIMESTAMP('1970-01-01')
        ) AND SUM(staging.total_rows) > 0
      FROM \`${dataform.projectConfig.defaultDatabase}.crawl_staging.INFORMATION_SCHEMA.PARTITIONS\` AS staging
      LEFT JOIN \`${dataform.projectConfig.defaultDatabase}.crawl.INFORMATION_SCHEMA.PARTITIONS\` AS target
        ON staging.partition_id = target.partition_id
        AND target.table_name = 'requests'
      WHERE staging.table_name = 'requests'
        AND staging.partition_id = FORMAT_DATE('%Y%m%d', DATE('${constants.currentMonth}'))
    ),
    FALSE
  );

  IF NOT needs_processing THEN
    RAISE USING MESSAGE = 'Partition ${constants.currentMonth} in crawl.requests is already up to date with crawl_staging.requests (or staging is empty).';
  END IF;

  FOR client_var IN (SELECT * FROM UNNEST(['desktop', 'mobile']) AS value) DO
    FOR is_root_page_var IN (SELECT * FROM UNNEST([TRUE, FALSE]) AS value) DO
      FOR rank_lt_50M_var IN (SELECT * FROM UNNEST([TRUE, FALSE]) AS value) DO

        -- Delete old entries
        DELETE FROM ${ctx.self()}
        WHERE date = '${constants.currentMonth}' AND
          client = client_var.value AND
          is_root_page = is_root_page_var.value AND
          (rank < 50000000) = rank_lt_50M_var.value;

        -- Insert new entries
        INSERT INTO ${ctx.self()}
        SELECT *
        FROM ${ctx.ref('crawl_staging', 'requests')}
        WHERE date = '${constants.currentMonth}' AND
          client = client_var.value AND
          is_root_page = is_root_page_var.value AND
          (rank < 50000000) = rank_lt_50M_var.value ${constants.devRankFilter};

      END FOR;
    END FOR;
  END FOR;
END;
`
  )
  .query(
    (ctx) => `
SELECT *
FROM ${ctx.ref('crawl_staging', 'requests')}
WHERE date IS NULL ${constants.devRankFilter}
LIMIT 0
`
  )
