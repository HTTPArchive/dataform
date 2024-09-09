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
      releaseConfig: 'production'
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

  const [response] = await dataformClient.createCompilationResult(request);
  return response.compilationResult;
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

  const response = await dataformClient.createWorkflowInvocation(request);
  console.log(`${response.name} complete`);
}

module.exports = { get_compilation_results, run_workflow };
