const iterations = []

let midMonth
for (
  let date = '2023-03-01';
  date >= '2022-03-01';
  date = constants.fnPastMonth(date)
) {
  iterations.push(date)

  if (date <= '2018-12-01') {
    midMonth = new Date(date)
    midMonth.setDate(15)
    midMonth = midMonth.toISOString().substring(0, 10)

    iterations.push(midMonth)
  }
}

iterations.forEach((date) => {
  operate(`test ${date}`).tags([
    'fix_rank_requests'
  ]).queries(ctx => `
UPDATE httparchive.crawl.requests AS origin
SET origin.rank = updated.rank
FROM (
  SELECT DISTINCT
    COALESCE(crux.page, summary_pages.url) AS page,
    COALESCE(
      crux.rank,
      CASE
        WHEN summary_pages.rank = 0 THEN NULL
        WHEN summary_pages.rank <= 1000 THEN 1000
        WHEN summary_pages.rank <= 5000 THEN 5000
        WHEN summary_pages.rank <= 10000 THEN 10000
        WHEN summary_pages.rank <= 50000 THEN 50000
        WHEN summary_pages.rank <= 100000 THEN 100000
        WHEN summary_pages.rank <= 500000 THEN 500000
        WHEN summary_pages.rank <= 1000000 THEN 1000000
        WHEN summary_pages.rank <= 5000000 THEN 5000000
        WHEN summary_pages.rank <= 10000000 THEN 10000000
        WHEN summary_pages.rank <= 50000000 THEN 50000000
        ELSE NULL
      END
    ) AS rank
  FROM (
    SELECT DISTINCT
      CONCAT(origin, '/') AS page,
      experimental.popularity.rank AS rank
    FROM chrome-ux-report.experimental.global
    WHERE yyyymm = ${constants.fnPastMonth(date).substring(0, 7).replace('-', '')}
  ) AS crux
  FULL OUTER JOIN \`summary_pages.${constants.fnDateUnderscored(date)}_*\` AS summary_pages
  ON crux.page = summary_pages.url
  WHERE crux.rank > 0 OR summary_pages.rank > 0
) AS updated
WHERE date = "${date}"
  AND origin.page = updated.page
  `)
})

/*
iterations.forEach((date) => {
  operate(`test ${date}`).tags([
    'fix_rank_pages'
  ]).queries(ctx => `
UPDATE httparchive.crawl.pages AS origin
SET origin.rank = updated.rank
FROM (
  SELECT DISTINCT
    COALESCE(crux.page, summary_pages.url) AS page,
    COALESCE(
      crux.rank,
      CASE
        WHEN summary_pages.rank = 0 THEN NULL
        WHEN summary_pages.rank <= 1000 THEN 1000
        WHEN summary_pages.rank <= 5000 THEN 5000
        WHEN summary_pages.rank <= 10000 THEN 10000
        WHEN summary_pages.rank <= 50000 THEN 50000
        WHEN summary_pages.rank <= 100000 THEN 100000
        WHEN summary_pages.rank <= 500000 THEN 500000
        WHEN summary_pages.rank <= 1000000 THEN 1000000
        WHEN summary_pages.rank <= 5000000 THEN 5000000
        WHEN summary_pages.rank <= 10000000 THEN 10000000
        WHEN summary_pages.rank <= 50000000 THEN 50000000
        ELSE NULL
      END
    ) AS rank
  FROM (
    SELECT DISTINCT
      CONCAT(origin, '/') AS page,
      experimental.popularity.rank AS rank
    FROM chrome-ux-report.experimental.global
    WHERE yyyymm = ${constants.fnPastMonth(date).substring(0, 7).replace('-', '')}
  ) AS crux
  FULL OUTER JOIN \`summary_pages.${constants.fnDateUnderscored(date)}_*\` AS summary_pages
  ON crux.page = summary_pages.url
  WHERE crux.rank > 0 OR summary_pages.rank > 0
) AS updated
WHERE date = "${date}"
  AND origin.page = updated.page
  `)
})
*/
