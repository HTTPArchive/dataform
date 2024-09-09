publish("requests_10k", {
    type: "table",
    schema: "sample_data",
        bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "is_main_document", "type"],
        requirePartitionFilter: true
    },
    tags: ["crawl_results_all"]
}).query(ctx => `
SELECT
    *
FROM ${ctx.ref("all", "requests")}
WHERE date = ${constants.current_month} AND
    -- rank <= 10000 -- TODO: use rank filtering when https://github.com/HTTPArchive/dataform/pull/5 is complete
    page IN (SELECT page FROM ${ctx.ref("sample_data", "pages_10k")}
`);
