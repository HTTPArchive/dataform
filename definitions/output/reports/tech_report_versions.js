const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_versions', {
  schema: 'reports',
  type: 'table',
  tags: ['tech_report']
}).query(ctx => `
/* {"dataform_trigger": "tech_report_complete", "name": "versions", "type": "dict"} */
WITH pages AS (
  SELECT DISTINCT
    client,
    root_page,
    tech.technology,
    REGEXP_EXTRACT_ALL(version, r'(0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)')[SAFE_OFFSET(0)] AS version
  FROM ${ctx.ref('crawl', 'pages')} AS pages
  INNER JOIN pages.technologies AS tech
  LEFT JOIN tech.info AS version
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter} AND
    tech.technology IS NOT NULL
),

version_origins AS (
  SELECT
    client,
    technology,
    version,
    COUNT(DISTINCT root_page) AS origins
  FROM pages
  WHERE version IS NOT NULL
  GROUP BY
    client,
    technology,
    version
),

total_origins AS (
  SELECT
    client,
    technology,
    COUNT(DISTINCT root_page) AS origins
  FROM pages
  GROUP BY
    client,
    technology
)

SELECT
  client,
  technology,
  version,
  origins
FROM version_origins

UNION ALL

SELECT
  client,
  technology,
  'ALL' AS version,
  origins
FROM total_origins
`)
