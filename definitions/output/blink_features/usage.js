publish('usage', {
  schema: 'blink_features',
  type: 'incremental',
  protected: true,
  tags: ['crawl_complete', 'blink_report']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE yyyymmdd = REPLACE('${constants.currentMonth}', '-', '');
`).query(ctx => `
SELECT
  REPLACE(CAST(date AS STRING), '-', '') AS yyyymmdd,
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
    yyyymmdd AS date,
    client,
    id,
    feature,
    type,
    COUNT(DISTINCT url) AS num_urls,
    ARRAY_AGG(url ORDER BY rank, url LIMIT 100) AS sample_urls
  FROM ${ctx.ref('blink_features', 'features')}
  WHERE
    yyyymmdd = '${constants.currentMonth}'
    ${constants.devRankFilter}
  GROUP BY
    yyyymmdd,
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
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${constants.currentMonth}' AND
    is_root_page = TRUE
    ${constants.devRankFilter}
  GROUP BY
    date,
    client
)
USING (date, client)
`)
