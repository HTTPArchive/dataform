const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_categories', {
  schema: 'reports',
  type: 'table',
  tags: ['crux_ready']
}).query(ctx => `
WITH pages AS (
  SELECT DISTINCT
    client,
    root_page,
    technologies
  FROM ${ctx.ref('crawl', 'pages')}
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
    technologies,
    root_page
  FROM pages
  INNER JOIN crux
  USING (client, root_page)
),

category_stats AS (
  SELECT
    category,
    STRUCT(
      MAX(IF(client = 'desktop', origins, 0)) AS desktop,
      MAX(IF(client = 'mobile', origins, 0)) AS mobile
    ) AS origins
  FROM (
    SELECT
      client,
      category,
      COUNT(DISTINCT root_page) AS origins
    FROM merged_pages
    INNER JOIN merged_pages.technologies AS tech
    INNER JOIN tech.categories AS category
    WHERE
      category IS NOT NULL
    GROUP BY
      client,
      category
  )
  GROUP BY category
),

technology_stats AS (
  SELECT
    technology,
    category_obj AS categories,
    SUM(origins.mobile + origins.desktop) AS total_origins
  FROM ${ctx.ref('reports', 'tech_report_technologies')}
  GROUP BY
    technology,
    categories
)

SELECT
  category,
  description,
  origins,
  ARRAY_AGG(technology IGNORE NULLS ORDER BY technology_stats.total_origins DESC) AS technologies
FROM category_stats
INNER JOIN technology_stats
ON category_stats.category IN UNNEST(technology_stats.categories)
INNER JOIN category_descriptions
USING (category)
GROUP BY
  category,
  description,
  origins

UNION ALL

SELECT
  'ALL' AS category,
  NULL AS description,
  STRUCT(
    MAX(IF(client = 'desktop', origins, 0)) AS desktop,
    MAX(IF(client = 'mobile', origins, 0)) AS mobile
  ) AS origins,
  NULL AS technologies
FROM (
  SELECT
    client,
    COUNT(DISTINCT root_page) AS origins
  FROM merged_pages
  GROUP BY client
)
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
