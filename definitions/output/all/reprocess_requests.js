operate('all_requests_stable_pre').tags(
  ['all_requests_stable']
).queries(`
CREATE SCHEMA IF NOT EXISTS all_dev;

-- DROP TABLE IF EXISTS \`all_dev.requests_stable\`;

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
const types = ['= "script"', '= "image"', 'NOT IN ("script", "image")']

for (
  let month = constants.currentMonth;
  month >= '2024-09-01'; // 2022-07-01
  month = constants.fnPastMonth(month)) {
  constants.clients.forEach((client) => {
    constants.booleans.forEach((is_root_page) => {
      types.forEach((type) => {
        iterations.push({
          month,
          client,
          is_root_page,
          type
        })
      })
    })
  })
}

iterations.forEach((iteration, i) => {
  operate(`all_requests_stable ${iteration.month} ${iteration.client} ${iteration.is_root_page} ${i}`).tags(
    ['all_requests_stable']
  ).dependencies([
    i === 0 ? 'all_requests_stable_pre' : `all_requests_stable ${iterations[i - 1].month} ${iterations[i - 1].client} ${iterations[i - 1].is_root_page} ${i - 1}`
  ]).queries(ctx => `
DELETE FROM \`all_dev.requests_stable\`
WHERE date = '${iteration.month}'
  AND client = '${iteration.client}'
  AND is_root_page = ${iteration.is_root_page}
  AND type ${iteration.type};

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
    '$._headers',
    '$.request.headers',
    '$.response.headers'
  ) AS payload,
  PRUNE_HEADERS(
    JSON_REMOVE(
      SAFE.PARSE_JSON(requests.summary, wide_number_mode => 'round'),
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
  requests.request_headers,
  requests.response_headers,
  requests.response_body
FROM (
  SELECT *
  FROM \`all.requests\` ${constants.devTABLESAMPLE}
  WHERE date = '${iteration.month}'
    AND client = '${iteration.client}'
    AND is_root_page = ${iteration.is_root_page}
    AND type ${iteration.type}
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
