publish('parsed_css', {
  type: 'incremental',
  protected: true,
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page'],
    requirePartitionFilter: true
  },
  columns: {
    date: 'YYYY-MM-DD format of the HTTP Archive monthly crawl',
    client: 'Test environment: desktop or mobile',
    page: 'The URL of the page being tested',
    is_root_page: 'Whether the page is the root of the origin.',
    root_page: 'The URL of the root page being tested',
    rank: 'Site popularity rank, from CrUX',
    url: 'The URL of the request',
    css: 'The parsed CSS, in JSON format'
  },
  tags: ['crawl_complete']
}).preOps(ctx => `
${reservations.reservation_setter(ctx)}

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
