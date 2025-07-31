const configs = new reports.HTTPArchiveReports()
const metrics = configs.listMetrics()
const lenses = configs.lenses

const bucket = constants.bucket
const storagePath = constants.storagePath
const dataset = 'reports'

// Adjust start and end dates to update reports retrospectively
const startDate = constants.currentMonth; // '2025-07-01'
const endDate = constants.currentMonth; // '2025-07-01'

function generateExportPath (params) {
  objectName = storagePath
  if (params.sql.type === 'histogram') {
    objectName = objectName + params.date.replaceAll('-', '_') + '/' + params.metric.id
  } else if (params.sql.type === 'timeseries') {
    objectName = objectName + params.metric.id
  } else {
    throw new Error('Unknown SQL type')
  }
  return objectName + '_test.json' // TODO: remove test suffix from the path
}

function generateExportQuery (params) {
  let query = ''
  if (params.sql.type === 'histogram') {
    query = `
SELECT
  * EXCEPT(date, metric, lens)
FROM \`${dataset}.${params.tableName}\`
WHERE date = '${params.date}'
  AND metric = '${params.metric.id}'
  AND lens = '${params.lens.name}'
ORDER BY bin ASC
`
  } else if (params.sql.type === 'timeseries') {
    query = `
SELECT
  FORMAT_DATE('%Y_%m_%d', date) AS date,
  * EXCEPT(date, metric, lens)
FROM \`${dataset}.${params.tableName}\`
WHERE metric = '${params.metric.id}'
  AND lens = '${params.lens.name}'
ORDER BY date DESC
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
          devRankFilter: constants.devRankFilter,
          tableName: metric.id + '_' + sql.type
        })
      }
    })
  })
}

iterations.forEach((params, i) => {
  operate(params.tableName + '_' + params.date + '_' + params.lens.name)
    .tags(['crawl_complete', 'reports'])
    .queries(ctx => `
DECLARE job_config JSON;

/* First report run
CREATE TABLE IF NOT EXISTS ${dataset}.${params.tableName}
PARTITION BY date
CLUSTER BY metric, lens, client
AS
*/

--/* Subsequent report run
DELETE FROM ${dataset}.${params.tableName}
WHERE date = '${params.date}'
  AND metric = '${params.metric.id}'
  AND lens = '${params.lens.name}';
INSERT INTO ${dataset}.${params.tableName}
--*/

SELECT
  '${params.metric.id}' AS metric,
  '${params.lens.name}' AS lens,
  *
FROM (
  ${params.sql.query(ctx, params)}
);

SET job_config = TO_JSON(
  STRUCT(
    "cloud_storage" AS destination,
    STRUCT(
      "httparchive" AS bucket,
      "${generateExportPath(params)}" AS name
    ) AS config,
    r"${generateExportQuery(params)}" AS query
  )
);

SELECT reports.run_export_job(job_config);
    `)
})
