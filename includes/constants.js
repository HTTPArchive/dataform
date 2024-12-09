const today = (dataform.projectConfig.vars.today ? dataform.projectConfig.vars.today : new Date().toISOString()).substring(0, 10)
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
const [
  devTABLESAMPLE,
  devRankFilter
] = dataform.projectConfig.vars.env_name === 'dev'
  ? [
      'TABLESAMPLE SYSTEM (0.001 PERCENT)',
      'AND rank <= 10000'
    ]
  : ['', '']
function fillTemplate (template, params) {
  return template.replace(/{{(.*?)}}/g, (match, key) => {
    const trimmedKey = key.trim()
    return trimmedKey in params ? params[trimmedKey] : match
  })
}

module.exports = {
  today,
  currentMonth,
  fnPastMonth,
  fnDateUnderscored,
  clients,
  booleans,
  devTABLESAMPLE,
  devRankFilter,
  fillTemplate
}
