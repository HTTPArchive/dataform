operate('get_lcp_priority').tags(['functions']).queries(`
CREATE OR REPLACE FUNCTION \`httparchive.fn.GET_LCP_PRIORITY\`(performance_custom_metric STRING)
RETURNS STRING
LANGUAGE js AS """
try {
  const perf = JSON.parse(performance_custom_metric);
  const lcpAttrs = perf.lcp_elem_stats.attributes;
  return lcpAttrs.find(attr => attr.name == 'fetchpriority')?.value;
} catch {
  return null;
}
""";
`)
