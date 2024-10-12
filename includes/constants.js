const
  today = (dataform.projectConfig.vars.today ? dataform.projectConfig.vars.today : new Date().toISOString()).substring(0, 10),
  currentMonth = today.substring(0, 8) + "01",
  fnDateUnderscored = (date_str) => date_str.replaceAll("-", "_"),
  fnPastMonth = (month_ISOstring) => {
    let month_date = new Date(month_ISOstring);
    month_date.setMonth(month_date.getMonth() - 1)
    return month_date.toISOString().substring(0, 10);
  },
  clients = ['mobile', 'desktop'],
  booleans = ['TRUE', 'FALSE'],
  [
    devTABLESAMPLE,
    devRankFilter
  ] = dataform.projectConfig.vars.env_name == 'dev' ? [
    "TABLESAMPLE SYSTEM (0.001 PERCENT)",
    "AND rank <= 10000",
    true
  ] : ["", ""]

module.exports = {
  today,
  currentMonth,
  fnPastMonth,
  fnDateUnderscored,
  clients,
  booleans,
  devTABLESAMPLE,
  devRankFilter
};
