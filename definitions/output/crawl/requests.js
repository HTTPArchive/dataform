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
}).preOps(ctx => `
${reservations.reservation_setter(ctx)}

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
`).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl_staging', 'requests')}
WHERE date IS NULL ${constants.devRankFilter}
LIMIT 0
`)
