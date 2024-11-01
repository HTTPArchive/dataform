publish('requests_10k', {
  type: 'table',
  schema: 'sample_data',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'is_main_document', 'type']
  },
  tags: ['crawl_complete']
}).preOps(ctx => `
DROP TABLE IF EXISTS ${ctx.self()};
`).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl', 'requests')}
WHERE date = '${constants.currentMonth}' AND
    rank <= 10000
`)
