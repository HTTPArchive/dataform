const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_lighthouse', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['crux_ready']
}).preOps(ctx => `
CREATE TEMPORARY FUNCTION GET_LIGHTHOUSE(
  records ARRAY<STRUCT<
    client STRING,
    median_lighthouse_score_accessibility NUMERIC,
    median_lighthouse_score_best_practices NUMERIC,
    median_lighthouse_score_performance NUMERIC,
    median_lighthouse_score_pwa NUMERIC,
    median_lighthouse_score_seo NUMERIC,
    lighthouse_score_accessibility_pass_rate NUMERIC,
    lighthouse_score_best_practices_pass_rate NUMERIC,
    lighthouse_score_performance_pass_rate NUMERIC,
    lighthouse_score_pwa_pass_rate NUMERIC,
    lighthouse_score_seo_pass_rate NUMERIC
  >>
)
RETURNS ARRAY<STRUCT<
  name STRING,
  desktop STRUCT<
    median_score FLOAT64,
    pass_rate FLOAT64
  >,
  mobile STRUCT<
    median_score FLOAT64,
    pass_rate FLOAT64
  >
>>
LANGUAGE js AS '''
const metrics = [
  'accessibility',
  'best_practices',
  'performance',
  'pwa',
  'seo'
];

const result = metrics.map(metric => {
  const mobileData = records.find(record => record.client === 'mobile');
  const desktopData = records.find(record => record.client === 'desktop');

  return {
    name: metric,
    mobile: {
      median_score: mobileData ? mobileData[\`median_lighthouse_score_\${metric}\`] || null : null,
      pass_rate: mobileData ? mobileData[\`lighthouse_score_\${metric}_pass_rate\`] || null : null
    },
    desktop: {
      median_score: desktopData ? desktopData[\`median_lighthouse_score_\${metric}\`] || null : null,
      pass_rate: desktopData ? desktopData[\`lighthouse_score_\${metric}_pass_rate\`] || null : null
    }
  };
});

return result;
''';

DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
/* {"dataform_trigger": "report_cwv_tech_complete", "date": "${pastMonth}", "name": "lighthouse", "type": "report"} */
SELECT
  date,
  app AS technology,
  rank,
  geo,
  GET_LIGHTHOUSE(ARRAY_AGG(STRUCT(
    client,
    median_lighthouse_score_accessibility,
    median_lighthouse_score_best_practices,
    median_lighthouse_score_performance,
    median_lighthouse_score_pwa,
    median_lighthouse_score_seo,
    lighthouse_score_accessibility_pass_rate,
    lighthouse_score_best_practices_pass_rate,
    lighthouse_score_performance_pass_rate,
    lighthouse_score_pwa_pass_rate,
    lighthouse_score_seo_pass_rate
  ))) AS lighthouse
FROM ${ctx.ref('core_web_vitals', 'technologies')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  app,
  rank,
  geo
`)
