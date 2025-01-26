const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_crux', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['geo', 'app', 'rank', 'client'],
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
`).query(ctx => `
WITH pages AS (
  SELECT
    client,
    page,
    root_page AS origin,
    technologies,
    summary,
    lighthouse
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
), geo_summary AS (
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
    CONCAT(origin, '/') AS origin,
    IF(device = 'desktop', 'desktop', 'mobile') AS client,

    # CWV
    IS_NON_ZERO(fast_fid, avg_fid, slow_fid) AS any_fid,
    IS_GOOD(fast_fid, avg_fid, slow_fid) AS good_fid,
    IS_NON_ZERO(small_cls, medium_cls, large_cls) AS any_cls,
    IS_GOOD(small_cls, medium_cls, large_cls) AS good_cls,
    IS_NON_ZERO(fast_lcp, avg_lcp, slow_lcp) AS any_lcp,
    IS_GOOD(fast_lcp, avg_lcp, slow_lcp) AS good_lcp,

    (IS_GOOD(fast_inp, avg_inp, slow_inp) OR fast_inp IS NULL) AND
    IS_GOOD(small_cls, medium_cls, large_cls) AND
    IS_GOOD(fast_lcp, avg_lcp, slow_lcp) AS good_cwv_2024,

    (IS_GOOD(fast_fid, avg_fid, slow_fid) OR fast_fid IS NULL) AND
    IS_GOOD(small_cls, medium_cls, large_cls) AND
    IS_GOOD(fast_lcp, avg_lcp, slow_lcp) AS good_cwv_2023,

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
    REGEXP_EXTRACT_ALL(version, r'(0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)')[SAFE_OFFSET(0)] AS version,
    client,
    page
  FROM pages,
    UNNEST(technologies) AS tech,
    UNNEST(tech.info) AS version
  WHERE
    tech.technology IS NOT NULL AND
    tech.technology != '' AND
    REGEXP_EXTRACT_ALL(version, r'(0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)')[SAFE_OFFSET(0)] IS NOT NULL

  UNION ALL

  SELECT
    tech.technology,
    'ALL' AS version,
    client,
    page
  FROM pages,
    UNNEST(technologies) AS tech

  UNION ALL

  SELECT
    'ALL' AS technology,
    'ALL' AS version,
    client,
    page
  FROM pages
),

categories AS (
  SELECT
    tech.technology,
    ARRAY_TO_STRING(ARRAY_AGG(DISTINCT category IGNORE NULLS ORDER BY category), ', ') AS category
  FROM pages,
    UNNEST(technologies) AS tech,
    UNNEST(tech.categories) AS category
  GROUP BY technology

  UNION ALL

  SELECT
    'ALL' AS technology,
    ARRAY_TO_STRING(ARRAY_AGG(DISTINCT category IGNORE NULLS ORDER BY category), ', ') AS category
  FROM pages,
    UNNEST(technologies) AS tech,
    UNNEST(tech.categories) AS category
  WHERE
    client = 'mobile'
),

lab_metrics AS (
  SELECT
    client,
    page,
    origin,
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

lab_data AS (
  SELECT
    client,
    origin,
    technology,
    version,
    ANY_VALUE(category) AS category,
    AVG(bytesTotal) AS bytesTotal,
    AVG(bytesJS) AS bytesJS,
    AVG(bytesImg) AS bytesImg,
    AVG(accessibility) AS accessibility,
    AVG(best_practices) AS best_practices,
    AVG(performance) AS performance,
    AVG(pwa) AS pwa,
    AVG(seo) AS seo
  FROM lab_metrics
  INNER JOIN technologies
  USING (client, page)
  INNER JOIN categories
  USING (technology)
  GROUP BY
    client,
    origin,
    technology,
    version
)

SELECT
  DATE('${pastMonth}') AS date,
  geo,
  rank,
  ANY_VALUE(category) AS category,
  technology AS app,
  version,
  client,
  COUNT(DISTINCT origin) AS origins,

  # CrUX data
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
  COUNTIF(good_cwv_2024) AS origins_with_good_cwv,
  COUNTIF(good_cwv_2024) AS origins_with_good_cwv_2024,
  COUNTIF(good_cwv_2023) AS origins_with_good_cwv_2023,
  COUNTIF(any_lcp AND any_cls) AS origins_eligible_for_cwv,
  SAFE_DIVIDE(COUNTIF(good_cwv_2024), COUNTIF(any_lcp AND any_cls)) AS pct_eligible_origins_with_good_cwv,
  SAFE_DIVIDE(COUNTIF(good_cwv_2024), COUNTIF(any_lcp AND any_cls)) AS pct_eligible_origins_with_good_cwv_2024,
  SAFE_DIVIDE(COUNTIF(good_cwv_2023), COUNTIF(any_lcp AND any_cls)) AS pct_eligible_origins_with_good_cwv_2023,

  # Lighthouse data
  SAFE_CAST(APPROX_QUANTILES(accessibility, 1000)[OFFSET(500)] AS NUMERIC) AS median_lighthouse_score_accessibility,
  SAFE_CAST(APPROX_QUANTILES(best_practices, 1000)[OFFSET(500)] AS NUMERIC) AS median_lighthouse_score_best_practices,
  SAFE_CAST(APPROX_QUANTILES(performance, 1000)[OFFSET(500)] AS NUMERIC) AS median_lighthouse_score_performance,
  SAFE_CAST(APPROX_QUANTILES(pwa, 1000)[OFFSET(500)] AS NUMERIC) AS median_lighthouse_score_pwa,
  SAFE_CAST(APPROX_QUANTILES(seo, 1000)[OFFSET(500)] AS NUMERIC) AS median_lighthouse_score_seo,

  # Page weight stats
  SAFE_CAST(APPROX_QUANTILES(bytesTotal, 1000)[OFFSET(500)] AS INT64) AS median_bytes_total,
  SAFE_CAST(APPROX_QUANTILES(bytesJS, 1000)[OFFSET(500)] AS INT64) AS median_bytes_js,
  SAFE_CAST(APPROX_QUANTILES(bytesImg, 1000)[OFFSET(500)] AS INT64) AS median_bytes_image

FROM lab_data
INNER JOIN crux
USING (client, origin)
GROUP BY
  app,
  version,
  geo,
  rank,
  client
`)
