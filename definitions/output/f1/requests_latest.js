publish('requests_latest', {
  type: 'table',
  schema: 'f1',
  description: 'The latest date from the crawl.requests table',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'type']
  },
  tags: ['crawl_complete']
}).query(ctx => `
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  url,
  is_main_document,
  type,
  index,
  TO_JSON_STRING(payload) AS payload,
  TO_JSON_STRING(summary) AS summary,
  request_headers,
  response_headers,
  response_body
FROM ${ctx.ref('crawl', 'requests')}
WHERE
  date = '${constants.currentMonth}' AND
  client = 'mobile'
`).postOps(ctx => `
INSERT INTO ${ctx.self()}
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  url,
  is_main_document,
  type,
  index,
  TO_JSON_STRING(payload) AS payload,
  TO_JSON_STRING(summary) AS summary,
  request_headers,
  response_headers,
  response_body
FROM ${ctx.ref('crawl', 'requests')}
WHERE date = '${constants.currentMonth}' AND
  client = 'desktop'
`)
