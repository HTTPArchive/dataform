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
    technology,
    COUNT(DISTINCT origin) AS origins
  FROM pages,
    UNNEST(technologies) AS tech,
    UNNEST(tech.categories) AS category
  GROUP BY
    client,
    category,
    technology
)

SELECT
  client,
  category,
  categories.origins,
  ARRAY_AGG(technology IGNORE NULLS ORDER BY technologies.origins DESC) AS technologies
FROM categories
INNER JOIN technologies
USING (category)
GROUP BY
  client,
  category,
  categories.origins
ORDER BY categories.origins DESC
`)
