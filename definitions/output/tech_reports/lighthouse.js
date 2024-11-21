const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('lighthouse', {
  schema: 'tech_reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['cwv_tech_report']
}).query(ctx => `
CREATE TEMPORARY FUNCTION GET_LIGHTHOUSE(
  records ARRAY<STRUCT<
    client STRING,
    median_lighthouse_score_accessibility NUMERIC,
    median_lighthouse_score_best_practices NUMERIC,
    median_lighthouse_score_performance NUMERIC,
    median_lighthouse_score_pwa NUMERIC,
    median_lighthouse_score_seo NUMERIC
>>)
RETURNS ARRAY<STRUCT<
  name STRING,
  desktop STRUCT<
    median_score NUMERIC
  >,
  mobile STRUCT<
    median_score NUMERIC
>>>
LANGUAGE js AS '''
const METRIC_MAP = {{
  accessibility: 'median_lighthouse_score_accessibility',
  best_practices: 'median_lighthouse_score_best_practices',
  performance: 'median_lighthouse_score_performance',
  pwa: 'median_lighthouse_score_pwa',
  seo: 'median_lighthouse_score_seo',
}};

// Initialize the Lighthouse map.
const lighthouse = Object.fromEntries(
  Object.keys(METRIC_MAP).map(metricName => {{
    return [metricName, {{name: metricName}}];
  }})
);

// Populate each client record.
records.forEach(record => {{
  Object.entries(METRIC_MAP).forEach(([metricName, median_score]) => {{
      lighthouse[metricName][record.client] = {{median_score: record[median_score]}};
  }});
}});

return Object.values(lighthouse);
''';

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
    median_lighthouse_score_seo
  ))) AS lighthouse
FROM ${ctx.ref('core_web_vitals', 'technologies')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  app,
  rank,
  geo
`)
