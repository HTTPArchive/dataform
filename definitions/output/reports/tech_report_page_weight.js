const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_page_weight', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['tech_report']
}).preOps(ctx => `
CREATE TEMPORARY FUNCTION GET_PAGE_WEIGHT(
  records ARRAY<STRUCT<
    client STRING,
    total INT64,
    js INT64,
    images INT64
>>)
RETURNS ARRAY<STRUCT<
  name STRING,
  mobile STRUCT<
    median_bytes INT64
  >,
  desktop STRUCT<
    median_bytes INT64
>>>
LANGUAGE js AS '''
const METRICS = ['total', 'js', 'images']

// Initialize the page weight map.
const pageWeight = Object.fromEntries(
  METRICS.map(metricName => {
    return [metricName, {name: metricName}]
  })
)

// Populate each client record.
records.forEach(record => {
  METRICS.forEach(metricName => {
    pageWeight[metricName][record.client] = {median_bytes: record[metricName]}
  })
})

return Object.values(pageWeight)
''';

DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
SELECT
  date,
  geo,
  rank,
  technology,
  version,
  GET_PAGE_WEIGHT(ARRAY_AGG(STRUCT(
    client,
    median_page_weight_bytes.total,
    median_page_weight_bytes.js,
    median_page_weight_bytes.images
  ))) AS page_weight
FROM ${ctx.ref('reports', 'tech_crux')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  geo,
  rank,
  technology,
  version
`).postOps(ctx => `
  SELECT
    reports.run_export_job(
      JSON '''{
        "destination": "firestore",
        "config": {
          "databaseId": "tech-report-api-{constants.environment}",
          "collectionName": "page_weight",
          "collectionType": "report",
          "date": "${pastMonth}"
        },
        "query": "SELECT STRING(date) AS date, * EXCEPT(date) FROM ${ctx.self()} WHERE date = '${pastMonth}'"
      }'''
    );
  `)
