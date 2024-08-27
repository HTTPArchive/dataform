publish("parsed_css", {
    type: "incremental",
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
SELECT *
FROM ${ctx.ref("crawl_staging", "parsed_css")}
WHERE date = '${constants.current_month}' AND client = 'desktop'
`).postOps(
    ctx => `
INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "parsed_css")}
WHERE date = '${constants.current_month}' AND client = 'mobile'
`)
