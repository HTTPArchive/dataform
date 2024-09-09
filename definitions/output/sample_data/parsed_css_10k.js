publish("parsed_css_10k", {
    type: "table",
    schema: "sample_data",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "rank", "page"],
        requirePartitionFilter: true
    },
    tags: ["crawl_results_all"]
}).query(ctx => `
SELECT
    *
FROM ${ctx.ref("all", "parsed_css")}
WHERE date = ${constants.current_month} AND
    rank <= 10000
`);
