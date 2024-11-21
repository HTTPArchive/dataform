const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('technologies', {
  schema: 'tech_reports',
  tags: ['cwv_tech_report']
}).query(ctx => `
WITH categories AS (
  SELECT
    category,
    COUNT(DISTINCT root_page) AS origins
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies) AS t,
    UNNEST(t.categories) AS category
  WHERE
    date = '${pastMonth}' AND
    client = 'mobile'
    ${constants.devRankFilter}
  GROUP BY category
),
technologies AS (
  SELECT
    category,
    technology,
    COUNT(DISTINCT root_page) AS origins
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies) AS t,
    UNNEST(t.categories) AS category
  WHERE
    date = '${pastMonth}' AND
    client = 'mobile'
    ${constants.devRankFilter}
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
