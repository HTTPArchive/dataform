const past_month = constants.fn_past_month(constants.current_month);

publish("meta_technologies", {
    type: "table",
    description: "Used in dashboard: https://lookerstudio.google.com/u/7/reporting/1jh_ScPlCIbSYTf2r2Y6EftqmX9SQy4Gn/page/p_an38lbzywc/edit",
    schema: "scratchspace",
    tags: ["crawl_results_all"]
}).query(ctx => `
WITH tech_report AS (
  SELECT
    date,
    tech.technology,
    tech.info,
    root_page,
    COUNT(DISTINCT root_page) OVER (PARTITION BY date, tech.technology) AS pages_per_tech
  FROM ${ctx.resolve('all', 'pages')},
    UNNEST (technologies) AS tech
  WHERE
    (date = "${past_month}" OR date = "${constants.current_month}")
    AND client = 'mobile'
), report_agg AS (
  SELECT
    technology,
    info,
    ANY_VALUE(IF(date = "${past_month}", pages_per_tech, NULL)) AS pages_tech_before,
    ANY_VALUE(IF(date = "${constants.current_month}", pages_per_tech, NULL)) AS pages_tech_current,
    COUNT(DISTINCT IF(date = "${past_month}", root_page, NULL)) AS pages_info_before,
    COUNT(DISTINCT IF(date = "${constants.current_month}", root_page, NULL)) AS pages_info_current,
  FROM tech_report
  GROUP BY 1,2
), tech_list AS (
  SELECT
    DISTINCT name AS technology
  FROM wappalyzer.apps
)

SELECT
  COALESCE(tech_list.technology, report_agg.technology) AS technology,
  report_agg.info,
  pages_tech_before,
  pages_tech_current,
  pages_info_before,
  pages_info_current,
  1 - SAFE_DIVIDE(pages_tech_before, pages_tech_current) AS pages_tech_diff_pct
FROM tech_list
FULL OUTER JOIN report_agg
USING(technology)
ORDER BY
  pages_tech_current DESC
`);
