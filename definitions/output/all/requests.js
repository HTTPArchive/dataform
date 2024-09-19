publish("requests", {
    type: "incremental",
    protected: true,
    schema: "all",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "is_main_document", "type"],
        requirePartitionFilter: true
    },
    tags: ["crawl_results_all"],
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.current_month}';
`).query(ctx => `
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = TRUE AND type = 'script'
`).postOps(ctx => `
INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'desktop' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = TRUE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = TRUE AND (type != 'script' OR type IS NULL);

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = FALSE AND type = 'script';

INSERT INTO ${ctx.self()}
SELECT * EXCEPT (rank)
FROM ${ctx.ref("crawl_staging", "requests")} ${constants.dev_TABLESAMPLE}
WHERE date = '${constants.current_month}' AND client = 'mobile' AND is_root_page = FALSE AND (type != 'script' OR type IS NULL)
`)

let monthRange = [];
for (
  let month = '2022-06-01';
  month >= '2016-01-01';
  month = constants.fn_past_month(month)) {
    monthRange.push(month)
}

monthRange.forEach((month, i) => {
  operate(`requests_backfill ${month}`).tags([
    "requests_backfill"
  ]).queries(ctx => `
DELETE FROM ${ctx.resolve("all", "requests")}
WHERE date = '${month}';

INSERT INTO ${ctx.resolve("all", "requests")}
SELECT
  '${month}' AS date,
  COALESCE(response_bodies._TABLE_SUFFIX, requests._TABLE_SUFFIX) AS client,
  COALESCE(response_bodies.page, requests.page) AS page,
  TRUE AS is_root_page,
  COALESCE(response_bodies.page, requests.page) AS root_page,
  COALESCE(response_bodies.url, requests.url) AS url,
  IF(
    SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._request_type') AS STRING) = "Document" AND
      MIN(SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._index') AS INT64)) OVER (PARTITION BY page) = SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._index') AS INT64),
    TRUE,
    FALSE
  ) AS is_main_document,
  SAFE_CAST(JSON_EXTRACT_SCALAR(payload, '$._index') AS INT64) AS index,
  requests.payload AS payload,
  JSON_OBJECT(
    "time", SAFE_CAST(JSON_VALUE(requests.payload, '$.time') AS INTEGER),
    "method", JSON_VALUE(requests.payload, '$._method'),
    "redirectUrl", NULL,
    "reqHttpVersion", JSON_VALUE(requests.payload, '$.request.httpVersion'),
    "reqHeadersSize", JSON_VALUE(requests.payload, '$.request.headersSize'),
    "reqBodySize", JSON_VALUE(requests.payload, '$.request.bodySize'),
    "reqCookieLen", NULL,
    "status", JSON_VALUE(requests.payload, '$.response.status'),
    "respHttpVersion", JSON_VALUE(requests.payload, '$.response.httpVersion'),
    "respHeadersSize", JSON_VALUE(requests.payload, '$.response.headersSize'),
    "respBodySize", JSON_VALUE(requests.payload, '$.response.bodySize'),
    "respSize", JSON_VALUE(requests.payload, '$.response.content.size'),
    "respCookieLen", NULL,
    "expAge", NULL,
    "mimeType", JSON_VALUE(requests.payload, '$.response.content.mimeType'),
    "_cdn_provider", JSON_VALUE(requests.payload, '$._cdn_provider'),
    "_gzip_save", JSON_VALUE(requests.payload, '$._gzip_save'),
    "ext", NULL,
    "format", NULL
  ) AS summary,
  JSON_QUERY(payload, '$.request.headers') AS request_headers,
  JSON_QUERY(payload, '$.response.headers') AS response_headers,
  response_bodies.response_body AS response_body
FROM \`response_bodies.${constants.fn_date_underscored(month)}_*\` AS response_bodies
FULL OUTER JOIN \`requests.${constants.fn_date_underscored(month)}_*\` AS requests
USING (page, url);
  `)
})
