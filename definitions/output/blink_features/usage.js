publish('usage', {
  schema: 'blink_features',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'rank', 'feature'],
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
  rank,
  page,
  features
FROM ${ctx.ref('crawl', 'pages')}
WHERE
  date = '${constants.currentMonth}' AND
  is_root_page = TRUE
  ${constants.devRankFilter}
), ranks AS (
  SELECT DISTINCT rank FROM pages
)

SELECT
  date,
  client,
  rank,
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
    ranks.rank,
    feature.id,
    feature.feature,
    feature.type,
    COUNT(DISTINCT page) AS num_urls,
    ARRAY_AGG(page ORDER BY pages.rank, page LIMIT 100) AS sample_urls
  FROM pages
  CROSS JOIN UNNEST(features) AS feature
  FULL OUTER JOIN ranks
  ON pages.rank <= ranks.rank
  GROUP BY
    date,
    client,
    ranks.rank,
    id,
    feature,
    type
)
JOIN (
  SELECT
    date,
    client,
    ranks.rank,
    COUNT(DISTINCT page) AS total_urls
  FROM pages
  FULL OUTER JOIN ranks
  ON pages.rank <= ranks.rank
  GROUP BY
    date,
    client,
    ranks.rank
)
USING (date, client, rank)
`)
