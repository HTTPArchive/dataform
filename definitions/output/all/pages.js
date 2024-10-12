publish('pages', {
  type: 'incremental',
  protected: true,
  schema: 'all',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank'],
    requirePartitionFilter: true
  },
  tags: ['crawl_results_all'],
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}';
`).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop'
  AND is_root_page = TRUE
  ${constants.devRankFilter}
`).postOps(ctx => `
INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop'
  AND is_root_page = FALSE
  ${constants.devRankFilter};

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref('crawl_staging', 'pages')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile'
  AND is_root_page = TRUE
  ${constants.devRankFilter};

INSERT INTO ${ctx.self()}
SELECT *
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile'
  AND is_root_page = FALSE
  ${constants.devRankFilter};
`)
