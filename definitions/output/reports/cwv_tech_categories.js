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
),categories AS (
  SELECT
    category,
    COUNT(DISTINCT root_page) AS origins
  FROM pages,
    UNNEST(technologies) AS t,
    UNNEST(t.categories) AS category
  GROUP BY category
),
technologies AS (
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
  categories.origins,
  ARRAY_AGG(technology IGNORE NULLS ORDER BY technologies.origins DESC) AS technologies
FROM categories
JOIN technologies
USING (category)
GROUP BY
  category,
  categories.origins
ORDER BY categories.origins DESC
`)
