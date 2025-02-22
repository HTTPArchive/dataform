const configs = new reports.HTTPArchiveReports()
const metrics = configs.listMetrics()

// Adjust start and end dates to update reports retrospectively
const startDate = '2024-12-01' // constants.currentMonth;
const endDate = '2024-12-01' // constants.currentMonth;

const lenses = {
  all: '',
  top1k: 'AND rank <= 1000',
  top10k: 'AND rank <= 10000',
  top100k: 'AND rank <= 100000',
  top1m: 'AND rank <= 1000000',
  drupal: 'AND \'Drupal\' IN UNNEST(technologies.technology)',
  magento: 'AND \'Magento\' IN UNNEST(technologies.technology)',
  wordpress: 'AND \'WordPress\' IN UNNEST(technologies.technology)'
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
CLUSTER BY client, lens;

DELETE FROM reports.${params.sql.type}
WHERE date = '${params.date}';

/* {"dataform_trigger": "report_complete", "date": "${params.date}", "name": "${params.metric.id}", "type": "${params.sql.type}", "lense": "${params.lens.name}"} */
INSERT INTO reports.${params.sql.type}` +
params.sql.query(ctx, params)
    )
})
