const { DataformClient } = require('@google-cloud/dataform').v1beta1;

const dataformClient = new DataformClient();

// Get compilation results
async function get_compilation_results(repoURI) {
    const request = {
        parent: repoURI,
        compilationResult: {
            gitCommitish: 'main'
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
                current_month: '2024-07-01',
            },
        }
    };

    console.log(dev_request);  // TODO: cleanup
    const [response] = await dataformClient.createCompilationResult(dev_request);  // TODO change to `request`
    return response.compilationResult;
}

// Intiate Dataform workflow
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

    console.log(request);  // TODO: cleanup
    const response = await dataformClient.createWorkflowInvocation(request);
    const name = response.name;
    console.log(response);
    return name;
}

module.exports = { get_compilation_results, run_workflow };
