publish('public_hash_list', {
  type: 'table',
  schema: 'performance',
  description: `Identifies web resources (scripts, CSS, fonts, WASM) whose SHA-256 body hash appears across >=100 independent origins in the HTTP Archive monthly crawl.
The >=100-origins threshold is the k-anonymity privacy gate: a resource that widespread cannot serve as a cross-site identifier.
Traffic-weighted score: each hash is scored by SUM(100000 / min_rank) across origins, where min_rank is the CrUX popularity bucket of the hosting page (1 000 = top 1K sites -> 100 pts; 1 000 000 = top 1M -> 0.1 pt). This lifts hashes carried by high-traffic pages to the top of the list.
Results are published as a world-readable Google Sheet: https://docs.google.com/spreadsheets/d/1Cw4wguQ0X4xMqZlTRYlo6OHQaUr7UVYlFZaIQkXK2Jw/edit?usp=sharing
The CSV export used by http-archive.js: https://docs.google.com/spreadsheets/d/e/2PACX-1vTOcTespiVHDRLIq16_3GsnnvJmut00x0fzWTLXSWBNya6Go_1kBrGoVJvxb8gEaP_L9FfKmXy3-kF-/pub?output=csv
Repo: https://github.com/tomayac/public-hash-list`,
  columns: {
    body_hash: 'SHA-256 body hash of the resource from WebPageTest payload',
    type: 'Simplified type of the resource (script, css, font, wasm)',
    num_origins: 'Number of independent origins hosting the resource (privacy-gated threshold of >= 100)',
    traffic_weighted_score: 'Traffic-weighted popularity score (SUM(100000 / min_rank) across origins, where min_rank is the CrUX rank bucket of the hosting page)',
    sample_url: 'A sample URL where this resource was detected'
  },
  tags: ['crawl_complete']
}).query(ctx => `
WITH request_origins AS (
  SELECT
    SAFE.STRING(payload._body_hash) AS body_hash,
    type,
    NET.HOST(url) AS origin,
    MIN(rank) AS min_rank,
    ANY_VALUE(url) AS sample_url
  FROM ${ctx.ref('crawl', 'requests')}
  WHERE
    date = DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND SAFE.STRING(payload._body_hash) IS NOT NULL
    AND type IN ('script', 'css', 'font', 'wasm')
    AND SAFE.STRING(summary.method) = 'GET'
  GROUP BY
    body_hash,
    type,
    origin
),

hash_popularity AS (
  SELECT
    body_hash,
    type,
    COUNT(DISTINCT origin) AS num_origins,
    SUM(100000.0 / min_rank) AS traffic_weighted_score,
    ANY_VALUE(sample_url) AS sample_url
  FROM request_origins
  GROUP BY
    body_hash,
    type
)

SELECT
  body_hash,
  type,
  num_origins,
  traffic_weighted_score,
  sample_url
FROM hash_popularity
WHERE
  num_origins >= 100
ORDER BY
  traffic_weighted_score DESC
`)
