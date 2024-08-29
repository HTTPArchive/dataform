publish("pages", {
    type: "incremental",
    protected: true,
    schema: "all",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "rank"],
        requirePartitionFilter: true
    },
    tags: ["after_crawl_all"],
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.current_month}';
`).query(ctx => `
SELECT *
FROM ${ctx.ref("crawl_staging", "pages")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = TRUE
`).postOps(ctx => `
INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "pages")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = FALSE;

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "pages")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = TRUE;

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "pages")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = FALSE
`)
