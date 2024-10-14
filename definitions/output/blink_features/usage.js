publish("usage", {
  schema: "blink_features",
  type: "incremental",
  protected: true,
  tags: ["blink_features_report"]
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE yyyymmdd = REPLACE('${constants.current_month}', '-', '');
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
  FROM ${ctx.ref("blink_features", "features")}
  WHERE
    yyyymmdd = '${constants.current_month}'
    ${constants.dev_rank_filter}
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
  FROM ${ctx.ref("all", "pages")}
  WHERE
    date = '${constants.current_month}' AND
    is_root_page = TRUE
    ${constants.dev_rank_filter}
  GROUP BY
    date,
    client
)
USING (date, client)
`)
