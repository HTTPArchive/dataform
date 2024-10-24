publish('requests_10k', {
  type: 'table',
  schema: 'sample_data',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'is_main_document', 'type']
  },
  tags: ['crawl_results_all']
}).preOps(ctx => `
DROP TABLE IF EXISTS ${ctx.self()};
`).query(ctx => `
SELECT *
FROM ${ctx.ref('all', 'requests')}
WHERE date = '${constants.currentMonth}' AND
    -- rank <= 10000 -- TODO: use rank filtering when https://github.com/HTTPArchive/dataform/pull/5 is complete
    page IN (
        SELECT page
        FROM ${ctx.ref('sample_data', 'pages_10k')}
    )
`)
