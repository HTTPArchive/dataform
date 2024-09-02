const month = constants.current_month;

publish("requests_stable", {
    type: "incremental",
    protected: true,
    schema: "all",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "type", "rank"],
        requirePartitionFilter: true
    },
    tags: ["all_stable"],
}).preOps(ctx => `
CREATE IF NOT EXISTS TABLE ${ctx.self()}
PARTITION BY date
CLUSTER BY client, is_root_page, type,rank
AS SELECT
  * EXCEPT (custom_metrics),
  GET_CUSTOM_METRICS(custom_metrics) AS custom_metrics
FROM ${ctx.ref("all", "requests")}
WHERE
  date = '${month}'
`).query(ctx => `

`)

while (month == '2024-07-01') {
  operate("all_stable_requests", {
    hasOutput: true,
    disabled: true
  }).tags(
    ["all_stable_requests"]
  ).queries(ctx => `
INSERT INTO ${ctx.self()}
AS
SELECT
  t0.date,
  t0.client,
  t0.page,
  t0.is_root_page,
  t0.root_page,
  t1.rank,
  t0.url,
  t0.is_main_document,
  t0.type,
  t0.index,
  t0.payload,
  t0.summary,
  t0.request_headers,
  t0.response_headers
FROM (
  SELECT *
  FROM ${ctx.ref("all", "requests")}
  WHERE date = '${month}'
    AND client = 'mobile') AS t0
LEFT JOIN (
  SELECT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.ref("chrome-ux-report", "experimental", "global")}
  WHERE yyyymm = 202407
) AS t1
ON t0.root_page = t1.page
  `)

  month = constants.fn_past_month(month);
}
