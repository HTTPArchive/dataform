publish('requests', {
  type: 'incremental',
  protected: true,
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'type', 'rank'],
    requirePartitionFilter: true
  },
  columns: {
    date: 'YYYY-MM-DD format of the HTTP Archive monthly crawl',
    client: 'Test environment: desktop or mobile',
    page: 'The URL of the page being tested',
    is_root_page: 'Whether the page is the root of the origin.',
    root_page: 'The URL of the root page being tested',
    rank: 'Site popularity rank, from CrUX',
    url: 'The URL of the request',
    is_main_document: 'Whether this request corresponds with the main HTML document of the page, which is the first HTML request after redirects',
    type: 'Simplified description of the type of resource (script, html, css, text, other, etc)',
    index: 'The sequential 0-based index of the request',
    payload: 'JSON-encoded WebPageTest result data for this request',
    summary: 'JSON-encoded summarization of request data',
    request_headers: {
      description: 'Request headers',
      columns: {
        name: 'Request header name',
        value: 'Request header value'
      }
    },
    response_headers: {
      description: 'Response headers',
      columns: {
        name: 'Response header name',
        value: 'Response header value'
      }
    },
    response_body: 'Text-based response body'
  },
  tags: ['crawl_complete']
}).preOps(ctx => `
CREATE TEMP FUNCTION pruneHeaders(
  jsonObject JSON
) RETURNS JSON
LANGUAGE js AS '''
try {
  for (const [key, value] of Object.entries(jsonObject)) {
    if(key.startsWith('req_') || key.startsWith('resp_')) {
      delete jsonObject[key]
    }
  }
  return jsonObject
} catch (e) {
  return jsonObject
}
''';

DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}' AND
  client = 'desktop';
`).query(ctx => `
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
  pruneHeaders(
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
  FROM ${ctx.ref('crawl_staging', 'requests')}
  WHERE date = '${constants.currentMonth}'
    AND client = 'desktop'
    ${constants.devRankFilter}
) AS requests
LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.ref('chrome-ux-report', 'experimental', 'global')}
  WHERE yyyymm = ${constants.fnPastMonth(constants.currentMonth).substring(0, 7).replace('-', '')}
) AS crux
ON requests.root_page = crux.page
`).postOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}' AND
  client = 'mobile';

INSERT INTO ${ctx.self()}
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
  pruneHeaders(
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
  FROM ${ctx.ref('crawl_staging', 'requests')}
  WHERE date = '${constants.currentMonth}'
    AND client = 'mobile'
    ${constants.devRankFilter}
) AS requests
LEFT JOIN (
  SELECT DISTINCT
    CONCAT(origin, '/') AS page,
    experimental.popularity.rank AS rank
  FROM ${ctx.ref('chrome-ux-report', 'experimental', 'global')}
  WHERE yyyymm = ${constants.fnPastMonth(constants.currentMonth).substring(0, 7).replace('-', '')}
) AS crux
ON requests.root_page = crux.page;
`)
