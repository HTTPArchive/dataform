const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_crux', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['geo', 'client', 'rank', 'technology'],
    requirePartitionFilter: true
  },
  dependOnDependencyAssertions: true,
  tags: ['crux_ready']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';

CREATE TEMP FUNCTION IS_GOOD(
  good FLOAT64,
  needs_improvement FLOAT64,
  poor FLOAT64
) RETURNS BOOL AS (
  SAFE_DIVIDE(good, good + needs_improvement + poor) >= 0.75
);

CREATE TEMP FUNCTION IS_NON_ZERO(
  good FLOAT64,
  needs_improvement FLOAT64,
  poor FLOAT64
) RETURNS BOOL AS (
  good + needs_improvement + poor > 0
);

CREATE TEMP FUNCTION get_passed_audits(lighthouse JSON)
RETURNS ARRAY<STRUCT<
  category STRING,
  id STRING
>>
LANGUAGE js AS """
const results = []

for (const category of Object.keys(lighthouse?.categories ? lighthouse.categories : {})) {
  for (const audit of lighthouse.categories[category].auditRefs) {

    // Moving lighthouse to insights https://developer.chrome.com/blog/moving-lighthouse-to-insights
    if (category === 'performance' && '${pastMonth}' < '2025-10-01') {
      if (
        [
          'first-meaningful-paint',
          'no-document-write',
          'offscreen-images',
          'uses-passive-event-listeners',
          'uses-rel-preload',
          'third-party-facades'
        ].includes(audit.id)
      ) {
        continue; // Deprecated audits
      } else if (
        lighthouse.audits[audit.id].score === 1 // Only include audits that passed
          && !['metrics', 'hidden'].includes(audit.group) // Exclude metrics and hidden audits
      ) {
        // Map old audit IDs to new insight audit IDs
        const performanceAuditIdMapping = {
          'layout-shifts': 'cls-culprits-insight',
          'non-composited-animations': 'cls-culprits-insight',
          'unsized-images': 'cls-culprits-insight',
          'redirects': 'document-latency-insight',
          'server-response-time': 'document-latency-insight',
          'uses-text-compression': 'document-latency-insight',
          'dom-size': 'dom-size-insight',
          'duplicated-javascript': 'duplicated-javascript-insight',
          'font-display': 'font-display-insight',
          'modern-image-formats': 'image-delivery-insight',
          'uses-optimized-images': 'image-delivery-insight',
          'efficient-animated-content': 'image-delivery-insight',
          'uses-responsive-images': 'image-delivery-insight',
          'work-during-interaction': 'interaction-to-next-paint-insight',
          'prioritize-lcp-image': 'lcp-discovery-insight',
          'lcp-lazy-loaded': 'lcp-discovery-insight',
          'largest-contentful-paint-element': 'lcp-phases-insight',
          'legacy-javascript': 'legacy-javascript-insight',
          'uses-http2': 'modern-http-insight',
          'critical-request-chains': 'network-dependency-tree-insight',
          'uses-rel-preconnect': 'network-dependency-tree-insight',
          'render-blocking-resources': 'render-blocking-insight',
          'third-party-summary': 'third-parties-insight',
          'uses-long-cache-ttl': 'use-cache-insight',
          'viewport': 'viewport-insight'
        };

        // Use mapped audit ID if available, otherwise use original
        const mappedAuditId = performanceAuditIdMapping[audit.id] || audit.id;

        // Push the audit with the category and mapped ID
        results.push({
          category,
          id: mappedAuditId
        });
      }
    }

    if (
      lighthouse.audits[audit.id].score === 1 // Only include audits that passed
        && !['metrics', 'hidden'].includes(audit.group) // Exclude metrics and hidden audits
    ) {
      results.push({
        category,
        id: audit.id
      });
    }
  }
}

return results;
""";
`).query(ctx => `
WITH pages AS (
  SELECT
    client,
    page,
    root_page,
    technologies,
    summary,
    lighthouse
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
),

