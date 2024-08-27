publish("parsed_css", {
    type: "table",
    schema: "all",
    tags: ["after_crawl_all"],
}).preOps(
    ctx => `
DELETE FROM
  ${ctx.self()}
WHERE
  date = '${constants.current_month}';
`).query(
    ctx => `
SELECT NULL AS no_rows LIMIT 0
`).postOps(
    ctx => `
INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "parsed_css")}
WHERE date = '${constants.current_month}' AND client = 'desktop';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "parsed_css")}
WHERE date = '${constants.current_month}' AND client = 'mobile'
`)
