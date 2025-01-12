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
    root_page AS origin,
    technologies
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
), categories AS (
  SELECT
    client,
    category,
    COUNT(DISTINCT origin) AS origins
  FROM pages,
    UNNEST(technologies) AS tech,
    UNNEST(tech.categories) AS category
  GROUP BY
    client,
    category
), technologies AS (
  SELECT
    client,
    category,
    ARRAY_AGG(DISTINCT technology IGNORE NULLS ORDER BY origins DESC) AS technologies
  FROM ${ctx.ref('reports', 'cwv_tech_technologies')}
  GROUP BY
    client,
    category
  HAVING client = 'mobile'
)

SELECT
  category,
  STRUCT(
    COALESCE(MAX(IF(categories.client = 'desktop', origins, 0))) AS desktop,
    COALESCE(MAX(IF(categories.client = 'mobile', origins, 0))) AS mobile
  ) AS origins,
  technologies
FROM categories
INNER JOIN technologies
USING (category)
GROUP BY
  category,
  origins
ORDER BY origins DESC
`)
