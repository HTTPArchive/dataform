const two_months_ago = constants.fn_past_month(constants.fn_past_month(constants.current_month));

operate("test_env", {
  hasOutput: true,
  disabled: true // MUST NOT be commented in main branch
}).queries(ctx => `
CREATE OR REPLACE TABLE ${ctx.ref("all", "pages")} AS
SELECT *
FROM httparchive.all.pages ${constants.dev_TABLESAMPLE}
WHERE date = '${two_months_ago}';

CREATE OR REPLACE TABLE ${ctx.ref("all", "requests")} AS
SELECT *
FROM httparchive.all.requests ${constants.dev_TABLESAMPLE}
WHERE date = '${two_months_ago}';

CREATE OR REPLACE TABLE ${ctx.ref("all", "parsed_css")} AS
SELECT *
FROM httparchive.all.parsed_css ${constants.dev_TABLESAMPLE}
WHERE date = '${two_months_ago}';

CREATE OR REPLACE TABLE ${ctx.ref("core_web_vitals", "technologies")} AS
SELECT *
FROM httparchive.core_web_vitals.technologies
WHERE date = '${two_months_ago}'
`)
