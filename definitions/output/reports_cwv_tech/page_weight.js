const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('page_weight', {
  schema: 'reports_cwv_tech',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['cwv_tech_report']
}).preOps(`
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
const pageWeight = Object.fromEntries(METRICS.map(metricName => {
return [metricName, {name: metricName}]
}))

// Populate each client record.
records.forEach(record => {
  METRICS.forEach(metricName => {
    pageWeight[metricName][record.client] = {median_bytes: record[metricName]}
  })
})

return Object.values(pageWeight)
''';
`).query(ctx => `
SELECT
  date,
  app AS technology,
  rank,
  geo,
  GET_PAGE_WEIGHT(ARRAY_AGG(STRUCT(
    client,
    median_bytes_total,
    median_bytes_js,
    median_bytes_image
  ))) AS pageWeight
FROM ${ctx.ref('core_web_vitals', 'technologies')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  app,
  rank,
  geo
`)