const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('adoption', {
  schema: 'cwv_tech_reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['cwv_tech_report']
}).preOps(`
CREATE TEMPORARY FUNCTION GET_ADOPTION(
  records ARRAY<STRUCT<
    client STRING,
    origins INT64
>>)
RETURNS STRUCT<
  desktop INT64,
  mobile INT64
>
LANGUAGE js AS '''
return Object.fromEntries(
  records.map(({client, origins}) => {
    return [client, origins]
}))
''';
`).query(ctx => `
SELECT
  date,
  app AS technology,
  rank,
  geo,
  GET_ADOPTION(ARRAY_AGG(STRUCT(
    client,
    origins
  ))) AS adoption
FROM ${ctx.ref('core_web_vitals', 'technologies')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  app,
  rank,
  geo
`)
