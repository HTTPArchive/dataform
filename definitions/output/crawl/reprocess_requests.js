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
  operate(`reprocess_requests ${iteration.month} ${iteration.client} ${iteration.isRootPage}`).tags(
    ['reprocess_requests']
  ).dependencies([
    i === 0 ? 'reprocess' : `reprocess_requests ${iterations[i - 1].month} ${iterations[i - 1].client} ${iterations[i - 1].isRootPage}`
  ]).queries(ctx => `
DELETE FROM crawl.requests
WHERE date = '${iteration.month}'
  AND client = '${iteration.client}'
  AND is_root_page = ${iteration.isRootPage};

CREATE TEMP FUNCTION pruneHeaders(
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
  return jsonObject;
}
''';

INSERT INTO crawl.requests
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
