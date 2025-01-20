const month = constants.currentMonth

// Restore categories for valid technologies
operate('crawl_page_categories_clean').queries(ctx => `
WITH wappalyzer AS (
  SELECT
    name as technology,
    categories
  FROM ${ctx.ref('wappalyzer', 'technologies')}
), pages AS (
  SELECT
    client,
    page,
    tech.technology,
    tech.categories,
    tech.info
  FROM ${ctx.ref('crawl', 'pages')}
  LEFT JOIN pages.technologies AS tech
  WHERE date = '${month}'
    ${constants.devRankFilter}
), impacted_pages AS (
  SELECT DISTINCT
    client,
    page
  FROM pages
  WHERE
    technology IS NOT NULL AND
    ARRAY_LENGTH(categories) = 0
), repaired AS (
  SELECT
    client,
    page,
    ARRAY_AGG(STRUCT(
      pages.technology,
      wappalyzer.categories,
      pages.info
    )) AS technologies
  FROM pages
  INNER JOIN impacted_pages
  USING (client, page)
  LEFT JOIN wappalyzer
  ON pages.technology = wappalyzer.technology
  GROUP BY 1,2
)

SELECT
  client,
  page,
  technologies
FROM repaired
`)

// Cleanup corrupted technologies
operate('crawl_page_categories_clean').queries(ctx => `
CREATE TEMP TABLE technologies_cleaned AS (
  WITH wappalyzer AS (
    SELECT
      name as technology,
      category
    FROM ${ctx.ref('wappalyzer', 'apps')}
    LEFT JOIN apps.categories AS category
  ), pages AS (
    SELECT
      date,
      client,
      page,
      technologies
    FROM ${ctx.ref('crawl', 'pages')}
    WHERE date = '${month}'
  ), impacted_pages AS (
    SELECT DISTINCT
      date,
      client,
      page
    FROM pages
    LEFT JOIN pages.technologies AS tech,
    LEFT JOIN tech.categories AS category
    LEFT JOIN wappalyzer
    USING (technology, category)
    WHERE wappalyzer.technology IS NULL
  ), flattened_technologies AS (
    SELECT
      date,
      client,
      page,
      technology,
      category,
      info
    FROM pages
    LEFT JOIN pages.technologies AS tech
    LEFT JOIN tech.categories AS category
    WHERE page IN (SELECT DISTINCT page FROM impacted_pages)
  ), whitelisted_technologies AS (
    SELECT
      date,
      client,
      page,
      f.technology,
      f.category,
      f.info
    FROM flattened_technologies f
    INNER JOIN wappalyzer
    USING (technology, category)
  ), reconstructed_technologies AS (
    SELECT
      date,
      client,
      page,
      ARRAY_AGG(STRUCT(
        technology,
        categories,
        info
      )) AS technologies
    FROM (
      SELECT
        date,
        client,
        page,
        technology,
        ARRAY_AGG(DISTINCT category IGNORE NULLS) AS categories,
        info
      FROM whitelisted_technologies
      GROUP BY date, client, page, technology, info
    )
    GROUP BY date, client, page
  )

  SELECT
    date,
    client,
    page,
    r.technologies
  FROM impacted_pages
  LEFT JOIN reconstructed_technologies r
  USING (date, client, page)
);

UPDATE crawl.pages
SET technologies = technologies_cleaned.technologies
FROM technologies_cleaned
WHERE pages.date = crawl_month AND
  pages.client = technologies_cleaned.client AND
  pages.page = technologies_cleaned.page;
`)
