const configs = new reports.HTTPArchiveReports()
const params = {
  date: constants.currentMonth,
  rankFilter: constants.devRankFilter
}
const metrics = configs.listMetrics()

metrics.forEach(metric => {
  metric.SQL.forEach(sql => {
    publish(metric.id, {
      type: sql.type === 'histogram' ? 'incremental' : 'table',
      protected: sql.type === 'histogram',
      bigquery: {
        partitionBy: 'date',
        clusterBy: ['client']
      },
      schema: 'reports_' + sql.type,
      tags: ['crawl_reports']
    }).query(ctx =>
      `/* {"dataform_trigger": "reports_complete", "date": "${params.date}", "metric": "${metric.id}", "type": "${sql.type}"} */` +
      constants.fillTemplate(sql.query, params))
  })
})
