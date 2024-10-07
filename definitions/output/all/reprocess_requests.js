operate(`all_requests_stable_pre`).tags(
  ["all_requests_stable"]
).queries(`
CREATE SCHEMA IF NOT EXISTS all_dev;

DROP TABLE IF EXISTS \`all_dev.requests_stable\`;

CREATE TABLE \`all_dev.requests_stable\`
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
  payload JSON OPTIONS(description="JSON-encoded WebPageTest result data for this request"),
  summary JSON OPTIONS(description="JSON-encoded summarization of request data"),
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
`);

const iterations = [];
const clients = constants.clients;

for (
  let month = constants.current_month;
  month >= '2024-09-01'; // 2022-07-01
  month = constants.fn_past_month(month)) {
    clients.forEach((client) => {
      iterations.push({
        month: month,
        client: client
        })
    })
}

iterations.forEach((iteration, i) => {
  operate(`all_requests_stable ${iteration.month} ${iteration.client}`).tags(
    ["all_requests_stable"]
  ).dependencies([
    i===0 ? "all_requests_stable_pre" : `all_requests_stable ${iterations[i-1].month} ${iterations[i-1].client}`
  ]).queries(ctx => `
INSERT INTO \`all_dev.requests_stable\`
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
  JSON_REMOVE(
    SAFE.PARSE_JSON(payload, wide_number_mode => 'round'),
    '$._headers'
  ) AS payload,
  JSON_REMOVE(
    SAFE.PARSE_JSON(requests.summary, wide_number_mode => 'round'),  
    '$.firstHtml',
    '$.firstReq',
    '$.req_accept_encoding',
    '$.req_accept_language',
    '$.req_accept',
    '$.req_if_modified_since',
    '$.req_if_none_match',
    '$.req_referer',
    '$.req_user_agent',
    '$.reqOtherHeaders',
    '$.requestid',
    '$.resp_age',
    '$.resp_cache_control',
    '$.resp_content_length',
    '$.resp_content_type',
    '$.resp_date',
    '$.resp_etag',
    '$.resp_last_modified',
    '$.resp_server',
    '$.resp_vary',
    '$.respOtherHeaders',
    '$.startedDateTime',
    '$.url',
    '$.urlShort'
  ) as summary,
  requests.request_headers,
  requests.response_headers,
  requests.response_body
FROM (
  SELECT *
  FROM \`all.requests\` ${constants.dev_TABLESAMPLE}
  WHERE date = '${iteration.month}'
    AND client = '${iteration.client}') AS requests
LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve("chrome-ux-report", "experimental", "global")}
  WHERE yyyymm = ${constants.fn_past_month(iteration.month).substring(0, 7).replace('-', '')}
) AS crux
ON requests.root_page = crux.page;
  `)
});
