const columns = descriptions.columns.pages;

publish('pages_10k', {
  type: 'table',
  schema: 'sample_data',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page']
  },
  columns: columns,
  tags: ['crawl_complete']
}).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl', 'pages')}
WHERE
  date = '${constants.currentMonth}' AND
  rank <= 10000
`)
