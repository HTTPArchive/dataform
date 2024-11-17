const configs = new reports.HTTPArchiveReports()
const params = {
  date: constants.currentMonth,
  rankFilter: constants.devRankFilter
}

const metrics = configs.listMetrics()
metrics.forEach(metric => {
  metric.SQL.forEach(sql => {
    publish(sql.type, {
      type: 'table',
      schema: 'reports',
      tags: ['crawl_reports']
    }).query(ctx => constants.fillTemplate(sql.query, params))
  })
})
