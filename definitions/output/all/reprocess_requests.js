operate('all_requests_stable_pre').tags(
  ['all_requests_stable']
).queries(`
CREATE SCHEMA IF NOT EXISTS all_dev;

CREATE TABLE IF NOT EXISTS \`all_dev.requests_stable\`
(
  date DATE NOT NULL OPTIONS(description='YYYY-MM-DD format of the HTTP Archive monthly crawl'),
  client STRING NOT NULL OPTIONS(description='Test environment: desktop or mobile'),
  page STRING NOT NULL OPTIONS(description='The URL of the page being tested'),
  is_root_page BOOL OPTIONS(description='Whether the page is the root of the origin.'),
  root_page STRING NOT NULL OPTIONS(description='The URL of the root page being tested'),
  rank INT64 OPTIONS(description='Site popularity rank, from CrUX'),
  url STRING NOT NULL OPTIONS(description='The URL of the request'),
  is_main_document BOOL NOT NULL OPTIONS(description='Whether this request corresponds with the main HTML document of the page, which is the first HTML request after redirects'),
  type STRING OPTIONS(description='Simplified description of the type of resource (script, html, css, text, other, etc)'),
  index INT64 OPTIONS(description='The sequential 0-based index of the request'),
  payload JSON OPTIONS(description='JSON-encoded WebPageTest result data for this request'),
  summary JSON OPTIONS(description='JSON-encoded summarization of request data'),
  request_headers ARRAY<STRUCT<
    name STRING OPTIONS(description='Request header name'),
    value STRING OPTIONS(description='Request header value')
    >> OPTIONS(description='Request headers'),
  response_headers ARRAY<STRUCT<
    name STRING OPTIONS(description='Response header name'),
    value STRING OPTIONS(description='Response header value')
    >> OPTIONS(description='Response headers'),
  response_body STRING OPTIONS(description='Text-based response body')
)
PARTITION BY date
CLUSTER BY client, is_root_page, type, rank
OPTIONS(
  require_partition_filter=true
);
`)

const iterations = []

for (
  let month = '2022-03-01'; month >= '2022-03-01'; month = constants.fnPastMonth(month)) {
  constants.clients.forEach((client) => {
    constants.booleans.forEach((isRootPage) => {
      iterations.push({
        month,
        client,
        isRootPage
      })
    })
  })
}

iterations.forEach((iteration, i) => {
  operate(`all_requests_stable ${iteration.month} ${iteration.client} ${iteration.isRootPage}`).tags(
    ['all_requests_stable']
  ).dependencies([
    i === 0 ? 'all_requests_stable_pre' : `all_requests_stable3 ${iterations[i - 1].month} ${iterations[i - 1].client} ${iterations[i - 1].isRootPage}`
  ]).queries(ctx => `
DELETE FROM \`all_dev.requests_stable\`
WHERE date = '${iteration.month}'
  AND client = '${iteration.client}'
  AND is_root_page = ${iteration.isRootPage};

CREATE TEMP FUNCTION PRUNE_HEADERS(
  jsonObject JSON
) RETURNS JSON
LANGUAGE js AS '''
try {
  for (const [key, value] of Object.entries(jsonObject)) {
    if(key.startsWith('req_') || key.startsWith('resp_')) {
      delete jsonObject[key];
    }
  }
  return jsonObject;
} catch (e) {
  return null;
}
''';

INSERT INTO \`all_dev.requests_stable\`
SELECT
  date,
  client,
  requests.page,
  is_root_page,
  root_page,
  crux.rank,
  url,
  is_main_document,
  type,
  index,
  JSON_REMOVE(
    payload,
    '$._headers',
    '$.request.headers',
    '$.response.headers'
  ) AS payload,
  PRUNE_HEADERS(
    JSON_REMOVE(
      summary,
      '$.crawlid',
      '$.firstHtml',
      '$.firstReq',
      '$.pageid',
      '$.reqOtherHeaders',
      '$.requestid',
      '$.respOtherHeaders',
      '$.startedDateTime',
      '$.type',
      '$.url',
      '$.urlShort'
    )
  ) as summary,
  request_headers,
  response_headers,
  response_body
FROM (
  SELECT
    * EXCEPT (payload, summary),
    SAFE.PARSE_JSON(payload, wide_number_mode => 'round') AS payload,
    SAFE.PARSE_JSON(summary, wide_number_mode => 'round') AS summary
  FROM \`all.requests\` ${constants.devTABLESAMPLE}
  WHERE date = '${iteration.month}'
    AND client = '${iteration.client}'
    AND is_root_page = ${iteration.isRootPage}
) AS requests
LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.resolve('chrome-ux-report', 'experimental', 'global')}
  WHERE yyyymm = ${constants.fnPastMonth(iteration.month).substring(0, 7).replace('-', '')}
) AS crux
ON requests.root_page = crux.page;
  `)
})
