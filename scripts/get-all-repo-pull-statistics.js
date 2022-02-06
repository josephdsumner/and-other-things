const { Octokit } = require('octokit');
const fs = require('fs');
const glob = require('glob');

const ORGANIZATIONS_AND_REPOSITORIES_ARRAY = [
  ['emberjs', 'ember.js'],
  ['emberjs', 'data'],
  ['emberjs', 'ember-test-helpers'],
  ['glimmerjs', 'glimmer.js'],
  ['glimmerjs', 'glimmer-vm'],
  ['ember-cli', 'ember-cli'],
];

// NB: GitHub Issues API: returns `issues` includes `/issues` and `/pulls`
// Filters `issues` for pull requests via existence of `pull_request` key
// Writes all pull data as {data: [{}]} `../data/org--repo.json`
async function getAllPullRequests(organizationName, repositoryName) {
  const octokit = new Octokit({
    auth: 'TOKEN_GOES_HERE',
  });

  const pullRequests = await octokit.paginate(octokit.rest.pulls.list, {
    owner: organizationName,
    repo: repositoryName,
    per_page: 100,
    state: 'all',
  });

  const pullRequestsBotsFiltered = await pullRequests.filter(
    (pullRequest) => !pullRequest.user.login.includes('[bot]')
  );

  fs.writeFileSync(
    `../data/${organizationName}--${repositoryName}.json`,
    JSON.stringify(Object.assign({}, { data: pullRequestsBotsFiltered }))
  );

  return await pullRequestsBotsFiltered;
}

// WIP POC for GitHub API calls
async function getFirstPageOfPullRequests(organizationName, repositoryName) {
  const octokit = new Octokit({
    auth: 'TOKEN_GOES_HERE',
  });

  const result = await octokit.request(
    `GET /repos/${organizationName}/${repositoryName}/pulls`,
    {
      state: 'all',
      per_page: '100',
    }
  );

  const data = await result.data;

  fs.writeFileSync(
    `../data/${organizationName}--${repositoryName}.json`,
    JSON.stringify(Object.assign({}, { data: data }))
  );

  return await data;
}

// Bucket sorts pull requests for statistic analysis
function getSortedPulls(pullsAllArray) {
  const pullsOpenArray = pullsAllArray.filter((pull) => pull.state === 'open');
  const pullsClosedArray = pullsAllArray.filter(
    (pull) => pull.state === 'closed'
  );
  const pullsClosedMergedArray = pullsClosedArray.filter(
    (pull) => pull.closed_at === pull.merged_at
  );
  const pullsClosedUnmergedArray = pullsClosedArray.filter(
    (pull) => pull.closed_at !== pull.merged_at
  );

  const result = [
    pullsOpenArray,
    pullsClosedArray,
    pullsClosedMergedArray,
    pullsClosedUnmergedArray,
  ];
  return result;
}

// Utility function: elapsed time between two date Strings
function getTimeBetweenDateStringsInDays(dateStringBefore, dateStringAfter) {
  return (
    (Date.parse(dateStringAfter) - Date.parse(dateStringBefore)) /
    (1000 * 60 * 60 * 24)
  );
}

// Implements above utility function to calculate how long a (now) closed pull
// request was 'open', in days
function getTimeBetweenCreatedAndClosed(pullClosed) {
  return getTimeBetweenDateStringsInDays(
    pullClosed.created_at,
    pullClosed.closed_at
  );
}

// Given an Array of closed pull requests:
// - Calculate how long each one was 'open' for, in days
// - Calculate the average 'open' time duration
// TODO: add metric for spread
function getAveragePullOpenTime(pullsClosedArray) {
  let durations = pullsClosedArray.map((pull) =>
    getTimeBetweenCreatedAndClosed(pull)
  );
  let averageDuration =
    durations.reduce((prev, current) => prev + current) /
    pullsClosedArray.length;
  return averageDuration;
}

// Get all pull requests ever for org/repo, write data to org--repo.json
// Perform statistical analysis on data, write to org--repo--statistics.json
async function getAndWriteRepoPullStatistics(organizationName, repositoryName) {
  const pullsAllArray = await getAllPullRequests(
    organizationName,
    repositoryName
  );
  const [
    pullsOpenArray,
    pullsClosedArray,
    pullsClosedMergedArray,
    pullsClosedUnmergedArray,
  ] = getSortedPulls(await pullsAllArray);

  const pullStatistics = Object.assign(
    {},
    {
      organization_name: organizationName,
      repository_name: repositoryName,
      open_pulls_count: await pullsOpenArray.length,
      closed_pulls_count: await pullsClosedArray.length,
      closed_merged_count: await pullsClosedMergedArray.length,
      closed_unmerged_count: await pullsClosedUnmergedArray.length,
      average_time_to_resolution: await getAveragePullOpenTime(
        pullsClosedArray
      ),
    }
  );
  fs.writeFileSync(
    `../data/${organizationName}--${repositoryName}--statistics.json`,
    JSON.stringify(Object.assign({}, { data: pullStatistics }))
  );
  return await pullStatistics;
}

// The next two functions (batch jobs) break the default rate-limit
// TODO: add rate-limit increase, throttle, etc.
const getAllRepoPullStatistics = async () => {
  return Promise.all(
    ORGANIZATIONS_AND_REPOSITORIES_ARRAY.map(([orgName, repoName]) =>
      getRepoPullStatistics(orgName, repoName)
    )
  );
};

const getAndWriteAllRepoPullStatistics = async () => {
  getAllRepoPullStatistics().then((all) =>
    fs.writeFileSync(
      '../data/results.json',
      JSON.stringify(Object.assign({}, { data: all }))
    )
  );
};

function getUniqueArrayElements(value, index, self) {
  return self.indexOf(value) === index;
}

function getCountOfArrayElements(rawArray) {
  let uniqueElementsArray = rawArray.filter(getUniqueArrayElements);
  let elementCountArray = new Array(uniqueElementsArray.length);
  for (let ii = 0; ii < elementCountArray.length; ii++) {
    let currentElement = uniqueElementsArray[ii];
    let currentCount = 0;
    for (let jj = 0; jj < rawArray.length; jj++) {
      if (rawArray[jj] === currentElement) {
        currentCount++;
      }
    }
    elementCountArray[ii] = Object.assign(
      {},
      { element: currentElement, count: currentCount }
    );
  }
  return elementCountArray;
}

function readRepoPullRequestsFromFile(organizationName, repositoryName) {
  return JSON.parse(
    fs.readFileSync(`../data/${organizationName}--${repositoryName}.json`)
  );
}

function generateStatisticsSummaryFromFiles() {
  let pullStatisticsFilesArray = glob.sync(
    '../data/pulls/statistics/*--statistics.json'
  );
  let resultsArray = pullStatisticsFilesArray.map(
    (filePath) => JSON.parse(fs.readFileSync(filePath)).data
  );
  fs.writeFileSync(
    '../data/pulls/results.json',
    JSON.stringify(Object.assign({}, { data: resultsArray }))
  );
}

module.exports = {
  ORGANIZATIONS_AND_REPOSITORIES_ARRAY,
  getCountOfArrayElements,
  getUniqueArrayElements,
  getAllPullRequests,
  getAllRepoPullStatistics,
  getAndWriteAllRepoPullStatistics,
  getAndWriteRepoPullStatistics,
  getAveragePullOpenTime,
  getSortedPulls,
  getTimeBetweenCreatedAndClosed,
  getTimeBetweenDateStringsInDays,
  getFirstPageOfPullRequests,
  readRepoPullRequestsFromFile,
  generateStatisticsSummaryFromFiles,
};
