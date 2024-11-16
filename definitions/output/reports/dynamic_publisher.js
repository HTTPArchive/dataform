const configs = new reports.HTTPArchiveReports()
const params = {
  date: constants.currentMonth
}

const metrics = configs.listMetrics()
metrics.forEach(metric => {
  publish(metric.id, {
    type: 'table',
    schema: 'reports',
    tags: ['crawl_reports']
  }).query(ctx => constants.fillTemplate(metric.histogramSQL, params))
})
