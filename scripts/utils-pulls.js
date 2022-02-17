'use strict';

const fs = require('fs');
const { getArrayMean, getElapsedTimeDays } = require('./utils-general');
const { getDataFilePath } = require('./utils-data-file-paths');
const ORGS_REPOS_LIST = require('../constants/orgs-repos-list').ORGS_REPOS_LIST;
const { Octokit } = require('octokit');
const glob = require('glob');

/*
  1. Utility functions for fetching pull request raw data from GitHub
    - Parse list of organizations + repositories to fetch via `../constants`
    - Connect to GitHub API via Octokit (NB: token required)
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

// 1. Utility functions for working with pull request raw data
//------------------------------------------------------------------------------

module.exports = {
  // Connect to GitHub via Octokit
  getNewOctokit: async (authToken) => new Octokit({ auth: authToken }),

  // Fetch all Pull Request Data for a given organization / repository
  fetchPullsRawData: async (orgName, repoName) => {
    const octokit = await getNewOctokit('TOKEN_GOES_HERE');
    const pullsRawData = await octokit.paginate(octokit.rest.pulls.list, {
      owner: orgName,
      repo: repoName,
      per_page: 100,
      state: 'all',
    });

    return await pullsRawData;
  },

  writePullsRawData: (orgName, repoName, pullsRawData) => {
    fs.writeFileSync(
      `${getDataFilePath(orgName, repoName, 'pulls', 'raw')}`,
      JSON.stringify(Object.assign({}, { data: pullsRawData }))
    );
    return;
  },

  // 2. Utility functions for working with pull request raw data
  //------------------------------------------------------------------------------

  // Read
  readPullsRawData: (orgName, repoName) => {
    return JSON.parse(
      fs.readFileSync(`${getDataFilePath(orgName, repoName, 'pulls', 'raw')}`)
    );
  },

  // Process
  getFilteredPulls: (pulls) =>
    pulls.filter((pull) => !pull.user.login.includes('[bot]')),

  getSortedPulls: (pulls) => {
    const pullsOpen = pulls.filter((pull) => pull.state === 'open');
    const pullsClosed = pulls.filter((pull) => pull.state === 'closed');
    const pullsClosedMerged = pullsClosed.filter(
      (pull) => pull.closed_at === pull.merged_at
    );
    const pullsClosedUnmerged = pullsClosed.filter(
      (pull) => pull.closed_at !== pull.merged_at
    );

    return [pullsOpen, pullsClosed, pullsClosedMerged, pullsClosedUnmerged];
  },

  getProcessedPulls: (pullsRawData) =>
    getSortedPulls(getFilteredPulls(pullsRawData)),

  // Calculate
  getPullOpenTime: (pullClosed) =>
    getElapsedTimeDays(pullClosed.created_at, pullClosed.closed_at),

  getPullOpenTimes: (pullsClosed) => pullsClosed.map(getPullOpenTime),

  getPullOpenTimeMean: (pullsClosed) =>
    getArrayMean(getPullOpenTimes(pullsClosed)),

  getPullStatistics: (orgName, repoName, pullsProcessed) => {
    const [pullsOpen, pullsClosed, pullsClosedMerged, pullsClosedUnmerged] =
      pullsProcessed;

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
  },

  // Export
  writePullStatistics: (pullStatistics) => {
    fs.writeFileSync(
      `${getDataFilePath(
        pullStatistics.org_name,
        pullStatistics.repo_name,
        'pulls',
        'statistics'
      )}`,
      JSON.stringify(Object.assign({}, { data: pullStatistics }))
    );
  },

  // Generate Summary
  readRepoPullStatisticsAndWriteSummary: () => {
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
  },

  // Batch Operations: do everything from scratch
  // 1. Generate list of [org, repo] combinations to fetch
  // 2. For each [org, repo] -- `fetchAnalyzePullData`:
  //  - fetch all pull request raw data
  //  - write raw to file
  //  - process + calculate statistics
  //  - write statistics to file
  // 3. Read all statistics files, combine data, write to file

  // 1. Generate list of [org, repo] combinations to fetch

  // Parse
  getAllOrgNames: () =>
    ORGS_REPOS_LIST.map((orgRecord) => orgRecord['orgName']),

  getAllReposForOrg: (orgName) => {
    let orgRecord = ORGS_REPOS_LIST.find(
      (orgRecord) => orgRecord['orgName'] === orgName
    );
    let orgRecordExpanded = orgRecord['repoNames'].map((repoName) =>
      Object.assign({}, { orgName: orgName, repoName: repoName })
    );
    return orgRecordExpanded;
  },

  getAllReposForAllOrgs: () => {
    let allOrgRecordsExpanded = ORGS_REPOS_LIST.map((orgRecord) => {
      getAllReposForOrg(orgRecord['orgName']);
    });
    return allOrgRecordsExpanded;
  },

  // 2. For each [org, repo] -- `fetchAnalyzePullData`:

  // Everything for a repository
  fetchAnalyzePullDataForRepo: async (orgName, repoName) => {
    const pullsRawData = await fetchPullsRawData(orgName, repoName);

    writePullsRawData(orgName, repoName, await pullsRawData);

    const pullStatistics = getPullStatistics(
      orgName,
      repoName,
      getProcessedPulls(pullsRawData)
    );

    writePullStatistics(pullStatistics);
  },

  // Everything for an organization
  fetchAnalyzePullDataForOrg: async (orgName) => {
    const orgRecordExpanded = getAllReposForOrg(orgName);
    for (let orgRecordCurrent of orgRecordExpanded) {
      await fetchAnalyzePullDataForRepo(
        orgRecordCurrent['orgName'],
        orgRecordCurrent['repoName']
      );
    }
  },

  // Everything for all organizations
  fetchAnalyzePullDataForOrgs: async () => {
    const orgNames = getAllOrgNames;
    for (let orgName of orgNames) {
      await fetchAnalyzePullDataForOrg(orgName);
    }
    readRepoPullStatisticsAndWriteSummary();
  },
};
