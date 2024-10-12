const staging_tables = ['pages', 'requests', 'parsed_css']
for (const table of staging_tables) {
  declare({
    schema: 'crawl_staging',
    name: table
  })
}

const crux_tables = ['country_summary', 'device_summary']
const past_month = constants.fnPastMonth(constants.currentMonth).substring(0, 7).replace('-', '')
for (const table of crux_tables) {
  declare({
    database: 'chrome-ux-report',
    schema: 'materialized',
    name: table
  })

  assert(`${table}_not_empty`).query(ctx => `
SELECT
  'No data for the specified date' AS error_message
FROM ${ctx.ref('chrome-ux-report', 'materialized', table)}
WHERE yyyymm = ${past_month}
GROUP BY yyyymm
HAVING COUNT(1) = 0
  `)
}

declare({
  database: 'chrome-ux-report',
  schema: 'experimental',
  name: 'global'
})
