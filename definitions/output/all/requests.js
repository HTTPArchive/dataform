publish("requests", {
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
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = TRUE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = TRUE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL)
`)
