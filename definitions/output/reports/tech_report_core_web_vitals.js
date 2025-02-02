const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_core_web_vitals', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['tech_report']
}).preOps(ctx => `
CREATE TEMPORARY FUNCTION GET_VITALS(
  records ARRAY<STRUCT<
    client STRING,
    origins_with_good_fid INT64,
    origins_with_good_cls INT64,
    origins_with_good_lcp INT64,
    origins_with_good_fcp INT64,
    origins_with_good_ttfb INT64,
    origins_with_good_inp INT64,
    origins_with_any_fid INT64,
    origins_with_any_cls INT64,
    origins_with_any_lcp INT64,
    origins_with_any_fcp INT64,
    origins_with_any_ttfb INT64,
    origins_with_any_inp INT64,
    origins_with_good_cwv INT64,
    origins_eligible_for_cwv INT64
>>)
RETURNS ARRAY<STRUCT<
  name STRING,
  desktop STRUCT<
    good_number INT64,
    tested INT64
  >,
  mobile STRUCT<
    good_number INT64,
    tested INT64
>>>
LANGUAGE js AS '''
const METRIC_MAP = {
  overall: ['origins_with_good_cwv', 'origins_eligible_for_cwv'],
  LCP: ['origins_with_good_lcp', 'origins_with_any_lcp'],
  CLS: ['origins_with_good_cls', 'origins_with_any_cls'],
  FID: ['origins_with_good_fid', 'origins_with_any_fid'],
  FCP: ['origins_with_good_fcp', 'origins_with_any_fcp'],
  TTFB: ['origins_with_good_ttfb', 'origins_with_any_ttfb'],
  INP: ['origins_with_good_inp', 'origins_with_any_inp']
};

// Initialize the vitals map.
const vitals = Object.fromEntries(
  Object.keys(METRIC_MAP).map(metricName => {
    return [metricName, {name: metricName}]
}));

// Populate each client record.
records.forEach(record => {
  Object.entries(METRIC_MAP).forEach(
    ([metricName, [good_number, tested]]) => {
    vitals[metricName][record.client] = {good_number: record[good_number], tested: record[tested]}
})})

return Object.values(vitals)
''';

DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
/* {"dataform_trigger": "tech_report_complete", "date": "${pastMonth}", "name": "core_web_vitals", "type": "report"} */
SELECT
  date,
  geo,
  rank,
  technology,
  version,
  GET_VITALS(ARRAY_AGG(STRUCT(
    client,
    crux.origins_with_good_fid,
    crux.origins_with_good_cls,
    crux.origins_with_good_lcp,
    crux.origins_with_good_fcp,
    crux.origins_with_good_ttfb,
    crux.origins_with_good_inp,
    crux.origins_with_any_fid,
    crux.origins_with_any_cls,
    crux.origins_with_any_lcp,
    crux.origins_with_any_fcp,
    crux.origins_with_any_ttfb,
    crux.origins_with_any_inp,
    crux.origins_with_good_cwv,
    crux.origins_eligible_for_cwv
  ))) AS vitals
FROM ${ctx.ref('reports', 'tech_crux')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  geo,
  rank,
  technology,
  version
`)
