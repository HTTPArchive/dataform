const columns = descriptions.columns.requests

publish('requests_10k', {
  type: 'table',
  schema: 'sample_data',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'type']
  },
  columns: columns,
  tags: ['crawl_complete']
}).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl', 'requests')}
WHERE
  date = '${constants.currentMonth}' AND
  rank <= 10000
`)
