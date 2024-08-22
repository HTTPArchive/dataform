const
    date = dataform.projectConfig.vars.date.substring(0, 10),
    date_underscored = date.replace("-", "_");

module.exports = {
    date,
    date_underscored
};
