publish('parsed_css', {
  type: 'incremental',
  protected: true,
  schema: 'all',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page'],
    requirePartitionFilter: true
  },
  tags: ['crawl_results_legacy']
}).preOps(ctx => `
DROP SNAPSHOT TABLE IF EXISTS ${ctx.self()};

CREATE SNAPSHOT TABLE ${ctx.self()}
CLONE ${ctx.resolve('crawl', 'parsed_css')};
`)
