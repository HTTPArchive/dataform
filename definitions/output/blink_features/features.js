publish('features', {
  schema: 'blink_features',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'yyyymmdd',
    clusterBy: ['client', 'rank']
  },
  tags: ['blink_features_report']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE yyyymmdd = DATE '${constants.currentMonth}';
`).query(ctx => `
SELECT
  date AS yyyymmdd,
  client,
  url,
  feature.feature AS feature,
  feature.type,
  feature.id,
  rank
FROM (
  SELECT
    date,
    client,
    page AS url,
    payload,
    rank,
    feature
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(features) AS feature
  WHERE
    date = '${constants.currentMonth}' AND
    is_root_page = TRUE
    ${constants.devRankFilter}
)
`)
