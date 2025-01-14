const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_categories', {
  schema: 'reports',
  type: 'table',
  tags: ['crux_ready']
}).query(ctx => `
/* {"dataform_trigger": "report_cwv_tech_complete", "name": "categories", "type": "dict"} */
WITH pages AS (
  SELECT
    client,
    root_page,
    technologies
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
),

categories AS (
  SELECT
    client,
    category,
    COUNT(DISTINCT root_page) AS origins
  FROM pages,
    UNNEST(technologies) AS tech,
    UNNEST(tech.categories) AS category
  GROUP BY
    client,
    category
),

technologies AS (
  SELECT
    category,
    technology,
    SUM(origins) AS total_origins
  FROM ${ctx.ref('reports', 'cwv_tech_technologies')}
  GROUP BY
    category,
    technology
)

SELECT
  category,
  STRUCT(
    COALESCE(MAX(IF(categories.client = 'desktop', categories.origins, 0))) AS desktop,
    COALESCE(MAX(IF(categories.client = 'mobile', categories.origins, 0))) AS mobile
  ) AS origins,
  ARRAY_AGG(technology IGNORE NULLS ORDER BY total_origins DESC) AS technologies
FROM categories
INNER JOIN technologies
USING (category)
GROUP BY
  category
ORDER BY category ASC
`)
