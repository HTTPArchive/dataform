const { HTTPArchiveReports } = require('httparchive_reports')

const configs = new HTTPArchiveReports()
// const date = constants.currentMonth

const metrics = configs.listMetrics()
metrics.forEach(metric => {
  publish(metric.id, {
    type: 'table',
    schema: 'reports',
    tags: ['crawl_reports']
  }).query(ctx => metric.histogramSQL)
})
