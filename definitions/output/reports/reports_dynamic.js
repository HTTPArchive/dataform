const configs = new reports.HTTPArchiveReports()
const metrics = configs.listMetrics()

const bucket = 'httparchive'
const storagePath = '/reports/'

function generateExportQuery(metric, sql, params, ctx) {
  if (sql.type === 'histogram') {
    return `
SELECT
  * EXCEPT(date)
FROM ${ctx.self()}
WHERE date = '${params.date}'
`
  } else if (sql.type === 'timeseries') {
    return `
SELECT
  FORMAT_DATE('%Y_%m_%d', date) AS date,
  * EXCEPT(date)
FROM reports.${metric}_timeseries
  `} else {
    throw new Error('Unknown SQL type')
  }
}

function generateExportPath(metric, sql, params) {
  if (sql.type === 'histogram') {
    return `${storagePath}${params.date.replaceAll('-', '_')}/${metric}.json`
  } else if (sql.type === 'timeseries') {
    return `${storagePath}${metric}.json`
  } else {
    throw new Error('Unknown SQL type')
  }
}

const iterations = []
for (
  let date = constants.currentMonth; month >= constants.currentMonth; month = constants.fnPastMonth(month)) {
  iterations.push({
    date: date
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
        //tags: ['crawl_complete', 'http_reports']
      }).preOps(ctx => `
--DELETE FROM ${ctx.self()}
--WHERE date = '${params.date}';
      `).query(
        ctx => sql.query(ctx, params)
      ).postOps(ctx => `
SELECT
  reports.run_export_job(
    JSON '''{
      "destination": "cloud_storage",
      "config": {
        "bucket": "${bucket}",
        "name": "${generateExportPath(metric, sql, params)}"
      },
      "query": "${generateExportQuery(metric, sql, params, ctx)}"}
    }'''
  );
      `)
    })
  })
} else {
  iterations.forEach((params, i) => {
    metrics.forEach(metric => {
      metric.SQL.forEach(sql => {
        operate(metric.id + '_' + sql.type + '_' + params.date, {
          //tags: ['crawl_complete']
        }).queries(ctx => `
DELETE FROM reports.${metric.id}_${sql.type}
WHERE date = '${params.date}';

INSERT INTO reports.${metric.id}_${sql.type}` + sql.query(ctx, params)
        ).postOps(ctx => `
  SELECT
  reports.run_export_job(
    JSON '''{
      "destination": "cloud_storage",
      "config": {
        "bucket": "${bucket}",
        "name": "${generateExportPath(metric, sql, params)}"
      },
      "query": "${generateExportQuery(metric, sql, params, ctx)}"}
    }'''
  );
        `)
      })
    })
  })
}
