const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_detections', {
  description: 'Used in dashboard: https://lookerstudio.google.com/u/7/reporting/1jh_ScPlCIbSYTf2r2Y6EftqmX9SQy4Gn/origin/p_an38lbzywc/edit',
  schema: 'wappalyzer',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
  },
  tags: ['crawl_complete']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}';
`).query(ctx => `
WITH source AS (
  SELECT DISTINCT
    date,
    root_page AS origin,
    tech.technology
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies) AS tech
  WHERE date IN ('${pastMonth}', '${constants.currentMonth}') ${constants.devRankFilter}
),
-- Technology in the previous month
tech_before AS (
  SELECT
    origin,
    technology
  FROM source
  WHERE date = '${pastMonth}'
),
-- Technology in the current month
tech_current AS (
  SELECT
    origin,
    technology
  FROM source
  WHERE date = '${constants.currentMonth}'
),
-- Summary of technology per origin in the previous month
tech_before_summary AS (
  SELECT
    technology,
    COUNT(DISTINCT origin) AS total_origins_before
  FROM tech_before
  GROUP BY technology
),
-- origins that persisted across both months and adopted the technology in the current month
tech_adopted_existing_origins AS (
  SELECT
    persisted_origins.technology,
    COUNT(DISTINCT persisted_origins.origin) AS total_origins_adopted_existing,
    STRING_AGG(DISTINCT persisted_origins.origin LIMIT 5) AS sample_origins_adopted_existing
  FROM (
    SELECT DISTINCT
      tech_current.technology,
      tech_current.origin
    FROM tech_before
    JOIN tech_current
    USING (origin)
  ) as persisted_origins
  LEFT JOIN tech_before AS tb
  ON persisted_origins.origin = tb.origin AND persisted_origins.technology = tb.technology
  WHERE tb.origin IS NULL  -- Technology was not detected last month
  GROUP BY 1
),
-- origins that arrived to CrUX in the current month and their detected technologies
tech_adopted_new_origins AS (
  SELECT
    tech_current.technology,
    COUNT(DISTINCT tech_current.origin) AS total_origins_adopted_new,
    --STRING_AGG(DISTINCT tech_current.origin LIMIT 5) AS sample_origins_adopted_new
  FROM tech_current
  LEFT JOIN tech_before
  USING (origin)
  WHERE tech_before.origin IS NULL  -- origin was not present last month
  GROUP BY 1
),
-- origins that persisted across both months and deprecated the technology usage in the current month
tech_deprecated_existing_origins AS (
  SELECT
    persisted_origins.technology,
    COUNT(DISTINCT persisted_origins.origin) AS total_origins_deprecated_existing,
    STRING_AGG(DISTINCT persisted_origins.origin LIMIT 5) AS sample_origins_deprecated_existing
  FROM (
    SELECT DISTINCT
      tech_before.technology,
      tech_before.origin
    FROM tech_before
    JOIN tech_current
    USING (origin)
  ) as persisted_origins
  LEFT JOIN tech_current AS tc
  ON persisted_origins.origin = tc.origin AND persisted_origins.technology = tc.technology
  WHERE tc.origin IS NULL  -- Technology is not detected in the current month
  GROUP BY 1
),
-- origins that were dropped from CrUX in the current dataset, and thus the technology was not detected anymore
tech_deprecated_gone_origins AS (
  SELECT
    tech_before.technology,
    COUNT(DISTINCT tech_before.origin) AS total_origins_deprecated_gone,
    --STRING_AGG(DISTINCT tech_before.origin LIMIT 5) AS sample_origins_deprecated_gone
  FROM tech_before
  LEFT JOIN tech_current
  USING (origin)
  WHERE tech_current.origin IS NULL  -- origin no longer exists in current dataset
  GROUP BY 1
)

-- aggregation of technology adoption/deprecation metrics
SELECT
  DATE('${constants.currentMonth}') AS date,
  COALESCE(before_summary.technology, tech_adopted_existing_origins.technology, tech_adopted_new_origins.technology, apps.name) AS technology,

  -- origins summary
  0-COALESCE(total_origins_deprecated_existing, 0) AS total_origins_deprecated_existing,
  0-COALESCE(total_origins_deprecated_gone, 0) AS total_origins_deprecated_gone,

  COALESCE(total_origins_before, 0) - COALESCE(total_origins_deprecated_existing, 0) - COALESCE(total_origins_deprecated_gone, 0) AS total_origins_persisted,

  COALESCE(total_origins_adopted_existing, 0) AS total_origins_adopted_existing,
  COALESCE(total_origins_adopted_new, 0) AS total_origins_adopted_new,

  -- Sample origins
  COALESCE(sample_origins_deprecated_existing, "") AS sample_origins_deprecated_existing,
  --COALESCE(sample_origins_deprecated_gone, "") AS sample_origins_deprecated_gone,

  COALESCE(tech_adopted_existing_origins.sample_origins_adopted_existing, "") AS sample_origins_adopted_existing,
  --COALESCE(tech_adopted_new_origins.sample_origins_adopted_new, "") AS sample_origins_adopted_new

FROM tech_before_summary before_summary
FULL OUTER JOIN tech_adopted_existing_origins
  ON before_summary.technology = tech_adopted_existing_origins.technology
FULL OUTER JOIN tech_adopted_new_origins
  ON before_summary.technology = tech_adopted_new_origins.technology
LEFT JOIN tech_deprecated_existing_origins
  ON before_summary.technology = tech_deprecated_existing_origins.technology
LEFT JOIN tech_deprecated_gone_origins
  ON before_summary.technology = tech_deprecated_gone_origins.technology
FULL OUTER JOIN wappalyzer.apps
  ON before_summary.technology = apps.name
`)
