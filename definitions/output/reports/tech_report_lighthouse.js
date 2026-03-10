const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_lighthouse', {
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
    median_lighthouse_score_seo NUMERIC
  >>
)
RETURNS ARRAY<STRUCT<
  name STRING,
  desktop STRUCT<
    median_score FLOAT64
  >,
  mobile STRUCT<
    median_score FLOAT64
  >
>>
LANGUAGE js AS '''
const METRIC_MAP = {
  accessibility: 'median_lighthouse_score_accessibility',
  best_practices: 'median_lighthouse_score_best_practices',
  performance: 'median_lighthouse_score_performance',
  seo: 'median_lighthouse_score_seo',
}

// Initialize the Lighthouse map.
const lighthouse = Object.fromEntries(Object.keys(METRIC_MAP).map(metricName => {
  return [metricName, {name: metricName}]
}));

// Populate each client record.
records.forEach(record => {
  Object.entries(METRIC_MAP).forEach(([metricName, median_score]) => {
    lighthouse[metricName][record.client] = {median_score: record[median_score]}
  });
});

return Object.values(lighthouse)
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
  GET_LIGHTHOUSE(ARRAY_AGG(STRUCT(
    client,
    median_lighthouse_score.accessibility,
    median_lighthouse_score.best_practices,
    median_lighthouse_score.performance,
    median_lighthouse_score.seo
  ))) AS lighthouse
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
        "database": "tech-report-api-${constants.environment}",
        "collection": "lighthouse",
        "type": "report",
        "date": "${pastMonth}"
      },
      "query": "SELECT STRING(date) AS date, * EXCEPT(date) FROM ${ctx.self()} WHERE date = '${pastMonth}'"
    }'''
  );

  -- legacy export to tech-report-apis database
  SELECT
  reports.run_export_job(
    JSON '''{
      "destination": "firestore",
      "config": {
        "database": "tech-report-apis-${constants.environment}",
        "collection": "lighthouse",
        "type": "report",
        "date": "${pastMonth}"
      },
      "query": "SELECT STRING(date) AS date, * EXCEPT(date, version) FROM ${ctx.self()} WHERE date = '${pastMonth}' AND version = 'ALL'"
    }'''
  );
`)
