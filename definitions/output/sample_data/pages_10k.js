publish("pages_10k", {
    type: "table",
    schema: "sample_data",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "rank"]
    },
    tags: ["crawl_results_all"]
}).preOps(ctx => `
DROP TABLE ${ctx.self()};
`).query(ctx => `
SELECT *
FROM ${ctx.ref("all", "pages")}
WHERE date = "${constants.current_month}" AND
    rank <= 10000
`);
