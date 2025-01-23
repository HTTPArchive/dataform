const configs = new reports.HTTPArchiveReports()
const metrics = configs.listMetrics()

const iterations = []
for (
  let month = constants.currentMonth; month >= constants.currentMonth; month = constants.fnPastMonth(month)) {
  iterations.push({
    date: month,
    devRankFilter: constants.devRankFilter
  })
}

if (iterations.length === 1) {
  const params = iterations[0]
  metrics.forEach(metric => {
    metric.SQL.forEach(sql => {
      publish(metric.id + '_' + sql.type, {
        type: 'incremental',
        protected: true,
        bigquery: sql.type === 'histogram' ? { partitionBy: 'date', clusterBy: ['client'] } : {},
        schema: 'reports',
        tags: ['crawl_complete', 'http_reports']
      }).preOps(ctx => `
--DELETE FROM ${ctx.self()}
--WHERE date = '${params.date}';
  `).query(ctx => `
/* {"dataform_trigger": "report_complete", "date": "${params.date}", "name": "${metric.id}", "type": "${sql.type}"} */` +
sql.query(ctx, params))
    })
  })
} else {
  iterations.forEach((params, i) => {
    metrics.forEach(metric => {
      metric.SQL.forEach(sql => {
        operate(metric.id + '_' + sql.type + '_' + params.date, {
          tags: ['crawl_complete']
        }).queries(ctx => `
DELETE FROM reports.${metric.id}_${sql.type}
WHERE date = '${params.date}';

/* {"dataform_trigger": "report_complete", "date": "${params.date}", "name": "${metric.id}", "type": "${sql.type}"} */
INSERT INTO reports.${metric.id}_${sql.type}` +
        sql.query(ctx, params))
      })
    })
  })
}
