const sqlStringList = (values) => values.map((v) => `'${v}'`).join(', ')

publish('public_hash_list', {
  type: 'table',
  schema: 'performance',
  description: `Identifies web resources (scripts, CSS, fonts, WASM) whose SHA-256 body hash appears across >=100 independent sites in the HTTP Archive monthly crawl.
A site is the registrable domain (eTLD+1) of the embedding page, computed with the full Public Suffix List (ICANN and private sections), so city1.example.com and city2.example.com count as the single site example.com, while alice.github.io and bob.github.io count as two sites.
The >=100-sites threshold is the k-anonymity privacy gate: a resource that widespread cannot serve as a cross-site identifier.
Traffic-weighted score: each hash is scored by SUM(100000 / min_rank) across sites, where min_rank is the CrUX popularity bucket of the site's most popular embedding page (1 000 = top 1K sites -> 100 pts; 1 000 000 = top 1M -> 0.1 pt). This lifts hashes carried by high-traffic pages to the top of the list.
Results are published as a world-readable Google Sheet: https://docs.google.com/spreadsheets/d/1Cw4wguQ0X4xMqZlTRYlo6OHQaUr7UVYlFZaIQkXK2Jw/edit?usp=sharing
The CSV export used by http-archive.js: https://docs.google.com/spreadsheets/d/e/2PACX-1vTOcTespiVHDRLIq16_3GsnnvJmut00x0fzWTLXSWBNya6Go_1kBrGoVJvxb8gEaP_L9FfKmXy3-kF-/pub?output=csv
Repo: https://github.com/tomayac/public-hash-list`,
  columns: {
    body_hash: 'SHA-256 body hash of the resource from WebPageTest payload',
    type: 'Simplified type of the resource (script, css, font, wasm)',
    num_sites:
      'Number of independent sites (eTLD+1 of the embedding page) loading the resource (privacy-gated threshold of >= 100)',
    traffic_weighted_score:
      'Traffic-weighted popularity score (SUM(100000 / min_rank) across sites, where min_rank is the CrUX rank bucket of the embedding page)',
    sample_url: 'A sample URL where this resource was detected'
  },
  tags: ['crawl_complete']
})
  .query(
    (ctx) => `
-- Private section of the Public Suffix List. BigQuery's NET.PUBLIC_SUFFIX()
-- only applies the ICANN section, which would merge all *.github.io pages
-- into one site. Regenerate with scripts/update_public_suffix_private.mjs.
WITH private_suffixes AS (
  SELECT suffix, FALSE AS is_wildcard
  FROM UNNEST([${sqlStringList(public_suffix_private.exact)}]) AS suffix
  UNION ALL
  SELECT suffix, TRUE AS is_wildcard
  FROM UNNEST([${sqlStringList(public_suffix_private.wildcard)}]) AS suffix
),

request_pages AS (
  SELECT
    SAFE.STRING(payload._body_hash) AS body_hash,
    type,
    LOWER(NET.HOST(page)) AS page_host,
    MIN(rank) AS min_rank,
    ANY_VALUE(url) AS sample_url
  FROM ${ctx.ref('crawl', 'requests')}
  WHERE
    date = DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND SAFE.STRING(payload._body_hash) IS NOT NULL
    AND type IN ('script', 'css', 'font', 'wasm')
    AND SAFE.STRING(summary.method) = 'GET'
    AND NET.HOST(page) IS NOT NULL
  GROUP BY
    body_hash,
    type,
    page_host
),

-- Every suffix of every page host, for example a.example.co.uk yields
-- uk, co.uk, example.co.uk, and a.example.co.uk.
host_suffixes AS (
  SELECT
    host,
    ARRAY_LENGTH(SPLIT(host, '.')) AS host_labels,
    num_labels,
    ARRAY_TO_STRING(
      ARRAY(
        SELECT label
        FROM UNNEST(SPLIT(host, '.')) AS label WITH OFFSET AS i
        WHERE i >= ARRAY_LENGTH(SPLIT(host, '.')) - num_labels
        ORDER BY i
      ),
      '.'
    ) AS suffix
  FROM (SELECT DISTINCT page_host AS host FROM request_pages)
  CROSS JOIN UNNEST(GENERATE_ARRAY(1, ARRAY_LENGTH(SPLIT(host, '.')))) AS num_labels
),

-- Length in labels of each host's longest matching public suffix, ICANN or
-- private. A wildcard rule *.x makes the suffix one label longer than x
-- public. 0 means no rule matched (IP addresses, unknown TLDs).
public_suffix_lengths AS (
  SELECT
    s.host,
    ANY_VALUE(s.host_labels) AS host_labels,
    MAX(
      CASE
        WHEN p.is_wildcard THEN s.num_labels + 1
        WHEN p.suffix IS NOT NULL THEN s.num_labels
        WHEN s.suffix = NET.PUBLIC_SUFFIX(s.host) THEN s.num_labels
        ELSE 0
      END
    ) AS suffix_labels
  FROM host_suffixes AS s
  LEFT JOIN private_suffixes AS p
  ON s.suffix = p.suffix
  GROUP BY s.host
),

-- The site is the public suffix plus one label. Hosts without a public
-- suffix, or that are a public suffix themselves, are their own site.
host_sites AS (
  SELECT
    s.host,
    s.suffix AS site
  FROM host_suffixes AS s
  INNER JOIN public_suffix_lengths AS l
  ON s.host = l.host
  WHERE
    s.num_labels = IF(
      l.suffix_labels = 0,
      l.host_labels,
      LEAST(l.suffix_labels + 1, l.host_labels)
    )
),

request_sites AS (
  SELECT
    r.body_hash,
    r.type,
    h.site,
    MIN(r.min_rank) AS min_rank,
    ANY_VALUE(r.sample_url) AS sample_url
  FROM request_pages AS r
  INNER JOIN host_sites AS h
  ON r.page_host = h.host
  GROUP BY
    r.body_hash,
    r.type,
    h.site
),

hash_popularity AS (
  SELECT
    body_hash,
    type,
    COUNT(*) AS num_sites,
    SUM(100000.0 / min_rank) AS traffic_weighted_score,
    ANY_VALUE(sample_url) AS sample_url
  FROM request_sites
  GROUP BY
    body_hash,
    type
)

SELECT
  body_hash,
  type,
  num_sites,
  traffic_weighted_score,
  sample_url
FROM hash_popularity
WHERE
  num_sites >= 100
ORDER BY
  traffic_weighted_score DESC
`
  )
  .postOps(
    (ctx) => `
SELECT
  reports.run_export_job(
    JSON '''{
      "destination": "cloud_storage",
      "config": {
        "bucket": "${constants.bucket}",
        "name": "${constants.storagePath}public_hash_list.csv"
      },
      "query": "SELECT * FROM ${ctx.self()}"
    }'''
  );
`
  )
