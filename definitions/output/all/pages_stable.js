const month = constants.current_month;

publish("pages_stable", {
  type: "incremental",
  protected: true,
  schema: "all",
  bigquery: {
      partitionBy: "date",
      clusterBy: ["client", "is_root_page", "rank"],
      requirePartitionFilter: true
  },
  tags: ["all_stable"],
}).preOps(ctx => `
CREATE TEMP FUNCTION GET_CUSTOM_METRICS(custom_metrics STRING)
RETURNS STRUCT<performance STRING, other STRING> LANGUAGE js AS '''
  const topLevelMetrics = new Set([
    'performance'
  ]);
  try {
    custom_metrics = JSON.parse(custom_metrics);
  } catch {
    return {};
  }

  if (!custom_metrics) {
    return {};
  }

  const performance = JSON.stringify(custom_metrics.performance);
  delete custom_metrics.performance;

  const other = JSON.stringify(custom_metrics);

  return {
    performance,
    other
  }
''';

CREATE IF NOT EXISTS TABLE ${ctx.self()}
PARTITION BY date
CLUSTER BY client, is_root_page, rank
AS SELECT
  * EXCEPT (custom_metrics),
  GET_CUSTOM_METRICS(custom_metrics) AS custom_metrics
FROM ${ctx.ref("all", "pages")}
WHERE
  date = '${month}'
`).query(ctx => `
SELECT
* EXCEPT (custom_metrics),
GET_CUSTOM_METRICS(custom_metrics) AS custom_metrics
FROM ${ctx.ref("all", "pages")}
WHERE
date = '${month}'
`)

while (month == '2024-07-01') {
  operate("all_stable_pages", {
    hasOutput: true,
    disabled: true
  }).tags(
    ["all_stable_pages"]
  ).queries(ctx => `
CREATE TEMP FUNCTION GET_CUSTOM_METRICS(custom_metrics STRING)
RETURNS STRUCT<performance STRING, other STRING> LANGUAGE js AS '''
const topLevelMetrics = new Set([
  'performance'
]);
try {
  custom_metrics = JSON.parse(custom_metrics);
} catch {
  return {};
}

if (!custom_metrics) {
  return {};
}

const performance = JSON.stringify(custom_metrics.performance);
delete custom_metrics.performance;

const other = JSON.stringify(custom_metrics);

return {
  performance,
  other
}
''';

INSERT INTO ${ctx.self()}
SELECT
* EXCEPT (custom_metrics),
GET_CUSTOM_METRICS(custom_metrics) AS custom_metrics
FROM ${ctx.ref("all", "pages")}
WHERE
date = '${month}'
  `)

  month = constants.fn_past_month(month);
}
