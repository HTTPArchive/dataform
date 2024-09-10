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
      index: "The sequential 1-based index of the request",
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
  request_headers ARRAY<STRUCT<
    name STRING OPTIONS(description="Request header name"),
    value STRING OPTIONS(description="Request header value")
    >> OPTIONS(description="Request headers"),
  response_headers ARRAY<STRUCT<
    name STRING OPTIONS(description="Response header name"),
    value STRING OPTIONS(description="Response header value")
    >> OPTIONS(description="Response headers"),
  response_body STRING OPTIONS(description="Text-based response body")
)
PARTITION BY date
CLUSTER BY client, is_root_page, type, rank
OPTIONS(
  require_partition_filter=true
);

CREATE TEMP FUNCTION PRUNE_OBJECT(
  json_str STRING,
  keys_to_remove ARRAY<STRING>
) RETURNS STRING
LANGUAGE js AS """
  try {
    var jsonObject = JSON.parse(json_str);
    keys_to_remove.forEach(function(key) {
      delete jsonObject[key];
    });
    return JSON.stringify(jsonObject);
  } catch (e) {
    return json_str;
  }
""";
    `).query(ctx => `
SELECT
  requests.date,
  requests.client,
  requests.page,
  requests.is_root_page,
  requests.root_page,
  crux.rank,
  requests.url,
  requests.is_main_document,
  requests.type,
  requests.index,
  requests.payload,
  PRUNE_OBJECT(
      requests.summary,
      ["crawlid", "firstHtml", "firstReq", "pageid", "req_accept_encoding", "req_accept_language", "req_accept", "req_if_modified_since", "req_if_none_match", "req_referer", "req_user_agent", "reqOtherHeaders", "requestid", "resp_age", "resp_cache_control", "resp_content_length", "resp_content_type", "resp_date", "resp_etag", "resp_last_modified", "resp_server", "resp_vary", "respOtherHeaders", "startedDateTime", "url", "urlShort"]) as summary,
  requests.request_headers,
  requests.response_headers,
  requests.response_body
FROM (
  SELECT *
  FROM ${ctx.resolve("all", "requests")} ${constants.dev_TABLESAMPLE}
  WHERE date = '${month}') AS requests
LEFT JOIN (
  SELECT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve("chrome-ux-report", "experimental", "global")}
  WHERE yyyymm = ${month_YYYYMM}
) AS crux
ON requests.root_page = crux.page
`)

let monthRange = [];
for (
  let i = constants.fn_past_month(month);
  i >= '2024-05-01'; // TODO 2022-07-01
  i = constants.fn_past_month(i)) {
    monthRange.push(i)
}

monthRange.forEach((month, i) => {
  operate(`all_requests_stable ${month}`).tags(
    ["requests_stable"]
  ).dependencies([
    month === monthRange[0] ? "requests_stable" : `all_requests_stable ${monthRange[i-1]}`
  ]).queries(ctx => `
CREATE TEMP FUNCTION PRUNE_OBJECT(
  json_str STRING,
  keys_to_remove ARRAY<STRING>
) RETURNS STRING
LANGUAGE js AS """
  try {
    var jsonObject = JSON.parse(json_str);
    keys_to_remove.forEach(function(key) {
      delete jsonObject[key];
    });
    return JSON.stringify(jsonObject);
  } catch (e) {
    return json_str;
  }
""";

INSERT INTO ${ctx.resolve("all", "requests_stable")}
SELECT
  requests.date,
  requests.client,
  requests.page,
  requests.is_root_page,
  requests.root_page,
  crux.rank,
  requests.url,
  requests.is_main_document,
  requests.type,
  requests.index,
  requests.payload,
  PRUNE_OBJECT(
      requests.summary,
      ["requestid", "pageid", "crawlid", "startedDateTime", "url", "urlShort", "firstReq", "firstHtml", "reqOtherHeaders", "respOtherHeaders", "req_accept", "req_accept_encoding", "req_accept_language", "req_if_modified_since", "req_if_none_match", "req_referer", "req_user_agent", "resp_age", "resp_cache_control", "resp_date", "resp_etag", "resp_last_modified", "resp_server", "resp_vary", "resp_content_length", "resp_content_type"]) as summary,
  requests.request_headers,
  requests.response_headers,
  requests.response_body
FROM (
  SELECT *
  FROM ${ctx.resolve("all", "requests")} ${constants.dev_TABLESAMPLE}
  WHERE date = '${month}') AS requests
LEFT JOIN (
  SELECT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve("chrome-ux-report", "experimental", "global")}
  WHERE yyyymm = ${constants.fn_past_month(month).replace('-', '').substring(0, 6)}
) AS crux
ON requests.root_page = crux.page
  `)
});

operate(`all_requests_stable_alter_post`).tags(
  ['all_pages_stable']
).dependencies([
  `all_requests_stable ${monthRange[monthRange.length-1]}`
]).queries(ctx => `
DROP TABLE ${ctx.resolve("all", "requests")};

CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "requests")}
COPY ${ctx.resolve("all", "requests_stable")}
`);
