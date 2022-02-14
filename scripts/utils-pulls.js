'use strict';

const fs = require('fs');
const { getArrayMean, getElapsedTimeDays } = require('./utils-general');
const { getDataFilePath } = require('./utils-data-file-paths');
const ORGS_REPOS_LIST = require('../constants/data-file-paths');

/* 
  1. Utility functions for fetching pull request raw data from GitHub
    - Parse list of organizations + repositories to fetch via `../constants`
    - Connect to GitHub API via Octokit (token required!)
    - Fetch raw pull data for every repository in the list
  2. Utility functions for working with pull request raw data:
    - read pull request raw data from file
    - process pull request raw data for statistical analysis:
      - filter out `[bot]` pull requests
      - sort pull requests by state: open, closed
      - sub-sort `closed` pull requests by close mechanism: `merged`, `unmerged`
    - calculate statistics on processed data + format for export:
      - Repository Information:  
        - Organization Name
        - Repository Name
      - Open pull requests: 
        - Number
      - Closed pull requests:
        - Number
        - Number closed via 'Merge'
        - Number closed via 'Close'
        - Mean time to resolution
 */

// Read
const readPullsRawData = (orgName, repoName) =>
  JSON.parse(
    fs.readFileSync(`${getDataFilePath(orgName, repoName, 'pulls', 'raw')}`)
  );

// Process
const getFilteredPulls = (pulls) =>
  pulls.filter((pull) => !pull.user.login.includes('[bot]'));

const getSortedPulls = (pulls) => {
  const pullsOpen = pulls.filter((pull) => pull.state === 'open');
  const pullsClosed = pulls.filter((pull) => pull.state === 'closed');
  const pullsClosedMerged = pullsClosed.filter(
    (pull) => pull.closed_at === pull.merged_at
  );
  const pullsClosedUnmerged = pullsClosed.filter(
    (pull) => pull.closed_at !== pull.merged_at
  );

  return [pullsOpen, pullsClosed, pullsClosedMerged, pullsClosedUnmerged];
};

// Calculate
const getPullOpenTime = (pullClosed) =>
  getElapsedTimeDays(pullClosed.created_at, pullClosed.closed_at);

const getPullOpenTimes = (pullsClosed) => pullsClosed.map(getPullOpenTime);

const getPullOpenTimeMean = (pullsClosed) =>
  getArrayMean(getPullOpenTimes(pullsClosed));

const getPullStatistics = (orgName, repoName, pulls) => {
  const [pullsOpen, pullsClosed, pullsClosedMerged, pullsClosedUnmerged] =
    getSortedPulls(pulls);

  return Object.assign(
    {},
    {
      org_name: orgName,
      repo_name: repoName,
      open_pulls_count: pullsOpen.length,
      closed_pulls_count: pullsClosed.length,
      closed_merged_count: pullsClosedMerged.length,
      closed_unmerged_count: pullsClosedUnmerged.length,
      average_time_to_resolution: getPullOpenTimeMean(pullsClosed),
    }
  );
};

// Export
const writePullStatistics = (pullStatistics) => {
  fs.writeFileSync(
    `${getDataFilePath(
      pullStatistics.org_name,
      pullStatistics.repo_name,
      'pulls',
      'statistics'
    )}`,
    JSON.stringify(Object.assign({}, { data: pullStatistics }))
  );
};

// Generate Summary
function readRepoPullStatisticsAndWriteSummary() {
  let pullStatisticsFiles = glob.sync(
    getDataFilePath(
      `*`, // All orgs
      `*`, // All repos
      'pulls',
      'statistics'
    )
  );
  let results = pullStatisticsFiles.map(
    (filePath) => JSON.parse(fs.readFileSync(filePath)).data
  );
  fs.writeFileSync(
    '../data/pulls/results.json',
    JSON.stringify(Object.assign({}, { data: results }))
  );
}

// Batch operations
const getAllReposForOrg = (orgName) => {
  let orgRecord = ORGS_REPOS_LIST.find(
    (orgRecord) => orgRecord['orgName'] === orgName
  );
  return orgRecord['repoNames'];
};


