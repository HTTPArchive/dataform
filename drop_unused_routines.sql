-- ==============================================================================
-- Unused BigQuery Routines Deletion Script
--
-- Analyzed across:
--   1. Dataform pipelines (`HTTPArchive/dataform`)
--   2. Web Almanac chapters (`HTTPArchive/almanac.httparchive.org`)
--   3. Official HTTP Archive documentation (`HTTPArchive/httparchive.org`)
--   4. 180-day BigQuery job history in project `httparchive`
--   5. Public community repositories on GitHub
--
-- Retained & Migrated to Dataform (output/fn/):
--   - httparchive.fn.getA11yScore
--   - httparchive.fn.CAPO
--   - httparchive.fn.GET_HOST_CATEGORIES
--   - httparchive.fn.GET_ORIGIN
--   - httparchive.fn.GET_LCP_LAZY
--   - httparchive.fn.GET_LCP_PRIORITY
--
-- DO NOT EXECUTE AUTOMATICALLY - Review before running.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Unused routines in dataset `httparchive.fn` (3 routines)
--    Reason: No pipeline usage, no documentation, no queries in 180+ days.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS `httparchive.fn.GET_BROWSING_TOPIC`;
DROP FUNCTION IF EXISTS `httparchive.fn.PARSE_MAJOR_VERSION`;
DROP FUNCTION IF EXISTS `httparchive.fn.PARSE_SERVER_TIMING_HEADER`;

-- ------------------------------------------------------------------------------
-- 2. Routines in dataset `httparchive.core_web_vitals` (12 routines)
--    Reason: Undocumented legacy helper functions; modern HTTP Archive tables
--            contain parsed/native CWV fields and raw JSON metrics.
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.CALC_PCT_DIFF`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_AUDITS`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_CRUX_CLS`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_CRUX_FID`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_CRUX_INP`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_CRUX_LCP`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_CRUX_TTFB`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_CWV`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_LAB_CLS`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_LAB_LCP`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_LAB_TBT`;
DROP FUNCTION IF EXISTS `httparchive.core_web_vitals.GET_LAB_TTFB`;
