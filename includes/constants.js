const
    date = dataform.projectConfig.vars.date.substring(0, 10),
    date_underscored = date.replaceAll("-", "_"),
    clients = ['mobile', 'desktop'],
    booleans = ['TRUE', 'FALSE'],
    schemaSuffix = dataform.projectConfig.schemaSuffix ? "_" + dataform.projectConfig.schemaSuffix : "",
    tablePrefix = dataform.projectConfig.tablePrefix ? "_" + dataform.projectConfig.tablePrefix : "";

module.exports = {
    date,
    date_underscored,
    clients,
    booleans,
    schemaSuffix,
    tablePrefix
};
