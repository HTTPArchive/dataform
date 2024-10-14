const today = (dataform.projectConfig.vars.today ? dataform.projectConfig.vars.today : new Date().toISOString()).substring(0, 10)
const currentMonth = today.substring(0, 8) + '01'
const fnDateUnderscored = (dateStr) => dateStr.replaceAll('-', '_')
const fnPastMonth = (monthISOstring) => {
  const monthDate = new Date(monthISOstring)
  monthDate.setMonth(monthDate.getMonth() - 1)
  return monthDate.toISOString().substring(0, 10)
}
const clients = ['desktop', 'mobile']
const booleans = ['FALSE', 'TRUE']
const [
  devTABLESAMPLE,
  devRankFilter
] = dataform.projectConfig.vars.env_name === 'dev'
  ? [
      'TABLESAMPLE SYSTEM (0.001 PERCENT)',
      'AND rank <= 10000'
    ]
  : ['', '']

module.exports = {
  today,
  currentMonth,
  fnPastMonth,
  fnDateUnderscored,
  clients,
  booleans,
  devTABLESAMPLE,
  devRankFilter
}
