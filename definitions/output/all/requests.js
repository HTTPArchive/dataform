publish("requests", {
    type: "incremental",
    protected: true,
    schema: "all",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "is_main_document", "type"],
        requirePartitionFilter: true
    },
    tags: ["after_crawl_all"],
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.current_month}';
`).query(ctx => `
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = TRUE AND type = 'script'
`).postOps(ctx => `
INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = TRUE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL)
`)
