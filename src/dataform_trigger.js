// this script is not used anywhere (I decided to use Workflows), but may be helpful later for GitHub PR checks

const { DataformClient } = require('@google-cloud/dataform').v1beta1;

const df_client = new DataformClient();

// get compilation results
async function get_compilation_results(repo_uri) {
    const request = {
        parent: repo_uri,
        compilationResult: {
            gitCommitish: 'main'
        }
    }, dev_request = {
        parent: repo_uri,
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
    };;

    const [response] = await df_client.createCompilationResult(request);
    return response.compilationResult;
}

// intiate workflow
async function run_workflow(repo_uri, compilation_results) {
    const request = {
        parent: repo_uri,
        workflowInvocation: {
            invocationConfig: {
                includedTags: ['after_crawl_all'],
            },
            compilationResult: compilation_results
        }
    };

    const response = await df_client.createWorkflowInvocation(request);
    const name = response.name;
    console.log(response);
    return name;
}

async function main() {
    const project = 'max-ostapenko';
    const location = 'us-central1';
    const repo_name = 'test';
    const repo_uri = `projects/${project}/locations/${location}/repositories/${repo_name}`;

    const compilation_results = await get_compilation_results(repo_uri);

    const workflowInvocation = await run_workflow(repo_uri, compilation_results);

    return `${workflowInvocation.name} complete`;
}

main().catch(console.error);
