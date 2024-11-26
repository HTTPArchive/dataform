const configs = new reports.HTTPArchiveReports()
const params = {
  date: constants.currentMonth,
  rankFilter: constants.devRankFilter
}
const metrics = configs.listMetrics()

metrics.forEach(metric => {
  metric.SQL.forEach(sql => {
    publish(metric.id, {
      type: 'incremental',
      protected: true,
      bigquery: sql.type === 'histogram' ? {partitionBy: 'date', clusterBy: ['client'] } : {},
      schema: 'reports_' + sql.type,
      tags: ['crawl_reports']
    }).query(ctx =>`
/* {"dataform_trigger": "reports_complete", "date": "${params.date}", "metric": "${metric.id}", "type": "${sql.type}"} */
DELETE FROM ${ctx.self()}
WHERE date = '${params.date}';
` + constants.fillTemplate(sql.query, params))
  })
})
