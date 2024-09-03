let month = '2024-08-01',
    month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6);

publish("requests_stable", {
    type: "incremental",
    schema: "all",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "type", "rank"],
        requirePartitionFilter: true,
    },
    columns: {
      date: "YYYY-MM-DD format of the HTTP Archive monthly crawl",
      client: "Test environment: desktop or mobile",
      page: "The URL of the page being tested",
      is_root_page: "Whether the page is the root of the origin.",
      root_page: "The URL of the root page being tested",
      rank: "Site popularity rank, from CrUX",
      url: "The URL of the request",
      is_main_document: "Whether this request corresponds with the main HTML document of the page, which is the first HTML request after redirects",
      type: "Simplified description of the type of resource (script, html, css, text, other, etc)",
      index: "The sequential 0-based index of the request",
      payload: "JSON-encoded WebPageTest result data for this request",
      summary: "JSON-encoded summarization of request data",
      request_headers: {
        description: "Request headers",
        columns: {
          name: "Request header name",
          value: "Request header value",
        },
      },
      response_headers: {
        description: "Response headers",
        columns: {
          name: "Response header name",
          value: "Response header value",
        },
      },
      response_body: "Text-based response body",
    },
    tags: ["requests_stable"],
}).preOps(ctx => `
CREATE TABLE IF NOT EXISTS ${ctx.self()}
(
  date DATE NOT NULL OPTIONS(description="YYYY-MM-DD format of the HTTP Archive monthly crawl"),
  client STRING NOT NULL OPTIONS(description="Test environment: desktop or mobile"),
  page STRING NOT NULL OPTIONS(description="The URL of the page being tested"),
  is_root_page BOOL OPTIONS(description="Whether the page is the root of the origin."),
  root_page STRING NOT NULL OPTIONS(description="The URL of the root page being tested"),
  rank INT64 OPTIONS(description="Site popularity rank, from CrUX"),
  url STRING NOT NULL OPTIONS(description="The URL of the request"),
  is_main_document BOOL NOT NULL OPTIONS(description="Whether this request corresponds with the main HTML document of the page, which is the first HTML request after redirects"),
  type STRING OPTIONS(description="Simplified description of the type of resource (script, html, css, text, other, etc)"),
  index INT64 OPTIONS(description="The sequential 0-based index of the request"),
  payload STRING OPTIONS(description="JSON-encoded WebPageTest result data for this request"),
  summary STRING OPTIONS(description="JSON-encoded summarization of request data"),
  request_headers ARRAY<STRUCT<name STRING OPTIONS(description="Request header name"), value STRING OPTIONS(description="Request header value")>> OPTIONS(description="Request headers"),
  response_headers ARRAY<STRUCT<name STRING OPTIONS(description="Response header name"), value STRING OPTIONS(description="Response header value")>> OPTIONS(description="Response headers"),
  response_body STRING OPTIONS(description="Text-based response body")
)
PARTITION BY date
CLUSTER BY client, is_root_page, type, rank
OPTIONS(
  require_partition_filter=true
);
    `).query(ctx => `
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
  FROM ${ctx.ref("all", "requests")} TABLESAMPLE SYSTEM (0.01 PERCENT)
  WHERE date = '${month}') AS t0
LEFT JOIN (
  SELECT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.ref("chrome-ux-report", "experimental", "global")}
  WHERE yyyymm = ${month_YYYYMM}
) AS t1
ON t0.root_page = t1.page
`)

month = constants.fn_past_month(month)
month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6)

while (month >= '2022-07-01') {
  operate(`all_stable_requests ${month}`, {
    hasOutput: true
  }).tags(
    ["requests_stable"]
  ).queries(ctx => `
INSERT INTO ${ctx.ref("all", "requests_stable")}
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
  WHERE yyyymm = ${month_YYYYMM}
) AS t1
ON t0.root_page = t1.page
  `)

  month = constants.fn_past_month(month)
  month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6)
}
