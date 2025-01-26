const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('technologies', {
  schema: 'core_web_vitals',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['geo', 'app', 'rank', 'client'],
    requirePartitionFilter: true
  },
  tags: ['crux_ready', 'tech_report'],
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
WITH geo_summary AS (
  SELECT
    CAST(REGEXP_REPLACE(CAST(yyyymm AS STRING), r'(\\d{4})(\\d{2})', r'\\1-\\2-01') AS DATE) AS date,
    * EXCEPT (country_code),
    \`chrome-ux-report\`.experimental.GET_COUNTRY(country_code) AS geo
  FROM ${ctx.ref('chrome-ux-report', 'materialized', 'country_summary')}
  WHERE
    yyyymm = CAST(FORMAT_DATE('%Y%m', '${pastMonth}') AS INT64) AND
    device IN ('desktop', 'phone')
UNION ALL
  SELECT
    * EXCEPT (yyyymmdd, p75_fid_origin, p75_cls_origin, p75_lcp_origin, p75_inp_origin),
    'ALL' AS geo
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
    technology.technology,
    client,
    page
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies) AS technology
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter} AND
    technology.technology IS NOT NULL AND
    technology.technology != ''
UNION ALL
  SELECT
    'ALL' AS technology,
    client,
    page
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
),

categories AS (
  SELECT
    technology.technology,
    ARRAY_TO_STRING(ARRAY_AGG(DISTINCT category IGNORE NULLS ORDER BY category), ', ') AS category
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies) AS technology,
    UNNEST(technology.categories) AS category
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
  GROUP BY technology
UNION ALL
  SELECT
    'ALL' AS technology,
    ARRAY_TO_STRING(ARRAY_AGG(DISTINCT category IGNORE NULLS ORDER BY category), ', ') AS category
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies) AS technology,
    UNNEST(technology.categories) AS category
  WHERE
    date = '${pastMonth}' AND
    client = 'mobile'
    ${constants.devRankFilter}
),

summary_stats AS (
  SELECT
    client,
    page,
    root_page AS root_page,
    SAFE.INT64(summary.bytesTotal) AS bytesTotal,
    SAFE.INT64(summary.bytesJS) AS bytesJS,
    SAFE.INT64(summary.bytesImg) AS bytesImg,
    SAFE.FLOAT64(lighthouse.categories.accessibility.score) AS accessibility,
    SAFE.FLOAT64(lighthouse.categories['best-practices'].score) AS best_practices,
    SAFE.FLOAT64(lighthouse.categories.performance.score) AS performance,
    SAFE.FLOAT64(lighthouse.categories.pwa.score) AS pwa,
    SAFE.FLOAT64(lighthouse.categories.seo.score) AS seo
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
),

lab_data AS (
  SELECT
    client,
    root_page,
    technology,
    ANY_VALUE(category) AS category,
    AVG(bytesTotal) AS bytesTotal,
    AVG(bytesJS) AS bytesJS,
    AVG(bytesImg) AS bytesImg,
    AVG(accessibility) AS accessibility,
    AVG(best_practices) AS best_practices,
    AVG(performance) AS performance,
    AVG(pwa) AS pwa,
    AVG(seo) AS seo
  FROM summary_stats
  JOIN technologies
  USING (client, page)
  JOIN categories
  USING (technology)
  GROUP BY
    client,
    root_page,
    technology
)

SELECT
  DATE('${pastMonth}') AS date,
  geo,
  rank,
  ANY_VALUE(category) AS category,
  technology AS app,
  client,
  COUNT(0) AS origins,

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
USING (client, root_page)
GROUP BY
  app,
  geo,
  rank,
  client
`)
