const issue_month = constants.currentMonth

operate('crawl_page_technologies_patch').queries(ctx => `
CREATE TEMP TABLE crawl_page_technologies_patch AS (
  WITH wappalyzer AS (
    SELECT
      name AS technology,
      categories
    FROM ${ctx.ref('wappalyzer', 'technologies')}
  ), pages AS (
    SELECT
      client,
      page,
      tech.technology,
      tech.categories,
      tech.info
    FROM ${ctx.ref('crawl', 'pages')} AS pages
    LEFT JOIN pages.technologies AS tech
    WHERE date = '${issue_month}' ${constants.devRankFilter}
  ),

  -- Identify impacted pages
  impacted_pages AS (
    SELECT DISTINCT
      client,
      page
    FROM pages
    WHERE
      -- Categories are empty OR the technology is corrupted
      (technology IS NOT NULL AND ARRAY_LENGTH(categories) = 0)
      OR technology NOT IN (SELECT technology FROM wappalyzer)
  ),

  -- Flatten technologies for reconstruction
  flattened_technologies AS (
    SELECT
      client,
      page,
      technology,
      categories,
      info
    FROM pages
    WHERE page IN (SELECT DISTINCT page FROM impacted_pages)
  ),

  -- Reconstruct valid technologies
  reconstructed_technologies AS (
    SELECT
      client,
      page,
      ARRAY_AGG(STRUCT(
        f.technology,
        -- Use the categories from Wappalyzer if the categories are empty
        IF(ARRAY_LENGTH(f.categories) = 0, w.categories, f.categories) AS categories,
        f.info
      )) AS technologies
    FROM flattened_technologies f
    LEFT JOIN wappalyzer w
    ON f.technology = w.technology
    -- Only reconstruct technologies existing in Wappalyzer
    WHERE f.technology IN (SELECT technology FROM wappalyzer)
    GROUP BY
      client,
      page
  )

  SELECT
    client,
    page,
    technologies
  FROM impacted_pages
  LEFT JOIN reconstructed_technologies
  USING (client, page)
);

-- Update the crawl.pages table with the cleaned and restored technologies
UPDATE crawl.pages
SET technologies = crawl_page_technologies_patch.technologies
FROM crawl_page_technologies_patch
WHERE pages.date = '${issue_month}' AND
  pages.client = crawl_page_technologies_patch.client AND
  pages.page = crawl_page_technologies_patch.page;
`)
