const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('adoption', {
  schema: 'tech_reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['cwv_tech_report']
}).query(ctx => `
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
  records.map(({{client, origins}}) => {{
    return [client, origins];
  }})
);
''';

SELECT
  STRING(DATE(date)) as date,
  app AS technology,
  rank,
  geo,
  GET_ADOPTION(ARRAY_AGG(STRUCT(
    client,
    origins
  ))) AS adoption
FROM ${ctx.ref('core_web_vitals', 'technologies')}
WHERE date = '${pastMonth}'
  ${constants.devRankFilter}
GROUP BY
  date,
  app,
  rank,
  geo
`)
