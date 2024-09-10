operate(`all_requests_stable_pre`).tags(
  ["all_requests_stable"]
).queries(ctx => `
CREATE TABLE \`httparchive.all.requests_stable\`
LIKE httparchive.crawl_staging.requests;
`);


let monthRange = [];
for (
  let i = constants.current_month;
  i >= '2024-07-01'; // TODO 2022-07-01
  i = constants.fn_past_month(i)) {
    monthRange.push(i)
}

monthRange.forEach((month, i) => {
  operate(`all_requests_stable ${month}`).tags(
    ["all_requests_stable"]
  ).dependencies([
    month === monthRange[0] ? "all_requests_stable_pre" : `all_requests_stable ${monthRange[i-1]}`
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

INSERT INTO \`httparchive.all.requests_stable\`
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

operate(`all_requests_stable_post`).tags(
  ['all_requests_stable']
).dependencies([
  `all_requests_stable ${monthRange[monthRange.length-1]}`
]).queries(ctx => `
DROP TABLE ${ctx.resolve("all", "requests")};

CREATE TABLE IF NOT EXISTS ${ctx.resolve("all", "requests")}
COPY \`httparchive.all.requests_stable\`
`);
