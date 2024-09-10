const { DataformClient } = require('@google-cloud/dataform').v1beta1;

const dataformClient = new DataformClient();

/**
 * Get Dataform compilation result.
 *
 * @param {string} repoURI Dataform repository URI.
 * @returns {object} Compilation result.
 */
async function get_compilation_results(repoURI) {
  const request = {
    parent: repoURI,
    compilationResult: {
      releaseConfig: `${repoURI}/releaseConfigs/production`
    }
  }, dev_request = {
    parent: repoURI,
    compilationResult: {
      gitCommitish: 'dev'
    },
    codeCompilationConfig: {
      schemaSuffix: 'dev',
      tablePrefix: 'dev',
      vars: {
        current_month: '2024-08-01',
      },
    }
  };

  console.log(`Creating Dataform compilation result: ${JSON.stringify(request, null, 2)}`);
  const [response] = await dataformClient.createCompilationResult(request);
  console.log(`Compilation result created: ${response.name}`);
  return response.name;
}

/**
 * Run Dataform workflow.
 *
 * @param {string} repoURI Dataform repository URI.
 * @param {string} compilationResult Dataform compilation result.
 * @param {object} tags Dataform tags.
 * @returns
 */
async function run_workflow(repoURI, compilationResult, tags) {
  const request = {
    parent: repoURI,
    workflowInvocation: {
      compilationResult: compilationResult,
      invocationConfig: {
        includedTags: tags,
        fullyRefreshIncrementalTablesEnabled: false,
        transitiveDependenciesIncluded: true,
        transitiveDependentsIncluded: false
      },
    }
  };

  console.log(`Invoking Dataform workflow: ${JSON.stringify(request, null, 2)}`);
  const [response] = await dataformClient.createWorkflowInvocation(request);
  console.log(`Workflow invoked: ${response.name}`);
}

module.exports = { get_compilation_results, run_workflow };
