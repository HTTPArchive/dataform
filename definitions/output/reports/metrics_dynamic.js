const configs = new reports.HTTPArchiveReports()
const params = {
  date: constants.currentMonth,
  rankFilter: constants.devRankFilter
}

const metrics = configs.listMetrics()
metrics.forEach(metric => {
  metric.SQL.forEach(sql => {
    publish(metric.id, {
      type: 'table',
      schema: 'reports_' + sql.type,
      tags: ['crawl_reports']
    }).query(ctx => constants.fillTemplate(sql.query, params))
  })
})
