const pastMonthYYYYMMDD = constants.fnPastMonth(constants.currentMonth).substring(0, 7).replace('-', '')
const pastMonthYYYYMM = pastMonthYYYYMMDD.substring(0, 6)

declare({
  database: 'chrome-ux-report',
  schema: 'materialized',
  name: 'country_summary',
  dependencies: ['country_summary_not_empty']
})

assert('country_summary_not_empty').query(ctx => `
SELECT
  'No data for the specified date' AS error_message
FROM chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS
WHERE table_name = 'country_summary'
  AND partition_id = ${pastMonthYYYYMM}
  AND total_rows < 20000000
`)

declare({
  database: 'chrome-ux-report',
  schema: 'materialized',
  name: 'device_summary',
  dependencies: ['device_summary_not_empty']
})

assert('device_summary_not_empty').query(ctx => `
SELECT
  'No data for the specified date' AS error_message
FROM chrome-ux-report.materialized.INFORMATION_SCHEMA.PARTITIONS
WHERE table_name = 'device_summary'
  AND partition_id = ${pastMonthYYYYMMDD}
  AND total_rows < 20000000
`)

declare({
  database: 'chrome-ux-report',
  schema: 'experimental',
  name: 'global'
})
