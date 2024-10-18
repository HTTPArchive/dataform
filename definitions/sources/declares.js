// HTTP Archive crawl staging tables
const stagingTables = ['pages', 'requests', 'parsed_css']
for (const table of stagingTables) {
  declare({
    schema: 'crawl_staging',
    name: table
  })
}

// CrUX tables
const cruxTables = ['country_summary', 'device_summary']
const pastMonth = constants.fnPastMonth(constants.currentMonth).substring(0, 7).replace('-', '')
for (const table of cruxTables) {
  declare({
    database: 'chrome-ux-report',
    schema: 'materialized',
    name: table
  })

  assert(`${table}_not_empty`).query(ctx => `
SELECT
  'No data for the specified date' AS error_message
FROM ${ctx.ref('chrome-ux-report', 'materialized', table)}
WHERE yyyymm = ${pastMonth}
GROUP BY yyyymm
HAVING COUNT(1) = 0
  `)
}

declare({
  database: 'chrome-ux-report',
  schema: 'experimental',
  name: 'global'
})
