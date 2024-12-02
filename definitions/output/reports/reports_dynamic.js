const configs = new reports.HTTPArchiveReports()
const params = {
  date: constants.currentMonth,
  rankFilter: constants.devRankFilter
}
const metrics = configs.listMetrics()

metrics.forEach(metric => {
  metric.SQL.forEach(sql => {
    publish(metric.id + '_' + sql.type, {
      type: 'incremental',
      protected: true,
      bigquery: sql.type === 'histogram' ? { partitionBy: 'date', clusterBy: ['client'] } : {},
      schema: 'reports',
      tags: ['crawl_complete', 'crawl_reports']
    }).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${params.date}';
`).query(ctx => `
/* {"dataform_trigger": "report_complete", "date": "${params.date}", "name": "${metric.id}", "type": "${sql.type}"} */
` + constants.fillTemplate(sql.query, params))
  })
})
