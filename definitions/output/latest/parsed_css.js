const columns = descriptions.columns.parsed_css;

publish('parsed_css', {
  type: 'view',
  schema: 'latest',
  columns: columns,
}).query(ctx => `
SELECT
  *
FROM ${ctx.ref('crawl', 'parsed_css')}
WHERE
  date = (
    SELECT
      PARSE_DATE('%Y%m%d', MAX(partition_id)) AS date
    FROM
      httparchive.crawl.INFORMATION_SCHEMA.PARTITIONS
    WHERE
      table_name = 'parsed_css' AND
      /* Only include actual dates in partition ids */
      partition_id >= '20250101' AND
      partition_id < '20990101' AND
      /* Exclude future dates - shouldn't be any, but you never know! */
      partition_id <= FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  ) AND
  /* The following should help make this even faster since above query is a little complex */
  /* We should never be more than 60 days old hopefully! */
  date >= DATE_SUB(CURRENT_DATE(), INTERVAL 61 DAY) AND
  date <= CURRENT_DATE()
`)
