const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_adoption', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['cwv_tech_report']
}).preOps(ctx => `
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

DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
/* {"dataform_trigger": "report_cwv_tech_complete", "date": "${pastMonth}", "name": "adoption", "type": "report"} */
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
