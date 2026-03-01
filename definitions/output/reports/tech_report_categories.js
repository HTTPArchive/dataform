const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_categories', {
  schema: 'reports',
  type: 'table',
  tags: ['crux_ready']
}).query(ctx => `
WITH pages AS (
  SELECT DISTINCT
    client,
    category,
    root_page
  FROM ${ctx.ref('crawl', 'pages')} AS pages
  INNER JOIN pages.technologies AS tech
  INNER JOIN tech.categories AS category
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
),

category_descriptions AS (
  SELECT
    name AS category,
    description
  FROM ${ctx.ref('wappalyzer', 'categories')}
),

crux AS (
  SELECT
    IF(device = 'desktop', 'desktop', 'mobile') AS client,
    CONCAT(origin, '/') AS root_page
  FROM ${ctx.ref('chrome-ux-report', 'materialized', 'device_summary')}
  WHERE
    date = '${pastMonth}'
    AND device IN ('desktop', 'phone')
),

merged_pages AS (
  SELECT DISTINCT
    client,
    category,
    root_page
  FROM pages
  INNER JOIN crux
  USING (client, root_page)
),

category_stats AS (
  SELECT
    client,
    category,
    COUNT(DISTINCT root_page) AS origins
  FROM merged_pages
  GROUP BY
    client,
    category
),

technology_stats AS (
  SELECT
    category,
    STRUCT(
      ARRAY_AGG(technology IGNORE NULLS ORDER BY origins.mobile DESC) AS mobile,
      ARRAY_AGG(technology IGNORE NULLS ORDER BY origins.desktop DESC) AS desktop
    ) AS technologies
  FROM ${ctx.ref('reports', 'tech_report_technologies')},
    UNNEST(category_obj) AS category
  GROUP BY category
)

SELECT
  client,
  category,
  description,
  origins,
  IF(
    client = 'mobile',
    technologies.mobile,
    technologies.desktop
  ) AS technologies
FROM category_stats
INNER JOIN technology_stats
USING (category)
INNER JOIN category_descriptions
USING (category)

UNION ALL

SELECT
  client,
  'ALL' AS category,
  NULL AS description,
  COUNT(DISTINCT root_page) AS origins,
  NULL AS technologies
FROM merged_pages
GROUP BY client
`).postOps(ctx => `
SELECT
  reports.run_export_job(
    JSON '''{
      "destination": "firestore",
      "config": {
        "database": "tech-report-api-${constants.environment}",
        "collection": "categories",
        "type": "dict"
      },
      "query": "SELECT * FROM ${ctx.self()}"
    }'''
  );
`)
