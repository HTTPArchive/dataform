import test from 'node:test'
import assert from 'node:assert'
import { DataformClient } from '@google-cloud/dataform'
import { getCompilationResults, runWorkflow } from './dataform.js'

test('getCompilationResults', async (t) => {
  const mockResponse = [{ name: 'mock-compilation-result-name' }]
  t.mock.method(DataformClient.prototype, 'createCompilationResult', async () => mockResponse)

  const repoURI = 'mock-repo-uri'
  const result = await getCompilationResults(repoURI)

  assert.strictEqual(result, 'mock-compilation-result-name')

  const calls = DataformClient.prototype.createCompilationResult.mock.calls
  assert.strictEqual(calls.length, 1)
  assert.deepStrictEqual(calls[0].arguments[0], {
    parent: repoURI,
    compilationResult: {
      releaseConfig: `${repoURI}/releaseConfigs/production`
    }
  })
})

test('runWorkflow', async (t) => {
  const mockResponse = [{ name: 'mock-workflow-invocation-name' }]
  t.mock.method(DataformClient.prototype, 'createWorkflowInvocation', async () => mockResponse)

  const repoURI = 'mock-repo-uri'
  const compilationResult = 'mock-compilation-result-name'
  const tags = ['tag1', 'tag2']

  await runWorkflow(repoURI, compilationResult, tags)

  const calls = DataformClient.prototype.createWorkflowInvocation.mock.calls
  assert.strictEqual(calls.length, 1)
  assert.deepStrictEqual(calls[0].arguments[0], {
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
  })
})
