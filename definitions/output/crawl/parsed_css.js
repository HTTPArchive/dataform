publish('parsed_css', {
  type: 'incremental',
  protected: true,
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page'],
    requirePartitionFilter: true
  },
  tags: ['crawl_complete']
}).preOps(ctx => `
SET @@RESERVATION='projects/httparchive/locations/US/reservations/enterprise';

DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop';
`).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl_staging', 'parsed_css')}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop'
  ${constants.devRankFilter}
`).postOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile';

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref('crawl_staging', 'parsed_css')}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile'
  ${constants.devRankFilter};
`)
