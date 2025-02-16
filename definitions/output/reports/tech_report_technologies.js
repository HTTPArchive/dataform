const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_technologies', {
  schema: 'reports',
  type: 'table',
  tags: ['tech_report']
}).query(ctx => `
/* {"dataform_trigger": "tech_report_complete", "name": "technologies", "type": "dict"} */
WITH pages AS (
  SELECT DISTINCT
    client,
    root_page,
    tech.technology
  FROM ${ctx.ref('crawl', 'pages')} AS pages
  INNER JOIN pages.technologies AS tech
  WHERE
    date = '${pastMonth}'
    ${constants.devRankFilter}
),

tech_origins AS (
  SELECT
    technology,
    STRUCT(
      MAX(IF(client = 'desktop', origins, 0)) AS desktop,
      MAX(IF(client = 'mobile', origins, 0)) AS mobile
    ) AS origins
  FROM (
    SELECT
      client,
      technology,
      COUNT(DISTINCT root_page) AS origins
    FROM pages
    GROUP BY
      client,
      technology
  )
  GROUP BY technology
),

technologies AS (
  SELECT
    name AS technology,
    description,
    STRING_AGG(DISTINCT category, ', ' ORDER BY category ASC) AS category,
    categories AS category_obj
  FROM ${ctx.ref('wappalyzer', 'technologies')} AS technologies
  INNER JOIN technologies.categories AS category
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
  technology,
  description,
  category,
  category_obj,
  origins
FROM tech_origins
INNER JOIN technologies
USING(technology)

UNION ALL

SELECT
  'ALL' AS technology,
  NULL AS description,
  NULL AS category,
  NULL AS category_obj,
  STRUCT(
    MAX(IF(client = 'desktop', origins, 0)) AS desktop,
    MAX(IF(client = 'mobile', origins, 0)) AS mobile
  ) AS origins
FROM total_pages
`)
