const database = 'chrome-ux-report'

const pastMonth = constants.fnPastMonth(constants.currentMonth)
const pastMonthYYYYMM = pastMonth.substring(0, 7).replace('-', '')

declare({
  database,
  schema: 'materialized',
  name: 'country_summary'
})

assert('country_summary_not_empty').query(ctx => `
SELECT
  'No data for the specified date' AS error_message
FROM ${ctx.ref(database, 'materialized', 'country_summary')}
WHERE yyyymm = ${pastMonthYYYYMM}
GROUP BY yyyymm
HAVING COUNT(0) < 20000000
`)

declare({
  database,
  schema: 'materialized',
  name: 'device_summary'
})

assert('device_summary_not_empty').query(ctx => `
SELECT
  'No data for the specified date' AS error_message
FROM ${ctx.ref(database, 'materialized', 'device_summary')}
WHERE date = '${pastMonth}'
GROUP BY date
HAVING COUNT(0) < 20000000
`)

declare({
  database,
  schema: 'experimental',
  name: 'global'
})
