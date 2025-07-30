const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('html_elements_popularity', {
  schema: 'reports',
  type: 'incremental',
  tags: ['crux_ready'],
  description: `Contact: https://github.com/bkardell`
}).preOps(`
CREATE TEMPORARY FUNCTION getElements(payload STRING)
RETURNS ARRAY<STRING> LANGUAGE js AS '''
try {
  var elements = JSON.parse(payload);
  if (Array.isArray(elements) || typeof elements != 'object') return [];
  return Object.keys(elements);
} catch (e) {
  return [];
}
''';

DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
WITH pages_data AS (
  SELECT
    date,
    client,
    root_page,
    page,
    custom_metrics.element_count
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}' ${constants.devRankFilter}
),

totals AS (
  SELECT
    client,
    COUNT(DISTINCT root_page) AS total
  FROM pages_data
  GROUP BY client
)

SELECT
  p.date,
  p.client,
  element,
  COUNT(DISTINCT p.root_page) AS pages,
  t.total,
  COUNT(DISTINCT p.root_page) / t.total AS pct,
  ARRAY_TO_STRING(ARRAY_AGG(DISTINCT p.page LIMIT 5), ' ') AS sample_urls
FROM pages_data p
JOIN totals t
ON p.client = t.client,
  UNNEST(getElements(TO_JSON_STRING(p.element_count))) AS element
GROUP BY
  p.client,
  t.total,
  element
HAVING
  COUNT(DISTINCT p.root_page) >= 10
ORDER BY
  pages / total DESC,
  client
`).postOps(ctx => `
SELECT
  reports.run_export_job(
    JSON '''{
      "destination": "cloud_storage",
      "config": {
        "bucket": "${constants.bucket}",
        "name": "${constants.storagePath}${pastMonth.replaceAll('-', '_')}/htmlElementPopularity.json"
      },
      "query": "SELECT * EXCEPT(date) FROM ${ctx.self()} WHERE date = '${pastMonth}'"
    }'''
  );
`)
