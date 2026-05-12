const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_technologies_flat', {
  schema: 'reports',
  type: 'table',
  tags: ['crux_ready']
}).query(ctx => `
WITH tech_origins AS (
  SELECT
    technology,
    MAX(IF(client = 'desktop', origins, 0)) AS desktop_origins,
    MAX(IF(client = 'mobile', origins, 0)) AS mobile_origins
  FROM ${ctx.ref('reports', 'tech_report_adoption_flat')}
  WHERE
    date = '${pastMonth}'
    AND rank = 'ALL'
    AND geo = 'ALL'
    AND version = 'ALL'
    ${constants.devRankFilter}
  GROUP BY technology
),

technologies AS (
  SELECT
    name AS technology,
    description,
    icon,
    STRING_AGG(DISTINCT category, ', ' ORDER BY category ASC) AS category
  FROM ${ctx.ref('wappalyzer', 'technologies')} AS technologies
  INNER JOIN technologies.categories AS category
  GROUP BY
    technology,
    description,
    icon
)

SELECT
  technology,
  description,
  icon,
  category,
  desktop_origins,
  mobile_origins
FROM tech_origins
INNER JOIN technologies
USING(technology)

UNION ALL

SELECT
  technology,
  NULL AS description,
  NULL AS icon,
  NULL AS category,
  desktop_origins,
  mobile_origins
FROM tech_origins
WHERE technology = 'ALL'
`)
