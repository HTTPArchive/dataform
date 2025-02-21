publish('requests_latest', {
  type: 'view',
  schema: 'crawl'
}).query(ctx => `
SELECT
  *
FROM ${ctx.ref('crawl', 'requests')}
WHERE
  date IS NOT NULL AND
  date = (
    SELECT
      CAST(REGEXP_REPLACE(MAX(IF(partition_id = '__NULL__', NULL, partition_id)), r'(\\d{4})(\\d{2})(\\d{2})', '\\\\1-\\\\2-\\\\3') AS DATE) AS date
    FROM crawl.INFORMATION_SCHEMA.PARTITIONS
    WHERE
      table_name = 'requests' AND
      partition_id != '__NULL__')
`)
