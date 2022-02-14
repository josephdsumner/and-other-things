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
async function getAllPullRequests(orgName, repoName) {
  const octokit = new Octokit({
    auth: 'TOKEN_GOES_HERE',
  });

  const pullRequests = await octokit.paginate(octokit.rest.pulls.list, {
    owner: orgName,
    repo: repoName,
    per_page: 100,
    state: 'all',
  });

  const pullRequestsBotsFiltered = await pullRequests.filter(
    (pullRequest) => !pullRequest.user.login.includes('[bot]')
  );

  fs.writeFileSync(
    `../data/${orgName}--${repoName}.json`,
    JSON.stringify(Object.assign({}, { data: pullRequestsBotsFiltered }))
  );

  return await pullRequestsBotsFiltered;
}

// WIP POC for GitHub API calls
async function getFirstPageOfPullRequests(orgName, repoName) {
  const octokit = new Octokit({
    auth: 'TOKEN_GOES_HERE',
  });

  const result = await octokit.request(
    `GET /repos/${orgName}/${repoName}/pulls`,
    {
      state: 'all',
      per_page: '100',
    }
  );

  const data = await result.data;

  fs.writeFileSync(
    `../data/${orgName}--${repoName}.json`,
    JSON.stringify(Object.assign({}, { data: data }))
  );

  return await data;
}

// Bucket sorts pull requests for statistic analysis
function getSortedPulls(pullsAll) {
  const pullsOpen = pullsAll.filter((pull) => pull.state === 'open');
  const pullsClosed = pullsAll.filter((pull) => pull.state === 'closed');
  const pullsClosedMerged = pullsClosed.filter(
    (pull) => pull.closed_at === pull.merged_at
  );
  const pullsClosedUnmerged = pullsClosed.filter(
    (pull) => pull.closed_at !== pull.merged_at
  );

  const result = [
    pullsOpen,
    pullsClosed,
    pullsClosedMerged,
    pullsClosedUnmerged,
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
function getAveragePullOpenTime(pullsClosed) {
  let durations = pullsClosed.map((pull) =>
    getTimeBetweenCreatedAndClosed(pull)
  );
  let averageDuration =
    durations.reduce((prev, current) => prev + current) / pullsClosed.length;
  return averageDuration;
}

// Get all pull requests ever for org/repo, write data to org--repo.json
// Perform statistical analysis on data, write to org--repo--statistics.json
async function getAndWriteRepoPullStatistics(orgName, repoName) {
  const pullsAll = await getAllPullRequests(orgName, repoName);
  const [pullsOpen, pullsClosed, pullsClosedMerged, pullsClosedUnmerged] =
    getSortedPulls(await pullsAll);

  const pullStatistics = Object.assign(
    {},
    {
      organization_name: orgName,
      repository_name: repoName,
      open_pulls_count: await pullsOpen.length,
      closed_pulls_count: await pullsClosed.length,
      closed_merged_count: await pullsClosedMerged.length,
      closed_unmerged_count: await pullsClosedUnmerged.length,
      average_time_to_resolution: await getAveragePullOpenTime(pullsClosed),
    }
  );
  fs.writeFileSync(
    `../data/${orgName}--${repoName}--statistics.json`,
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

function readRepoPullRequestsFromFile(orgName, repoName) {
  return JSON.parse(fs.readFileSync(`../data/${orgName}--${repoName}.json`));
}

function generateStatisticsSummaryFromFiles() {
  let pullStatisticsFiles = glob.sync(
    '../data/pulls/statistics/*--statistics.json'
  );
  let results = pullStatisticsFiles.map(
    (filePath) => JSON.parse(fs.readFileSync(filePath)).data
  );
  fs.writeFileSync(
    '../data/pulls/results.json',
    JSON.stringify(Object.assign({}, { data: results }))
  );
}

module.exports = {
  ORGANIZATIONS_AND_REPOSITORIES_ARRAY,
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
