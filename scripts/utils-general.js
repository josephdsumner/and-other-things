'use strict';

// Generic Utility Functions
//--------------------------

// Dates:
const getMsFromStr = (dateString) => Date.parse(dateString);
const getElapsedTime = (before, after) =>
  getMsFromStr(after) - getMsFromStr(before);
const getDaysFromMs = (ms) => ms / (1000 * 60 * 60 * 24);
const getElapsedTimeDays = (before, after) =>
  getDaysFromMs(getElapsedTime(before, after));

// Statistical
const accumulator = (previous, current) => previous + current;
const getArraySum = (numArray) => numArray.reduce(accumulator);
const getArrayMean = (numArray) => getArraySum(numArray) / numArray.length;

// Histogram
const isUniqueElement = (value, index, self) => self.indexOf(value) === index;
const getUniqueElements = (rawArray) => rawArray.filter(isUniqueElement);
const counter = (counts, current) => (
  (counts[current] = (counts[current] || 0) + 1), counts
);
const getElementCounts = (rawArray) => rawArray.reduce(counter, {});

module.exports = {
  getElapsedTimeDays,
  getArrayMean,
};
