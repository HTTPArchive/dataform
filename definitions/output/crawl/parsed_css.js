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
SET @@RESERVATION='${constants.reservation_id}';

DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}'
  AND client = 'desktop';
`).query(ctx => `
SELECT
  * EXCEPT(css),
  SAFE.PARSE_JSON(css, wide_number_mode=>'round') AS css,
  NULL AS css_backup
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
  * EXCEPT(css),
  SAFE.PARSE_JSON(css, wide_number_mode=>'round') AS css,
  NULL AS css_backup
FROM ${ctx.ref('crawl_staging', 'parsed_css')}
WHERE date = '${constants.currentMonth}'
  AND client = 'mobile'
  ${constants.devRankFilter};
`)
