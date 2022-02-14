'use strict';

const DATA_FILE_PATHS = require('../constants/data-file-paths');

// Generate paths for files associated with orgName/repoName
const getDataFilePath = (orgName, repoName, type, format) =>
  `${DATA_FILE_PATHS[`${type}_${format}`]}/${orgName}--${repoName}.json`;

module.exports = {
  getDataFilePath,
};
