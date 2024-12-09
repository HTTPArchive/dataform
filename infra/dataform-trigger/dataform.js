const { DataformClient } = require('@google-cloud/dataform').v1beta1

const dataformClient = new DataformClient()

/**
 * Get Dataform compilation result.
 *
 * @param {string} repoURI Dataform repository URI.
 * @returns {object} Compilation result.
 */
async function getCompilationResults (repoURI) {
  const request = {
    parent: repoURI,
    compilationResult: {
      releaseConfig: `${repoURI}/releaseConfigs/production`
    }
  }

  console.info(`Creating Dataform compilation result: ${JSON.stringify(request, null, 2)}`)
  const [response] = await dataformClient.createCompilationResult(request)
  console.info(`Compilation result created: ${response.name}`)
  return response.name
}

/**
 * Run Dataform workflow.
 *
 * @param {string} repoURI Dataform repository URI.
 * @param {string} compilationResult Dataform compilation result.
 * @param {object} tags Dataform tags.
 * @returns
 */
async function runWorkflow (repoURI, compilationResult, tags) {
  const request = {
    parent: repoURI,
    workflowInvocation: {
      compilationResult,
      invocationConfig: {
        includedTags: tags,
        fullyRefreshIncrementalTablesEnabled: false,
        transitiveDependenciesIncluded: false,
        transitiveDependentsIncluded: false
      }
    }
  }

  console.info(`Invoking Dataform workflow: ${JSON.stringify(request, null, 2)}`)
  const [response] = await dataformClient.createWorkflowInvocation(request)
  console.info(`Workflow invoked: ${response.name}`)
}

module.exports = { getCompilationResults, runWorkflow }
