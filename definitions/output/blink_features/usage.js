publish('usage', {
  schema: 'blink_features',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'feature'],
    requirePartitionFilter: true
  },
  tags: ['crawl_complete']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}';
`).query(ctx => `
WITH pages AS (
SELECT
  date,
  client,
  page,
  rank,
  features
FROM ${ctx.ref('crawl', 'pages')}
WHERE
  date = '${constants.currentMonth}' AND
  is_root_page = TRUE
  ${constants.devRankFilter}
)

SELECT
  date,
  client,
  id,
  feature,
  type,
  num_urls,
  total_urls,
  num_urls / total_urls AS pct_urls,
  sample_urls
FROM (
  SELECT
    date,
    client,
    feature.id,
    feature.feature,
    feature.type,
    COUNT(DISTINCT page) AS num_urls,
    ARRAY_AGG(page ORDER BY rank, page LIMIT 100) AS sample_urls
  FROM pages,
    UNNEST(features) AS feature
  GROUP BY
    date,
    client,
    id,
    feature,
    type
)
JOIN (
  SELECT
    date,
    client,
    COUNT(DISTINCT page) AS total_urls
  FROM pages
  GROUP BY
    date,
    client
)
USING (date, client)
`)
