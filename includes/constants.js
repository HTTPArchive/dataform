const today = new Date().toISOString().substring(0, 10)
const currentMonth = today.substring(0, 8) + '01'
function fnDateUnderscored (dateStr) {
  return dateStr.replaceAll('-', '_')
}
function fnPastMonth (monthISOstring) {
  const monthDate = new Date(monthISOstring)
  monthDate.setMonth(monthDate.getMonth() - 1)
  return monthDate.toISOString().substring(0, 10)
}
const clients = ['desktop', 'mobile']
const booleans = ['FALSE', 'TRUE']
const environment = dataform.projectConfig.vars.environment
const [
  devTABLESAMPLE,
  devRankFilter
] = environment === 'dev'
  ? [
    'TABLESAMPLE SYSTEM (0.001 PERCENT)',
    'AND rank <= 10000'
  ]
  : ['', '']
const bucket = 'httparchive'
const storagePath = 'reports/'

module.exports = {
  today,
  currentMonth,
  fnPastMonth,
  fnDateUnderscored,
  clients,
  booleans,
  environment,
  devTABLESAMPLE,
  devRankFilter,
  bucket,
  storagePath
}
