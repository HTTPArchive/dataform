const
    date = dataform.projectConfig.vars.date.substring(0, 10),
    date_underscored = date.replaceAll("-", "_"),
    clients = ['mobile', 'desktop'],
    booleans = ['TRUE', 'FALSE'];

module.exports = {
    date,
    date_underscored,
    clients,
    booleans
};
