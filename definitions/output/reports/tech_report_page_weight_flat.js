const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_page_weight_flat', {
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
  geo,
  rank,
  client,
  technology,
  version,
  median_page_weight_bytes.total AS median_bytes_total,
  median_page_weight_bytes.js AS median_bytes_js,
  median_page_weight_bytes.images AS median_bytes_images
FROM ${ctx.ref('reports', 'tech_crux')}
WHERE date = '${pastMonth}'
`)
