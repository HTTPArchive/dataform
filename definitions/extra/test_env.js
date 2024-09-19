const past_month = constants.fn_past_month(constants.current_month);

operate("test_env", {
  hasOutput: true,
  disabled: true // MUST be disabled in main branch
}).queries(ctx => `
CREATE SCHEMA IF NOT EXISTS all_dev;

CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "pages")} AS
SELECT *
FROM httparchive.all.pages
WHERE
  date = '${constants.current_month}'
  ${constants.dev_rank5000_filter};

CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "requests")} AS
SELECT *
FROM httparchive.all.requests ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}';

CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "parsed_css")} AS
SELECT *
FROM httparchive.all.parsed_css
WHERE date = '${constants.current_month}'
  ${constants.dev_rank5000_filter};

CREATE SCHEMA IF NOT EXISTS core_web_vitals_dev;

CREATE TABLE IF NOT EXISTS ${ctx.resolve("core_web_vitals", "technologies")} AS
SELECT *
FROM httparchive.core_web_vitals.technologies ${constants.dev_TABLESAMPLE}
WHERE date = '${past_month}';

CREATE SCHEMA IF NOT EXISTS blink_features_dev;

CREATE TABLE IF NOT EXISTS ${ctx.resolve("blink_features", "usage")} AS
SELECT *
FROM httparchive.blink_features.usage ${constants.dev_TABLESAMPLE}
WHERE yyyymmdd = '${past_month}';

CREATE TABLE IF NOT EXISTS ${ctx.resolve("blink_features", "features")} AS
SELECT *
FROM httparchive.blink_features.features ${constants.dev_TABLESAMPLE}
WHERE yyyymmdd = DATE '${past_month}';
`)
