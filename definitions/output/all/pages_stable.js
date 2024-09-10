let month = '2024-08-01',
    month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6);

while (month >= '2022-07-01') {
  operate(`all_pages_stable ${month}`, {
    hasOutput: true
  }).tags(
    ["all_pages_stable"]
  ).queries(ctx => `
CREATE TEMP FUNCTION GET_CUSTOM_METRICS(custom_metrics STRING)
RETURNS STRUCT<performance STRING, other STRING> LANGUAGE js AS '''
  const topLevelMetrics = new Set([
    'performance'
  ]);
  try {
    custom_metrics = JSON.parse(custom_metrics);
  } catch {
    return {};
  }

  if (!custom_metrics) {
    return {};
  }

  const performance = JSON.stringify(custom_metrics.performance);
  delete custom_metrics.performance;

  const other = JSON.stringify(custom_metrics);

  return {
    performance,
    other
  }
''';

UPDATE ${ctx.ref("all", "pages")}
SET summary = ,
    custom_metrics = GET_CUSTOM_METRICS(custom_metrics)
WHERE date = '${month}'
  `)

  month = constants.fn_past_month(month)
  month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6)
}
