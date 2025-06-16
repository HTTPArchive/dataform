const configs = new reports.HTTPArchiveReports()
const metrics = configs.listMetrics()
const lenses = configs.lenses;

const bucket = 'httparchive'
const storagePath = '/reports/dev/'

// Adjust start and end dates to update reports retrospectively
const startDate = '2024-12-01' // constants.currentMonth;
const endDate = '2024-12-01' // constants.currentMonth;

function generateExportPath (ctx, params) {
  if (params.sql.type === 'histogram') {
    return `${storagePath}${params.date.replaceAll('-', '_')}/${params.metric.id}.json`
  } else if (params.sql.type === 'timeseries') {
    return `${storagePath}${params.metric.id}.json`
  } else {
    throw new Error('Unknown SQL type')
  }
}

function generateExportQuery (ctx, params) {
  let query = ''
  if (params.sql.type === 'histogram') {
    query = `
SELECT * EXCEPT(date)
FROM \`reports.${params.sql.type}\`
WHERE date = '${params.date}'
`
  } else if (params.sql.type === 'timeseries') {
    query = `
SELECT
  FORMAT_DATE('%Y_%m_%d', date) AS date,
  * EXCEPT(date)
FROM \`reports.${params.sql.type}\`
`
  } else {
    throw new Error('Unknown SQL type')
  }

  const queryOutput = query.replace(/[\r\n]+/g, ' ')
  return queryOutput
}

const iterations = []
// dates
for (
  let date = endDate;
  date >= startDate;
  date = constants.fnPastMonth(date)
) {
  // metrics
  metrics.forEach(metric => {
    // timeseries and histograms
    metric.SQL.forEach(sql => {
      // lenses
      for (const [key, value] of Object.entries(lenses)) {
        iterations.push({
          date,
          metric,
          sql,
          lens: { name: key, sql: value },
          devRankFilter: constants.devRankFilter
        })
      }
    })
  })
}

iterations.forEach((params, i) => {
  operate(
    params.metric.id + '_' + params.sql.type + '_' + params.lens.name + '_' + params.date)
    .tags(['crawl_complete', 'reports'])
    .queries(ctx => `
CREATE TABLE IF NOT EXISTS reports.${params.sql.type} (
  date DATE,
  lens STRING,
  metric STRING,
  client STRING,
  data JSON
)
PARTITION BY date
CLUSTER BY metric, lens, client;

DELETE FROM reports.${params.sql.type}
WHERE date = '${params.date}'
AND metric = '${params.metric.id}';

INSERT INTO reports.${params.sql.type} ${params.sql.query(ctx, params)};

SELECT
reports.run_export_job(
  JSON '''{
    "destination": "cloud_storage",
    "config": {
      "bucket": "${bucket}",
      "name": "${generateExportPath(ctx, params)}"
    },
    "query": "${generateExportQuery(ctx, params)}"
  }'''
);
  `)
})
