const
    today = (dataform.projectConfig.vars.today ? dataform.projectConfig.vars.today : new Date().toISOString()).substring(0, 10),
    current_month = today.substring(0, 8) + "01",
    fn_date_underscored = (date_str) => date_str.replaceAll("-", "_"),
    fn_past_month = (month_ISOstring) => {
        let month_date = new Date(month_ISOstring);
        month_date.setMonth(month_date.getMonth() - 1)
        return month_date.toISOString().substring(0, 10);
    },
    clients = ['mobile', 'desktop'],
    booleans = ['TRUE', 'FALSE'],
    [
        dev_TABLESAMPLE,
        dev_rank_filter,
        is_dev_env
    ] = dataform.projectConfig.vars.env_name == 'dev' ? [
        "TABLESAMPLE SYSTEM (0.001 PERCENT)",
        "AND rank = 5000",
        true
    ] : ["", "", false];

module.exports = {
    today,
    current_month,
    fn_past_month,
    fn_date_underscored,
    clients,
    booleans,
    dev_TABLESAMPLE,
    dev_rank_filter,
    is_dev_env
};
