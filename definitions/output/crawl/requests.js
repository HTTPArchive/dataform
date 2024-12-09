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
  *
FROM ${ctx.ref('crawl_staging', 'requests')}
WHERE date = '${constants.currentMonth}' AND
  client = 'desktop'
  ${constants.devRankFilter}
`).postOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}' AND
  client = 'mobile';

INSERT INTO ${ctx.self()}
SELECT
  *
FROM ${ctx.ref('crawl_staging', 'requests')}
WHERE date = '${constants.currentMonth}' AND
  client = 'mobile'
  ${constants.devRankFilter}
`)
