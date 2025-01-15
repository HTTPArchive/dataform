const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_technologies', {
  schema: 'reports',
  type: 'table',
  tags: ['crux_ready']
}).query(ctx => `
/* {"dataform_trigger": "report_cwv_tech_complete", "name": "technologies", "type": "dict"} */
WITH pages AS (
  SELECT DISTINCT
    client,
    root_page,
    tech.technology
  FROM ${ctx.ref('crawl', 'pages')},
    UNNEST(technologies) AS tech
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
),

tech_origins AS (
  SELECT
    client,
    technology,
    COUNT(DISTINCT root_page) AS origins
  FROM pages
  GROUP BY
    client,
    technology
),

technologies AS (
  SELECT
    name AS technology,
    description,
    STRING_AGG(DISTINCT category, ', ' ORDER BY category ASC) AS category,
    categories AS category_obj,
    NULL AS similar_technologies
  FROM ${ctx.ref('wappalyzer', 'apps')},
    UNNEST(categories) AS category
  GROUP BY
    technology,
    description,
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
  client,
  technology,
  description,
  category,
  category_obj,
  similar_technologies,
  origins
FROM tech_origins
INNER JOIN technologies
USING(technology)

UNION ALL

SELECT
  client,
  'ALL' AS technology,
  NULL AS description,
  NULL AS category,
  NULL AS category_obj,
  NULL AS similar_technologies,
  origins
FROM total_pages
`)
