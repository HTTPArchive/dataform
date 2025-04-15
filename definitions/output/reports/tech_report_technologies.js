const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_technologies', {
  schema: 'reports',
  type: 'table',
  tags: ['tech_report']
}).query(ctx => `
WITH tech_origins AS (
  SELECT
  technology,
  adoption AS origins
FROM ${ctx.ref('reports', 'tech_report_adoption')}
WHERE
  date = '${pastMonth}'
  AND rank = 'ALL'
  AND geo = 'ALL'
  AND version = 'ALL'
  ${constants.devRankFilter}
),

technologies AS (
  SELECT
    name AS technology,
    description,
    icon,
    STRING_AGG(DISTINCT category, ', ' ORDER BY category ASC) AS category,
    categories AS category_obj
  FROM ${ctx.ref('wappalyzer', 'technologies')} AS technologies
  INNER JOIN technologies.categories AS category
  GROUP BY
    technology,
    description,
    categories,
    icon
)

SELECT
  technology,
  description,
  icon,
  category,
  category_obj,
  origins
FROM tech_origins
INNER JOIN technologies
USING(technology)

UNION ALL

SELECT
  technology,
  NULL AS description,
  NULL AS icon,
  NULL AS category,
  NULL AS category_obj,
  origins
FROM tech_origins
WHERE technology = 'ALL'
`).postOps(ctx => `
  SELECT
    reports.run_export_job(
      JSON '''{
        "destination": "firestore",
        "config": {
          "database": "tech-report-api-${constants.environment}",
          "collection": "technologies",
          "type": "dict"
        },
        "query": "SELECT * FROM ${ctx.self()}"
      }'''
    );
  `)
