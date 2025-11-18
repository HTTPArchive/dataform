SELECT * FROM `httparchive.region-us.INFORMATION_SCHEMA.EFFECTIVE_PROJECT_OPTIONS`;

ALTER PROJECT httparchive SET OPTIONS (
  `region-us.default_sql_dialect_option` = 'only_google_sql',
  `region-us.default_query_optimizer_options` = 'adaptive=on',
  `region-US.query_runtime` = 'advanced',
  `region-US.enable_reservation_based_fairness` = 'true'
);
