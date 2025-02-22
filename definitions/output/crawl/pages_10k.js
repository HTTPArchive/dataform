publish('pages_10k', {
  type: 'table',
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank']
  },
  tags: ['crawl_complete']
}).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl', 'pages')}
WHERE date = '${constants.currentMonth}' AND
    rank <= 10000
`)
