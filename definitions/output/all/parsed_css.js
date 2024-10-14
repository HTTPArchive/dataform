publish('parsed_css', {
  type: 'incremental',
  protected: true,
  schema: 'all',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page'],
    requirePartitionFilter: true
  },
  tags: ['crawl_results_all']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}';
`).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl_staging', 'parsed_css')}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop'
  ${constants.devRankFilter}
`).postOps(ctx => `
INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref('crawl_staging', 'parsed_css')}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile'
  ${constants.devRankFilter};
`)
