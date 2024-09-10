const date = constants.fn_past_month(constants.current_month);

operate("test_tables", {
  hasOutput: true,
  disabled: !constants.is_dev_env // enabled when workflow variable env_name = "dev"
}).queries(ctx => `
CREATE SCHEMA IF NOT EXISTS all_dev;

CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "pages")} AS
SELECT *
FROM httparchive.all.pages ${constants.dev_TABLESAMPLE}
WHERE date = '${date}';

CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "requests")} AS
SELECT *
FROM httparchive.all.requests ${constants.dev_TABLESAMPLE}
WHERE date = '${date}'

/*
CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "parsed_css")} AS
SELECT *
FROM httparchive.all.parsed_css ${constants.dev_TABLESAMPLE}
WHERE date = '${date}';

CREATE TABLE IF NOT EXISTS ${ctx.resolve("core_web_vitals", "technologies")} AS
SELECT *
FROM httparchive.core_web_vitals.technologies
WHERE date = '${date}'
*/
`);