crux_base AS (
  SELECT
    \`chrome-ux-report\`.experimental.GET_COUNTRY(country_code) AS geo,
    rank,
    device,
    origin,
    avg_fcp,
    avg_fid,
    avg_inp,
    avg_lcp,
    avg_ttfb,
    fast_fcp,
    fast_fid,
    fast_inp,
    fast_lcp,
    fast_ttfb,
    slow_fcp,
    slow_fid,
    slow_inp,
    slow_lcp,
    slow_ttfb,
    small_cls,
    medium_cls,
    large_cls
  FROM ${ctx.ref('chrome-ux-report', 'materialized', 'country_summary')}
  WHERE
    yyyymm = CAST(FORMAT_DATE('%Y%m', '${pastMonth}') AS INT64) AND
    device IN ('desktop', 'phone')
    ${constants.devRankFilter}

  UNION ALL

  SELECT
    'ALL' AS geo,
    rank,
    device,
    origin,
    avg_fcp,
    avg_fid,
    avg_inp,
    avg_lcp,
    avg_ttfb,
    fast_fcp,
    fast_fid,
    fast_inp,
    fast_lcp,
    fast_ttfb,
    slow_fcp,
    slow_fid,
    slow_inp,
    slow_lcp,
    slow_ttfb,
    small_cls,
    medium_cls,
    large_cls
  FROM ${ctx.ref('chrome-ux-report', 'materialized', 'device_summary')}
  WHERE
    date = '${pastMonth}' AND
    device IN ('desktop', 'phone')
    ${constants.devRankFilter}
),

crux AS (
  SELECT
    geo,
    rank,
    root_page,
    client,

    any_fid,
    good_fid,
    any_cls,
    good_cls,
    any_lcp,
    good_lcp,
    good_cwv,

    any_fcp,
    good_fcp,
    any_ttfb,
    good_ttfb,
    any_inp,
    good_inp
  FROM (
    SELECT
      geo,
      CASE
        WHEN rank <= 1000 THEN ['Top 1k', 'Top 10k', 'Top 100k', 'Top 1M', 'Top 10M', 'ALL']
        WHEN rank <= 10000 THEN ['Top 10k', 'Top 100k', 'Top 1M', 'Top 10M', 'ALL']
        WHEN rank <= 100000 THEN ['Top 100k', 'Top 1M', 'Top 10M', 'ALL']
        WHEN rank <= 1000000 THEN ['Top 1M', 'Top 10M', 'ALL']
        WHEN rank <= 10000000 THEN ['Top 10M', 'ALL']
        WHEN rank <= 100000000 THEN ['ALL']
      END AS eligible_ranks,
      CONCAT(origin, '/') AS root_page,
      IF(device = 'desktop', 'desktop', 'mobile') AS client,

      # CWV
      IS_NON_ZERO(fast_fid, avg_fid, slow_fid) AS any_fid,
      IS_GOOD(fast_fid, avg_fid, slow_fid) AS good_fid,
      IS_NON_ZERO(small_cls, medium_cls, large_cls) AS any_cls,
      IS_GOOD(small_cls, medium_cls, large_cls) AS good_cls,
      IS_NON_ZERO(fast_lcp, avg_lcp, slow_lcp) AS any_lcp,
      IS_GOOD(fast_lcp, avg_lcp, slow_lcp) AS good_lcp,
      IF('${pastMonth}' < '2024-01-01',
        (IS_GOOD(fast_fid, avg_fid, slow_fid) OR fast_fid IS NULL) AND
          IS_GOOD(small_cls, medium_cls, large_cls) AND
          IS_GOOD(fast_lcp, avg_lcp, slow_lcp),
        (IS_GOOD(fast_inp, avg_inp, slow_inp) OR fast_inp IS NULL) AND
          IS_GOOD(small_cls, medium_cls, large_cls) AND
          IS_GOOD(fast_lcp, avg_lcp, slow_lcp)
      ) AS good_cwv,

      # WV
      IS_NON_ZERO(fast_fcp, avg_fcp, slow_fcp) AS any_fcp,
      IS_GOOD(fast_fcp, avg_fcp, slow_fcp) AS good_fcp,
      IS_NON_ZERO(fast_ttfb, avg_ttfb, slow_ttfb) AS any_ttfb,
      IS_GOOD(fast_ttfb, avg_ttfb, slow_ttfb) AS good_ttfb,
      IS_NON_ZERO(fast_inp, avg_inp, slow_inp) AS any_inp,
      IS_GOOD(fast_inp, avg_inp, slow_inp) AS good_inp
    FROM crux_base
  ),
    UNNEST(eligible_ranks) AS rank
),

technologies AS (
  SELECT
    tech.technology,
    REGEXP_EXTRACT(version, r'\\d+(?:\\.\\d+)?') AS version,
    client,
    page
  FROM pages,
    UNNEST(technologies) AS tech,
    UNNEST(tech.info) AS version
  WHERE
    tech.technology IS NOT NULL AND
    REGEXP_EXTRACT(version, r'\\d+(?:\\.\\d+)?') IS NOT NULL

  UNION ALL

  SELECT
    tech.technology,
    'ALL' AS version,
    client,
    page
  FROM pages,
    UNNEST(technologies) AS tech
  WHERE
    tech.technology IS NOT NULL

  UNION ALL

  SELECT
    'ALL' AS technology,
    'ALL' AS version,
    client,
    page
  FROM pages
),

lab_data AS (
  SELECT
    client,
    root_page,
    technology,
    version,
    AVG(SAFE.INT64(summary.bytesTotal)) AS bytesTotal,
    AVG(SAFE.INT64(summary.bytesJS)) AS bytesJS,
    AVG(SAFE.INT64(summary.bytesImg)) AS bytesImg,
    AVG(SAFE.FLOAT64(lighthouse.categories.accessibility.score)) AS accessibility,
    AVG(SAFE.FLOAT64(lighthouse.categories['best-practices'].score)) AS best_practices,
    AVG(SAFE.FLOAT64(lighthouse.categories.performance.score)) AS performance,
    AVG(SAFE.FLOAT64(lighthouse.categories.seo.score)) AS seo
  FROM pages
  INNER JOIN technologies
  USING (client, page)
  GROUP BY
    client,
    root_page,
    technology,
    version
),

audits AS (
  SELECT
    geo,
    client,
    rank,
    technology,
    version,
    category,
    id,
    COUNT(DISTINCT root_page) AS origins
  FROM (
    SELECT DISTINCT
      client,
      page,
      root_page,
      audits.category,
      audits.id
    FROM pages
    INNER JOIN UNNEST(get_passed_audits(pages.lighthouse)) AS audits
  ) AS audits_data
  INNER JOIN technologies
  USING (client, page)
  INNER JOIN crux
  USING (client, root_page)
  GROUP BY
    geo,
    client,
    rank,
    technology,
    version,
    category,
    id
),

base_summary AS (
  SELECT
    geo,
    client,
    rank,
    technology,
    version,

    STRUCT(
      COUNTIF(good_fid) AS origins_with_good_fid,
      COUNTIF(good_cls) AS origins_with_good_cls,
      COUNTIF(good_lcp) AS origins_with_good_lcp,
      COUNTIF(good_fcp) AS origins_with_good_fcp,
      COUNTIF(good_ttfb) AS origins_with_good_ttfb,
      COUNTIF(good_inp) AS origins_with_good_inp,
      COUNTIF(any_fid) AS origins_with_any_fid,
      COUNTIF(any_cls) AS origins_with_any_cls,
      COUNTIF(any_lcp) AS origins_with_any_lcp,
      COUNTIF(any_fcp) AS origins_with_any_fcp,
      COUNTIF(any_ttfb) AS origins_with_any_ttfb,
      COUNTIF(any_inp) AS origins_with_any_inp,
      COUNTIF(good_cwv) AS origins_with_good_cwv,
      COUNTIF(any_lcp AND any_cls) AS origins_eligible_for_cwv,
      SAFE_DIVIDE(COUNTIF(good_cwv), COUNTIF(any_lcp AND any_cls)) AS pct_eligible_origins_with_good_cwv
    ) AS crux,

    STRUCT(
      SAFE_CAST(APPROX_QUANTILES(accessibility, 1000)[OFFSET(500)] AS NUMERIC) AS accessibility,
      SAFE_CAST(APPROX_QUANTILES(best_practices, 1000)[OFFSET(500)] AS NUMERIC) AS best_practices,
      SAFE_CAST(APPROX_QUANTILES(performance, 1000)[OFFSET(500)] AS NUMERIC) AS performance,
      SAFE_CAST(APPROX_QUANTILES(seo, 1000)[OFFSET(500)] AS NUMERIC) AS seo
    ) AS median_lighthouse_score,

    STRUCT(
      SAFE_CAST(APPROX_QUANTILES(bytesTotal, 1000)[OFFSET(500)] AS INT64) AS total,
      SAFE_CAST(APPROX_QUANTILES(bytesJS, 1000)[OFFSET(500)] AS INT64) AS js,
      SAFE_CAST(APPROX_QUANTILES(bytesImg, 1000)[OFFSET(500)] AS INT64) AS images
    ) AS median_page_weight_bytes,

    COUNT(DISTINCT root_page) AS origins
  FROM lab_data
  INNER JOIN crux
  USING (client, root_page)
  GROUP BY
    geo,
    client,
    rank,
    technology,
    version
),

audits_summary AS (
  SELECT
    geo,
    client,
    rank,
    technology,
    version,
    ARRAY_AGG(STRUCT(
      category AS category,
      id AS id,
      SAFE_DIVIDE(audits.origins, base_summary.origins) AS pass_rate
    )) AS audits
  FROM audits
  LEFT JOIN base_summary
  USING (geo, client, rank, technology, version)
  GROUP BY
    geo,
    client,
    rank,
    technology,
    version
)

SELECT
  DATE('${pastMonth}') AS date,
  geo,
  client,
  rank,
  technology,
  version,

  origins,
  crux,
  median_lighthouse_score,
  median_page_weight_bytes,
  audits
FROM base_summary
LEFT JOIN audits_summary
USING (geo, client, rank, technology, version)
`)
