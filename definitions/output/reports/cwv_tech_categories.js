const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_categories', {
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

category_stats AS (
  SELECT
    category,
    STRUCT(
      COALESCE(MAX(IF(client = 'desktop', origins, 0))) AS desktop,
      COALESCE(MAX(IF(client = 'mobile', origins, 0))) AS mobile
    ) AS origins
  FROM (
    SELECT
      client,
      category,
      COUNT(DISTINCT root_page) AS origins
    FROM pages
    LEFT JOIN pages.technologies AS tech
    LEFT JOIN tech.categories AS category
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
    SUM(origins.dektop + origins.mobile) AS total_origins
  FROM ${ctx.ref('reports', 'cwv_tech_technologies')}
  GROUP BY
    technology,
    categories
),

total_pages AS (
  SELECT
    client,
    COUNT(DISTINCT root_page) AS origins
  FROM pages
  GROUP BY client
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
    COALESCE(MAX(IF(client = 'desktop', origins, 0))) AS desktop,
    COALESCE(MAX(IF(client = 'mobile', origins, 0))) AS mobile
  ) AS origins,
  NULL AS technologies
FROM total_pages
`).postOps(ctx => `
  SELECT
    reports.run_export_job(
      JSON '''{
        "destination": "firestore",
        "config": {
          "database": "tech-report-apis-${constants.environment}",
          "collection": "categories",
          "type": "dict"
        },
        "query": "SELECT * FROM ${ctx.self()}"
      }'''
    );
  `)
