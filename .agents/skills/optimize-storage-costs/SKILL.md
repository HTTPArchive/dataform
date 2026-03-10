---
name: optimize-storage-costs
description: Optimize BigQuery storage costs by identifying and removing dead-end and unused tables. USE FOR analyzing storage waste, reviewing tables with no consumption, cleaning up unused datasets, or implementing storage cost reduction strategies.
---

# Optimize Storage Costs (Dead-end and Unused Tables)

## Purpose

Identify and remove BigQuery tables that contribute to storage costs but have no active consumption, based on Masthead Data lineage analysis.

## Table Categories

| Type | Definition | Indicators |
|------|------------|------------|
| **Dead-end** | Regularly updated, no downstream consumption | Updated but never read in 30+ days |
| **Unused** | No upstream or downstream activity | No reads/writes in 30+ days |

## When to Use

- Reducing storage costs when budget is constrained
- Cleaning up abandoned tables and pipelines
- Implementing regular storage hygiene
- Investigating sudden storage cost increases

## Prerequisites

- Masthead Data agent v0.2.7+ installed (for accurate lineage)
- Access to Masthead insights dataset: `masthead-prod.{DATASET_NAME}.insights`
- BigQuery permissions to query insights and drop tables

## Implementation Steps

### Step 1: Query Storage Waste

```bash
bq query --project_id=YOUR_PROJECT --use_legacy_sql=false --format=csv \
"SELECT
  subtype,
  project_id,
  target_resource,
  SAFE.STRING(operations[0].resource_type) AS resource_type,
  SAFE.INT64(overview.num_bytes) / POW(1024, 4) AS total_tib,
  SAFE.FLOAT64(overview.cost_30d) AS cost_usd_30d,
  SAFE.FLOAT64(overview.savings_30d) AS savings_usd_30d
FROM \`masthead-prod.{DATASET_NAME}.insights\`
WHERE category = 'Cost'
  AND subtype IN ('Dead end table', 'Unused table')
  AND overview.num_bytes IS NOT NULL
  AND SAFE.FLOAT64(overview.savings_30d) > 10
ORDER BY total_tib DESC" > storage_waste.csv
```

**Alternative: Use Masthead UI**
- Navigate to [Dictionary page](https://app.mastheadata.com/dictionary?tab=Tables&deadEnd=true)
- Filter by `Dead-end` or `Unused` labels
- Export table list for review

### Step 2: Review and Decide

Review `storage_waste.csv` and add a `status` column with values:
- `keep` - Table is needed
- `to drop` - Safe to remove
- `investigate` - Needs further analysis

**Review criteria:**
- Is this a backup or archive table? (consider alternative storage)
- Is there a downstream dependency not captured in lineage?
- Is this table part of an active experiment or migration?

### Step 3: Drop Approved Tables

```bash
# Generate DROP statements
awk -F',' '$NF=="to drop" {
  print "bq rm -f -t " $4
}' storage_waste.csv > drop_tables.sh

# Review generated commands
cat drop_tables.sh

# Execute (after review!)
bash drop_tables.sh
```

**Safe mode (dry-run first):**
```bash
# Add --dry-run flag to each command
sed 's/bq rm/bq rm --dry-run/' drop_tables.sh > drop_tables_dryrun.sh
bash drop_tables_dryrun.sh
```

### Step 4: Verify Savings

After 24-48 hours, check storage reduction in Masthead:
- [Storage Cost Insights](https://app.mastheadata.com/costs?tab=Storage+costs)
- Compare before/after storage size and costs

## Alternative: Notebook-based Workflow

For interactive review with Google Sheets integration:

1. Use notebook at: `github.com/masthead-data/templates/blob/main/notebooks/save_on_unused_storage.ipynb`
2. Export results to Google Sheets for team review
3. Pull back reviewed data and execute drops

## Decision Framework

| Monthly Savings | Action |
|-----------------|--------|
| < $10 | Consider keeping (low ROI) |
| $10-$100 | Review and drop if unused |
| $100-$1000 | Priority review, likely drop |
| > $1000 | Immediate investigation required |

## Key Notes

- **Dead-end tables** may indicate pipeline issues - investigate before dropping
- Tables can be restored from time travel (7 days) or fail-safe (7 days after time travel)
- Consider archiving to Cloud Storage if compliance requires retention
- Coordinate with data teams before dropping shared datasets
- Wait 14 days after storage billing model changes before dropping tables

## Related Optimizations

- **Storage billing model**: Switch between Logical/Physical pricing (see docs)
- **Table expiration**: Set automatic expiration for temporary tables
- **Partitioning**: Use partitioned tables with expiration policies

## Documentation

- [Masthead Storage Costs](https://docs.mastheadata.com/cost-insights/storage-costs)
- [BigQuery Storage Pricing](https://cloud.google.com/bigquery/pricing#storage)
