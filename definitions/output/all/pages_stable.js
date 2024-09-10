operate(`all_pages_stable_alter_pre`).tags(
  ["all_pages_stable"]
).queries(ctx => `
ALTER TABLE ${ctx.ref("all", "pages")}
ADD COLUMN IF NOT EXISTS custom_metrics_struct STRUCT<javascript STRING, media STRING, performance STRING, other STRING> OPTIONS(description="Custom metrics from WebPageTest")
`);

let month = '2024-08-01';
while (month >= '2022-07-01') {
  operate(`all_pages_stable_update ${month}`, {
    hasOutput: true
  }).tags(
    ["all_pages_stable"]
  ).queries(ctx => `
CREATE TEMP FUNCTION GET_CUSTOM_METRICS(custom_metrics STRING)
RETURNS STRUCT<performance STRING, other STRING> LANGUAGE js AS '''
  const topLevelMetrics = new Set(['performance', 'javascript', 'media']);
  try {
    custom_metrics = JSON.parse(custom_metrics);
  } catch {
    return custom_metrics;
  }

  if (!custom_metrics) {
    return custom_metrics;
  }

  custom_metrics_struct = {};
  for (const metric of topLevelMetrics) {
    if (!custom_metrics[metric]) {
      custom_metrics_struct[metric] = null;
    } else {
      custom_metrics_struct[metric] = JSON.stringify(custom_metrics[metric]);
      delete custom_metrics[metric];
    }
  }

  custom_metrics_struct["other"] = JSON.stringify(custom_metrics);

  return custom_metrics_struct
''';

CREATE TEMP FUNCTION PRUNE_OBJECT(
  json_str STRING,
  keys_to_remove ARRAY<STRING>
) RETURNS STRING
LANGUAGE js AS """
  try {
    var jsonObject = JSON.parse(json_str);
    keys_to_remove.forEach(function(key) {
      delete jsonObject[key];
    });
    return JSON.stringify(jsonObject);
  } catch (e) {
    return json_str;
  }
""";

UPDATE ${ctx.ref("all", "pages")}
SET summary = PRUNE_OBJECT(summary, ["metadata", "pageid", "createDate", "startedDateTime", "archive", "label", "crawlid", "url", "urlhash", "urlShort", "wptid", "wptrun", "rank", "PageSpeed", "_adult_site", "avg_dom_depth", "doctype", "document_height", "document_width", "localstorage_size", "sessionstorage_size", "meta_viewport", "num_iframes", "num_scripts", "num_scripts_sync", "num_scripts_async", "usertiming"]),
    custom_metrics_struct = GET_CUSTOM_METRICS(custom_metrics)
WHERE date = '${month}';
  `)

  month = constants.fn_past_month(month)
  month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6)
}


operate(`all_pages_stable_alter_post`).tags(
  ["all_pages_stable"]
).queries(ctx => `
ALTER TABLE ${ctx.ref("all", "pages")}
DROP COLUMN IF EXISTS custom_metrics;

ALTER TABLE ${ctx.ref("all", "pages")}
RENAME COLUMN custom_metrics_struct TO custom_metrics
`);
