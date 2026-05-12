const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_lighthouse_flat', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'rank', 'geo', 'technology']
  },
  tags: ['crux_ready']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
SELECT
  date,
  client,
  geo,
  rank,
  technology,
  version,
  median_lighthouse_score.accessibility AS median_score_accessibility,
  median_lighthouse_score.best_practices AS median_score_best_practices,
  median_lighthouse_score.performance AS median_score_performance,
  median_lighthouse_score.seo AS median_score_seo
FROM ${ctx.ref('reports', 'tech_crux')}
WHERE date = '${pastMonth}'
`)
