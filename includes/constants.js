let
    month_date = (dataform.projectConfig.vars.current_month ? dataform.projectConfig.vars.current_month : new Date().toISOString()).substring(0, 8) + "01",
    fn_date_underscored = (date_str) => date_str.replaceAll("-", "_"),
    fn_past_month = (month_ISOstring) => {
        let month_date = new Date(month_ISOstring);
        month_date.setMonth(month_date.getMonth() - 1)
        return month_date.toISOString().substring(0, 10);
    },
    [
        dev_TABLESAMPLE,
        dev_rank5000_filter
    ] = dataform.projectConfig.vars.env_name == "dev" ? [
        "TABLESAMPLE SYSTEM (0.001 PERCENT)",
        "AND rank = 5000"
    ] : ["", ""];

const
    current_month = month_date,
    current_month_underscored = fn_date_underscored(current_month),
    past_month = fn_past_month(month_date),
    past_month_underscored = fn_date_underscored(past_month),
    clients = ['mobile', 'desktop'],
    booleans = ['TRUE', 'FALSE'];

module.exports = {
    current_month,
    current_month_underscored,
    past_month,
    past_month_underscored,
    clients,
    booleans,
    dev_TABLESAMPLE,
    dev_rank5000_filter
};
