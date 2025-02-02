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
  tags: ['tech_report'],
  dependOnDependencyAssertions: true
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
    if (
      lighthouse.audits[audit.id].score === 1 &&
        !['metrics', 'hidden'].includes(audit.group)
    ) {
      results.push({
        category,
        id: audit.id
      })
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

geo_summary AS (
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
),

crux AS (
  SELECT
    geo,
    CASE _rank
      WHEN 100000000 THEN 'ALL'
      WHEN 10000000 THEN 'Top 10M'
      WHEN 1000000 THEN 'Top 1M'
      WHEN 100000 THEN 'Top 100k'
      WHEN 10000 THEN 'Top 10k'
      WHEN 1000 THEN 'Top 1k'
    END AS rank,
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
  FROM geo_summary,
    UNNEST([1000, 10000, 100000, 1000000, 10000000, 100000000]) AS _rank
  WHERE rank <= _rank
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
    page,
    root_page,
    SAFE.INT64(summary.bytesTotal) AS bytesTotal,
    SAFE.INT64(summary.bytesJS) AS bytesJS,
    SAFE.INT64(summary.bytesImg) AS bytesImg,
    SAFE.FLOAT64(lighthouse.categories.accessibility.score) AS accessibility,
    SAFE.FLOAT64(lighthouse.categories['best-practices'].score) AS best_practices,
    SAFE.FLOAT64(lighthouse.categories.performance.score) AS performance,
    SAFE.FLOAT64(lighthouse.categories.pwa.score) AS pwa,
    SAFE.FLOAT64(lighthouse.categories.seo.score) AS seo
  FROM pages
),

audits AS (
  SELECT DISTINCT
    client,
    root_page,
    technology,
    version,
    audit_category,
    audit_id
  FROM (
    SELECT
      client,
      page,
      root_page,
      audits.category AS audit_category,
      audits.id AS audit_id
    FROM pages
    INNER JOIN UNNEST(get_passed_audits(pages.lighthouse)) AS audits
  ) AS audits_data
  INNER JOIN technologies
  USING (client, page)
),

lab_metrics AS (
  SELECT
    client,
    root_page,
    technology,
    version,
    AVG(bytesTotal) AS bytesTotal,
    AVG(bytesJS) AS bytesJS,
    AVG(bytesImg) AS bytesImg,
    AVG(accessibility) AS accessibility,
    AVG(best_practices) AS best_practices,
    AVG(performance) AS performance,
    AVG(pwa) AS pwa,
    AVG(seo) AS seo
  FROM lab_data
  INNER JOIN technologies
  USING (client, page)
  GROUP BY
    client,
    root_page,
    technology,
    version
),

origins_summary AS (
  SELECT
    geo,
    client,
    rank,
    technology,
    version,
    COUNT(DISTINCT root_page) AS origins
  FROM lab_metrics
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
      audit_category AS category,
      audit_id AS id,
      SAFE_DIVIDE(origins, origins_summary.origins) AS pass_rate
    )) AS audits
  FROM (
    SELECT
      geo,
      client,
      rank,
      technology,
      version,
      audit_category,
      audit_id,
      COUNT(DISTINCT root_page) AS origins
    FROM audits
    INNER JOIN crux
    USING (client, root_page)
    GROUP BY
      geo,
      client,
      rank,
      technology,
      version,
      audit_category,
      audit_id
  )
  LEFT JOIN origins_summary
  USING (geo, client, rank, technology, version)
  GROUP BY
    geo,
    client,
    rank,
    technology,
    version
),

other_summary AS (
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
      SAFE_CAST(APPROX_QUANTILES(best_practices, 1000)[OFFSET(500)] AS NUMERIC) AS practices,
      SAFE_CAST(APPROX_QUANTILES(performance, 1000)[OFFSET(500)] AS NUMERIC) AS performance,
      SAFE_CAST(APPROX_QUANTILES(pwa, 1000)[OFFSET(500)] AS NUMERIC) AS pwa,
      SAFE_CAST(APPROX_QUANTILES(seo, 1000)[OFFSET(500)] AS NUMERIC) AS seo
    ) AS median_lighthouse_score,

    STRUCT(
      SAFE_CAST(APPROX_QUANTILES(bytesTotal, 1000)[OFFSET(500)] AS INT64) AS total,
      SAFE_CAST(APPROX_QUANTILES(bytesJS, 1000)[OFFSET(500)] AS INT64) AS js,
      SAFE_CAST(APPROX_QUANTILES(bytesImg, 1000)[OFFSET(500)] AS INT64) AS images
    ) AS median_page_weight_bytes

  FROM lab_metrics
  INNER JOIN crux
  USING (client, root_page)
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

  # Metrics
  origins,
  crux,
  lighthouse,
  page_weight,
  audits
FROM origins_summary
LEFT JOIN other_summary
USING (geo, client, rank, technology, version)
LEFT JOIN audits_summary
USING (geo, client, rank, technology, version)
`)
