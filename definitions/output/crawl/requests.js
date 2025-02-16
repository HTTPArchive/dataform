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
  tags: ['crawl_complete'],
  dependencies: ['create_reservation_assignment']
}).preOps(ctx => `
FOR client_value IN (SELECT * FROM UNNEST(['desktop', 'mobile']) AS client) DO
  FOR is_root_page_value IN (SELECT * FROM UNNEST([TRUE, FALSE]) AS is_root_page) DO

    -- Delete old entries
    DELETE FROM ${ctx.self()}
    WHERE date = '${constants.currentMonth}'
      AND client = client_value.client
      AND is_root_page = is_root_page_value.is_root_page;

    -- Insert new entries
    INSERT INTO ${ctx.self()}
    SELECT *
    FROM ${ctx.ref('crawl_staging', 'requests')}
    WHERE date = '${constants.currentMonth}' AND
      client = client_value.client AND
      is_root_page = is_root_page_value.is_root_page ${constants.devRankFilter};

  END FOR;
END FOR;
`).query(ctx => `
SELECT *
FROM ${ctx.ref('crawl_staging', 'requests')}
WHERE date IS NULL ${constants.devRankFilter}
LIMIT 0
`)
