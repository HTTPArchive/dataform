publish('technology_matrix', {
  type: 'table',
  schema: 'core_web_vitals',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 't1']
  },
  description: 'Used in: https://lookerstudio.google.com/u/2/reporting/0ad64c8f-644a-40f9-93e4-0ccd5f72b33d',
  tags: ['crawl_complete']
}).query(ctx => `
WITH a AS (
  SELECT
    date,
    client,
    root_page,
    technology AS t1,
    ARRAY_TO_STRING(ARRAY(SELECT category FROM UNNEST(categories) AS category ORDER BY category), ', ') AS c1
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies)
  WHERE
    date = '${constants.currentMonth}' AND
    is_root_page
), b AS (
  SELECT
    client,
    root_page,
    technology AS t2,
    ARRAY_TO_STRING(ARRAY(SELECT category FROM UNNEST(categories) AS category ORDER BY category), ', ') AS c2
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies)
  WHERE
    date = '${constants.currentMonth}' AND
    is_root_page
)


SELECT
  date,
  client,
  t1,
  c1,
  t2,
  c2,
  COUNT(DISTINCT root_page) AS pages
FROM a
LEFT JOIN b
USING (client, root_page)
GROUP BY
  date,
  client,
  t1,
  c1,
  t2,
  c2
`)
