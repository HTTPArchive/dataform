const configs = new reports.HTTPArchiveReports()
const metrics = configs.listMetrics()

const bucket = 'httparchive'
const storagePath = '/reports/dev/'

function generateExportQuery (metric, sql, params, ctx) {
  let query = ''
  if (sql.type === 'histogram') {
    query = `
SELECT
  * EXCEPT(date)
FROM ${ctx.self()}
WHERE date = '${params.date}'
`
  } else if (sql.type === 'timeseries') {
    query = `
SELECT
  FORMAT_DATE('%Y_%m_%d', date) AS date,
  * EXCEPT(date)
FROM ${ctx.self()}
`
  } else {
    throw new Error('Unknown SQL type')
  }

  const queryOutput = query.replace(/[\r\n]+/g, ' ')
  return queryOutput
}

function generateExportPath (metric, sql, params) {
  if (sql.type === 'histogram') {
    return `${storagePath}${params.date.replaceAll('-', '_')}/${metric.id}.json`
  } else if (sql.type === 'timeseries') {
    return `${storagePath}${metric.id}.json`
  } else {
    throw new Error('Unknown SQL type')
  }
}

const iterations = []
for (
  let date = constants.currentMonth; date >= constants.currentMonth; date = constants.fnPastMonth(date)) {
  iterations.push({
    date,
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
        schema: 'reports'
        // tags: ['crawl_complete', 'http_reports']
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
      "query": "${generateExportQuery(metric, sql, params, ctx)}"
    }'''
  );
      `)
    })
  })
} else {
  iterations.forEach((params, _) => {
    metrics.forEach(metric => {
      metric.SQL.forEach(sql => {
        operate(metric.id + '_' + sql.type + '_' + params.date, {
          // tags: ['crawl_complete', 'http_reports']
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
      "query": "${generateExportQuery(metric, sql, params, ctx)}"
    }'''
  );
        `)
      })
    })
  })
}
