# Dataform Service Merge - Summary

## What Was Created

I've successfully merged the `dataform-trigger` and `dataform-export` services into a unified `dataform-service` with path-based routing.

### New Service Structure

```
/infra/dataform-service/
├── index.js              # Main service with /trigger and /export endpoints
├── dataform.js           # Dataform client utilities (converted to ES modules)
├── package.json          # Combined dependencies from both services
├── Dockerfile            # Docker configuration
├── cloudbuild.yaml       # Cloud Build configuration
├── README.md             # Service documentation
├── MIGRATION.md          # Detailed migration guide
└── examples.js           # Usage examples
```

### New Terraform Configuration

```
/infra/tf/dataform_service/
├── main.tf               # Unified infrastructure configuration
└── variables.tf          # Variable definitions
```

## Key Features

### Path-Based Routing
- **`/trigger`** - Handles Dataform workflow triggers (Pub/Sub events, scheduler)
- **`/export`** - Handles BigQuery export jobs (remote functions)

### Unified Functionality
- Combined all trigger logic (crux_ready, crawl_complete events)
- Combined all export logic (BigQuery to various destinations)
- Shared dependencies and infrastructure
- Single Docker image and deployment

### Infrastructure Updates
- Pub/Sub subscriptions point to `/trigger` endpoint
- BigQuery remote functions point to `/export` endpoint
- Cloud Scheduler jobs point to `/trigger` endpoint
- Single Cloud Run service with appropriate memory allocation

## Next Steps

1. **Deploy the new service:**
   ```bash
   cd infra/dataform-service
   gcloud builds submit --config cloudbuild.yaml
   ```

2. **Update Terraform to use the new module:**
   ```terraform
   module "dataform_service" {
     source = "./dataform_service"
     # ... variables
   }
   ```

3. **Test both endpoints** using the examples in `examples.js`

4. **Monitor the service** to ensure both functionalities work correctly

The original services have been marked with migration notes but are preserved for rollback if needed.
