const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('meta_technologies', {
  type: 'table',
  description: 'Used in dashboard: https://lookerstudio.google.com/u/7/reporting/1jh_ScPlCIbSYTf2r2Y6EftqmX9SQy4Gn/page/p_an38lbzywc/edit',
  schema: 'scratchspace',
  tags: ['crawl_results_all']
}).query(ctx => `
WITH source AS (
  SELECT DISTINCT
    date,
    root_page AS page,
    tech.technology,
    tech.categories,
    tech.info as version
  FROM ${ctx.resolve('all', 'pages')},
    UNNEST(technologies) AS tech
  WHERE date >= "${pastMonth}" ${constants.devRankFilter}
    AND client = 'mobile'
),
-- Technology in the previous month (August)
tech_before AS (
  SELECT
    page,
    categories,
    technology,
    version
  FROM source
  WHERE date = "${pastMonth}"
),
-- Technology in the current month (September)
tech_current AS (
  SELECT
    page,
    categories,
    technology,
    version
  FROM source
  WHERE date = "${constants.currentMonth}"
),
-- Summary of technology and categories per page in the previous month
tech_before_summary AS (
  SELECT
    categories,
    technology,
    version,
    COUNT(DISTINCT page) AS total_pages_before
  FROM tech_before
  GROUP BY technology, categories, version
),
-- Pages that existed last month but introduced the technology in the current month
tech_introduced_existing_pages AS (
  SELECT
    tech_current.categories,
    tech_current.technology,
    tech_current.version,
    COUNT(DISTINCT tech_current.page) AS total_pages_introduced_existing,
    STRING_AGG(DISTINCT tech_current.page LIMIT 5) AS sample_pages_introduced_existing
  FROM tech_current
  JOIN tech_before
  USING (page)
  LEFT JOIN tech_before AS tb
  ON tech_current.page = tb.page AND tech_current.technology = tb.technology
  WHERE tb.page IS NULL  -- Technology was not detected last month
  GROUP BY tech_current.categories, tech_current.technology, tech_current.version
),
-- Pages that were not in the dataset last month but appeared this month with the technology
tech_introduced_new_pages AS (
  SELECT
    tech_current.categories,
    tech_current.technology,
    tech_current.version,
    COUNT(DISTINCT tech_current.page) AS total_pages_introduced_new,
    STRING_AGG(DISTINCT tech_current.page LIMIT 5) AS sample_pages_introduced_new
  FROM tech_current
  LEFT JOIN tech_before
  USING (page)
  WHERE tech_before.page IS NULL  -- Page was not present last month
  GROUP BY tech_current.categories, tech_current.technology, tech_current.version
),
-- Pages that existed this month but no longer have the technology
tech_deprecated_existing_pages AS (
  SELECT
    tech_before.categories,
    tech_before.technology,
    tech_before.version,
    COUNT(DISTINCT tech_before.page) AS total_pages_deprecated_existing,
    STRING_AGG(DISTINCT tech_before.page LIMIT 5) AS sample_pages_deprecated_existing
  FROM tech_before
  JOIN tech_current
  USING (page)
  LEFT JOIN tech_current AS tc
  ON tech_before.page = tc.page AND tech_before.technology = tc.technology
  WHERE tc.page IS NULL  -- Technology is not detected in the current month
  GROUP BY tech_before.categories, tech_before.technology, tech_before.version
),
-- Pages that no longer exist in the current dataset
tech_deprecated_gone_pages AS (
  SELECT
    tech_before.categories,
    tech_before.technology,
    tech_before.version,
    COUNT(DISTINCT tech_before.page) AS total_pages_deprecated_gone,
    STRING_AGG(DISTINCT tech_before.page LIMIT 5) AS sample_pages_deprecated_gone
  FROM tech_before
  LEFT JOIN tech_current
  USING (page)
  WHERE tech_current.page IS NULL  -- Page no longer exists in current dataset
  GROUP BY tech_before.categories, tech_before.technology, tech_before.version
)

-- Final aggregation and comparison of technology adoption/deprecation metrics
SELECT
  COALESCE(before_summary.categories, tech_introduced_existing_pages.categories, tech_introduced_new_pages.categories) AS categories,
  COALESCE(before_summary.technology, tech_introduced_existing_pages.technology, tech_introduced_new_pages.technology) AS technology,
  COALESCE(before_summary.version, tech_introduced_existing_pages.version, tech_introduced_new_pages.version) AS version,

  -- Pages summary
  0-COALESCE(total_pages_deprecated_existing, 0) AS total_pages_deprecated_existing,
  0-COALESCE(total_pages_deprecated_gone, 0) AS total_pages_deprecated_gone,

  COALESCE(total_pages_before, 0) - COALESCE(total_pages_deprecated_existing, 0) - COALESCE(total_pages_deprecated_gone, 0) AS total_pages_persisted,

  COALESCE(total_pages_introduced_existing, 0) AS total_pages_introduced_existing,
  COALESCE(total_pages_introduced_new, 0) AS total_pages_introduced_new,

  -- Sample pages
  COALESCE(sample_pages_deprecated_existing, "") AS sample_pages_deprecated_existing,
  COALESCE(sample_pages_deprecated_gone, "") AS sample_pages_deprecated_gone,

  COALESCE(tech_introduced_existing_pages.sample_pages_introduced_existing, "") AS sample_pages_introduced_existing,
  COALESCE(tech_introduced_new_pages.sample_pages_introduced_new, "") AS sample_pages_introduced_new

FROM tech_before_summary before_summary
FULL OUTER JOIN tech_introduced_existing_pages
  USING (technology)
FULL OUTER JOIN tech_introduced_new_pages
  USING (technology)
LEFT JOIN tech_deprecated_existing_pages
  ON before_summary.technology = tech_deprecated_existing_pages.technology
LEFT JOIN tech_deprecated_gone_pages
  ON before_summary.technology = tech_deprecated_gone_pages.technology
ORDER BY total_pages_persisted DESC
`)
