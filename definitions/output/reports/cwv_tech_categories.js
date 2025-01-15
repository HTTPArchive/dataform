const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_categories', {
  schema: 'reports',
  type: 'table',
  tags: ['crux_ready']
}).query(ctx => `
/* {"dataform_trigger": "report_cwv_tech_complete", "name": "categories", "type": "dict"} */
WITH pages AS (
  SELECT
    root_page,
    technologies
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${pastMonth}' AND
    client = 'mobile'
    ${constants.devRankFilter}
), categories AS (
  SELECT
    name AS category,
    description
  FROM ${ctx.ref('wappalyzer', 'categories')}
), category_stats AS (
  SELECT
    category,
    COUNT(DISTINCT root_page) AS origins
  FROM pages,
    UNNEST(technologies) AS t,
    UNNEST(t.categories) AS category
  GROUP BY category
), technology_stats AS (
  SELECT
    category,
    technology,
    COUNT(DISTINCT root_page) AS origins
  FROM pages,
    UNNEST(technologies) AS t,
    UNNEST(t.categories) AS category
  GROUP BY
    category,
    technology
)

SELECT
  category,
  description,
  category_stats.origins,
  ARRAY_AGG(technology IGNORE NULLS ORDER BY technology_stats.origins DESC) AS technologies
FROM category_stats
INNER JOIN technology_stats
USING (category)
LEFT JOIN categories
USING (category)
GROUP BY
  category,
  description,
  origins
ORDER BY origins DESC
`)
