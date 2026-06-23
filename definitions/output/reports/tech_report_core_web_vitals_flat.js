const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_core_web_vitals_flat', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'rank', 'geo', 'technology']
  },
  tags: ['crux_ready']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
SELECT
  date,
  client,
  geo,
  rank,
  technology,
  version,
  crux.origins_with_good_cwv AS good_cwv,
  crux.origins_eligible_for_cwv AS eligible_cwv,
  crux.origins_with_good_lcp AS good_lcp,
  crux.origins_with_any_lcp AS any_lcp,
  crux.origins_with_good_cls AS good_cls,
  crux.origins_with_any_cls AS any_cls,
  crux.origins_with_good_fid AS good_fid,
  crux.origins_with_any_fid AS any_fid,
  crux.origins_with_good_fcp AS good_fcp,
  crux.origins_with_any_fcp AS any_fcp,
  crux.origins_with_good_ttfb AS good_ttfb,
  crux.origins_with_any_ttfb AS any_ttfb,
  crux.origins_with_good_inp AS good_inp,
  crux.origins_with_any_inp AS any_inp
FROM ${ctx.ref('reports', 'tech_crux')}
WHERE date = '${pastMonth}'
`)
