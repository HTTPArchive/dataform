const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_categories', {
  schema: 'reports',
  type: 'table',
  tags: ['cwv_tech_report']
}).query(ctx => `
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
  ARRAY_AGG(technology ORDER BY technologies.origins DESC) AS technologies
FROM categories
JOIN technologies
USING (category)
GROUP BY
  category,
  categories.origins
ORDER BY categories.origins DESC
`)
