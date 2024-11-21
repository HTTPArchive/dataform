const database = 'chrome-ux-report'

const pastMonth = constants.fnPastMonth(constants.currentMonth)
const pastMonthYYYYMM = pastMonth.substring(0, 7).replace('-', '')

declare({
  database,
  schema: 'materialized',
  name: 'country_summary'
})

assert('country_summary_not_empty').query(ctx => `
FROM ${ctx.ref(database, 'materialized', 'country_summary')}
|> WHERE yyyymm = ${pastMonthYYYYMM}
|> AGGREGATE COUNT(DISTINCT country_code) AS cnt_countries
|> WHERE cnt_countries != 238
|> SELECT "Table data doesn't match 238 countries" AS error_message
`)

declare({
  database,
  schema: 'materialized',
  name: 'device_summary'
})

assert('device_summary_not_empty').query(ctx => `
FROM ${ctx.ref(database, 'materialized', 'device_summary')}
|> WHERE date = ''${pastMonth}''
|> AGGREGATE COUNT(DISTINCT device) AS cnt_devices, COUNT(DISTINCT rank) AS cnt_ranks
|> WHERE cnt_devices != 3 OR cnt_ranks != 10
|> SELECT "Table data doesn't match 3 unique devices and 10 ranks" AS error_message
`)

declare({
  database,
  schema: 'experimental',
  name: 'global'
})
