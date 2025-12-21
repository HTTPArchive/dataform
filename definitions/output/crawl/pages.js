const columns = descriptions.columns.pages

// See https://github.com/HTTPArchive/dataform/issues/43
assert('corrupted_technology_values')
  .tags(['crawl_complete'])
  .query(ctx => `
SELECT
  /*
    date,
    client,
    tech,
    ARRAY_AGG(DISTINCT page LIMIT 3) AS sample_pages,
  */
  COUNT(DISTINCT page) AS cnt_pages
FROM ${ctx.ref('crawl_staging', 'pages')} AS pages
LEFT JOIN pages.technologies AS tech
LEFT JOIN tech.categories AS category
WHERE
  date = '${constants.currentMonth}' AND
  (
    tech.technology NOT IN (SELECT DISTINCT name FROM wappalyzer.technologies)
    OR category NOT IN (SELECT DISTINCT name FROM wappalyzer.categories)
    OR ARRAY_LENGTH(tech.categories) = 0
  )
/*
GROUP BY
  date,
  client,
  tech
ORDER BY cnt_pages DESC
*/
HAVING cnt_pages > 200
  `)

assert('pages_per_client')
  .tags(['crawl_complete'])
  .query(ctx => `
SELECT
  client,
  COUNT(DISTINCT page) AS cnt_pages
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE
  date = '${constants.currentMonth}'
GROUP BY
  client
HAVING cnt_pages < 20000000
  `)

publish('pages', {
  type: 'incremental',
  protected: true,
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page'],
    requirePartitionFilter: true
  },
  columns: columns,
  tags: ['crawl_complete'],
  dependOnDependencyAssertions: true
}).preOps(ctx => `
${reservations.reservation_setter(ctx)}

DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}' AND
  client = 'desktop';

INSERT INTO ${ctx.self()}
SELECT
  *
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE date = '${constants.currentMonth}' AND
  client = 'desktop'
  ${constants.devRankFilter};

DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}' AND
  client = 'mobile';
`).query(ctx => `
SELECT
  *
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE date = '${constants.currentMonth}' AND
  client = 'mobile'
  ${constants.devRankFilter}
`).postOps(ctx => `
SET @@RESERVATION='none';

CREATE TEMP TABLE technologies_cleaned AS (
  WITH technologies AS (
    SELECT DISTINCT
      name AS technology,
      categories
    FROM ${ctx.ref('wappalyzer', 'technologies')}
  ),

  pages AS (
    SELECT
      client,
      page,
      tech.technology,
      tech.categories,
      tech.info
    FROM ${ctx.self()} AS pages
    LEFT JOIN pages.technologies AS tech
    WHERE date = '${constants.currentMonth}' ${constants.devRankFilter}
  ),

  -- Identify impacted pages
  impacted_pages AS (
    SELECT DISTINCT
      client,
      page
    FROM pages
    LEFT JOIN pages.categories AS category
    WHERE
      -- Technology is corrupted
      technology NOT IN (SELECT DISTINCT technology FROM technologies) OR
      -- Technology's category is corrupted
      CONCAT(technology, category) NOT IN (
        SELECT DISTINCT
          CONCAT(technology, category)
        FROM technologies
        INNER JOIN technologies.categories AS category
      )
  ),

  -- Keep valid technologies and use correct categories
  reconstructed_technologies AS (
    SELECT
      client,
      page,
      ARRAY_AGG(STRUCT(
        pages.technology,
        technologies.categories,
        pages.info
      )) AS technologies
    FROM pages
    INNER JOIN impacted_pages
    USING (client, page)
    INNER JOIN technologies
    USING (technology)
    GROUP BY
      client,
      page
  )

  SELECT
    client,
    page,
    reconstructed_technologies.technologies
  FROM impacted_pages
  LEFT JOIN reconstructed_technologies
  USING(client,page)
);

-- Update the crawl.pages table with the cleaned and restored technologies
UPDATE ${ctx.self()} AS pages
SET technologies = technologies_cleaned.technologies
FROM technologies_cleaned
WHERE pages.date = '${constants.currentMonth}' AND
  pages.client = technologies_cleaned.client AND
  pages.page = technologies_cleaned.page;
`)
