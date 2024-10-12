publish('requests', {
  type: 'incremental',
  protected: true,
  schema: 'all',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'is_main_document', 'type'],
    requirePartitionFilter: true
  },
  tags: ['crawl_results_all'],
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}';
`).query(ctx => `
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'desktop' AND is_root_page = TRUE AND type = 'script'
`).postOps(ctx => `
INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'desktop' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'desktop' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'desktop' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'mobile' AND is_root_page = TRUE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'mobile' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'mobile' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref('crawl_staging', 'requests')} ${constants.devTABLESAMPLE}
WHERE date = '${constants.currentMonth}' AND client = 'mobile' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL)
`)
