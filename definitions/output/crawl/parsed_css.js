const columns = descriptions.columns.parsed_css

publish('parsed_css', {
  type: 'incremental',
  protected: true,
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page'],
    requirePartitionFilter: true
  },
  columns: columns,
  tags: ['crawl_complete']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop';
`).query(ctx => `
SELECT
  *
FROM ${ctx.ref('crawl_staging', 'parsed_css')}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop'
  ${constants.devRankFilter}
`).postOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile';

INSERT INTO ${ctx.self()}
SELECT
  *
FROM ${ctx.ref('crawl_staging', 'parsed_css')}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile'
  ${constants.devRankFilter};
`)
