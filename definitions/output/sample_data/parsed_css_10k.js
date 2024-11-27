publish('parsed_css_10k', {
  type: 'table',
  schema: 'sample_data',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page']
  },
  tags: ['crawl_complete']
}).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl', 'parsed_css')}
WHERE date = '${constants.currentMonth}' AND
    rank <= 10000
`)
