const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_adoption_flat', {
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
  origins
FROM ${ctx.ref('reports', 'tech_crux')}
WHERE date = '${pastMonth}'
`)
