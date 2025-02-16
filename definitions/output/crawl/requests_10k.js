publish('requests_10k', {
  type: 'table',
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'is_main_document', 'type']
  },
  tags: ['crawl_complete']
}).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl', 'requests')}
WHERE date = '${constants.currentMonth}' AND
    rank <= 10000
`)
