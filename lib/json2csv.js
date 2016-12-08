/**
 * Module dependencies.
 */
var os = require('os');
var lodashGet = require('lodash.get');
var lodashFlatten = require('lodash.flatten');
var lodashUniq = require('lodash.uniq');
var lodashSet = require('lodash.set');
var lodashCloneDeep = require('lodash.clonedeep');
var flatten = require('flat');

/**
 * @name Json2CsvParams
 * @type {Object}
 * @property {Array} [fields] - see documentation for details
 * @property {String[]} [fieldNames] - names for fields at the same indexes. Must be same length as fields array
 *                                   (Optional. Maintained for backwards compatibility. Use fields config object for more features)
 * @property {String} [del=","] - delimiter of columns
 * @property {String} [defaultValue="<empty>"] - default value to use when missing data
 * @property {String} [quotes='"'] - quotes around cell values and column names
 * @property {String} [doubleQuotes='"""'] - the value to replace double quotes in strings
 * @property {Boolean} [hasCSVColumnTitle=true] - determines whether or not CSV file will contain a title column
 * @property {String} [eol=''] - it gets added to each row of data
 * @property {String} [newLine] - overrides the default OS line ending (\n on Unix \r\n on Windows)
 * @property {Boolean} [flatten=false] - flattens nested JSON using flat (https://www.npmjs.com/package/flat)
 * @property {String} [unwindPath] - similar to MongoDB's $unwind, Deconstructs an array field from the input JSON to output a row for each element
 * @property {Boolean} [excelStrings] - converts string data into normalized Excel style data
 * @property {Boolean} [includeEmptyRows=false] - includes empty rows
 */

/**
 * Main function that converts json to csv.
 *
 * @param {Array|Object} data JSON data to convert to CSV.
 * @param {Json2CsvParams} [params={}] Function parameters containing data, fields,
 * delimiter (default is ','), hasCSVColumnTitle (default is true)
 * and default value (default is '')
 */
module.exports = function (data, params) {
  params = params || {};

  var normalizedData = normalizeData(data, params);
  var normalizedParams = normalizeParams(params, data);
  var titles = createColumnTitles(normalizedParams);
  var csv = createColumnContent(normalizedData, titles, normalizedParams);

  return csv;
};

function normalizeData(data, params) {
  if (typeof data !== 'object') {
    debugger;
    throw new Error('Data needs to be an object or array');
  }

  data = data || [];

  // if data is an Object, not in array [{}], then just create 1 item array.
  // So from now all data in array of object format.
  if (!Array.isArray(data)) {
    data = [data];
  }

  if (params.flatten) {
    data = data.map(flatten);
  }

  return data;
}

/**
 * Check passing params.
 *
 * Note that this modifies params.
 *
 * @param {Json2CsvParams} params Function parameters containing data, fields,
 * delimiter, default value, mark quotes and hasCSVColumnTitle
 */
function normalizeParams(params, data) {
  // Set params.fields default to first data element's keys
  if (!params.fields && Array.isArray(data) && (data.length === 0 || typeof data[0] !== 'object')) {
    throw new Error('params should include "fields" and/or non-empty "data" array of objects');
  }

  if (!params.fields) {
    var dataFields;

    if (Array.isArray(data)) {
      dataFields = data.map(function (item) {
        return Object.keys(item);
      });
      dataFields = lodashFlatten(dataFields);
      dataFields = lodashUniq(dataFields);
    } else {
      // TODO: fix this..
      if (params.flatten) {
        var flattenedData = lodashFlatten(data);
        dataFields = Object.keys(flattenedData);
      }
    }

    params.fields = dataFields;
  }

  // check fieldNames
  if (params.fieldNames && params.fieldNames.length !== params.fields.length) {
    throw new Error('fieldNames and fields should be of the same length, if fieldNames is provided.');
  }

  // Get fieldNames from fields
  params.fieldNames = params.fields.map(function (field, i) {
    if (params.fieldNames && typeof field === 'string') {
      return params.fieldNames[i];
    }
    return (typeof field === 'string') ? field : (field.label || field.value);
  });

  params.del = params.del || ',';
  params.eol = params.eol || '';
  params.quotes = typeof params.quotes === 'string' ? params.quotes : '"';
  params.doubleQuotes = typeof params.doubleQuotes === 'string' ? params.doubleQuotes : Array(3).join(params.quotes);
  params.defaultValue = params.defaultValue;
  params.hasCSVColumnTitle = params.hasCSVColumnTitle !== false;
  params.includeEmptyRows = params.includeEmptyRows || false;

  return params;
}

/**
 * Create the title row with all the provided fields as column headings
 *
 * @param {Json2CsvParams} params Function parameters containing data, fields and delimiter
 * @returns {String} titles as a string
 */
function createColumnTitles(params) {
  var str = '';

  //if CSV has column title, then create it
  if (params.hasCSVColumnTitle) {
    params.fieldNames.forEach(function (element) {
      if (str !== '') {
        str += params.del;
      }
      str += JSON.stringify(element).replace(/\"/g, params.quotes);
    });
  }

  return str;
}

/**
 * Replace the quotation marks of the field element if needed (can be a not string-like item)
 *
 * @param {string} stringifiedElement The field element after JSON.stringify()
 * @param {string} quotes The params.quotes value. At this point we know that is not equal to double (")
 */
function replaceQuotationMarks(stringifiedElement, quotes) {
  var lastCharIndex = stringifiedElement.length - 1;

  //check if it's an string-like element
  if (stringifiedElement[0] === '"' && stringifiedElement[lastCharIndex] === '"') {
    //split the stringified field element because Strings are immutable
    var splitElement = stringifiedElement.split('');

    //replace the quotation marks
    splitElement[0] = quotes;
    splitElement[lastCharIndex] = quotes;

    //join again
    stringifiedElement = splitElement.join('');
  }

  return stringifiedElement;
}

/**
 * Create the content column by column and row by row below the title
 *
 * @param {Object} params Function parameters containing data, fields and delimiter
 * @param {String} str Title row as a string
 * @returns {String} csv string
 */
function createColumnContent(data, output, params) {
  var dataRows = createDataRows(data, params);

  dataRows.forEach(function (dataElement) {
    //if null do nothing, if empty object without includeEmptyRows do nothing
    if (dataElement && (Object.getOwnPropertyNames(dataElement).length > 0 || params.includeEmptyRows)) {
      var line = '';
      var eol = params.newLine || os.EOL || '\n';

      params.fields.forEach(function (fieldElement) {
        var val;
        var defaultValue = params.defaultValue;
        if (typeof fieldElement === 'object' && 'default' in fieldElement) {
          defaultValue = fieldElement.default;
        }

        if (fieldElement && (typeof fieldElement === 'string' || typeof fieldElement.value === 'string')) {
          var path = (typeof fieldElement === 'string') ? fieldElement : fieldElement.value;
          val = lodashGet(dataElement, path, defaultValue);
        } else if (fieldElement && typeof fieldElement.value === 'function') {
          var field = {
            label: fieldElement.label,
            default: fieldElement.default
          };
          val = fieldElement.value(dataElement, field, data);
        }

        if (val === null || val === undefined){
          val = defaultValue;
        }

        if (val !== undefined) {
          var stringifiedElement = JSON.stringify(val);

          if (typeof val === 'object') stringifiedElement = JSON.stringify(stringifiedElement);

          if (params.quotes !== '"') {
            stringifiedElement = replaceQuotationMarks(stringifiedElement, params.quotes);
          }

          //JSON.stringify('\\') results in a string with two backslash
          //characters in it. I.e. '\\\\'.
          stringifiedElement = stringifiedElement.replace(/\\\\/g, '\\');

          if (params.excelStrings && typeof val === 'string') {
            stringifiedElement = '"="' + stringifiedElement + '""';
          }

          line += stringifiedElement;
        }

        line += params.del;
      });

      //remove last delimeter
      line = line.substring(0, line.length - 1);
      //Replace single quotes with double quotes. Single quotes are preceeded by
      //a backslash. Be careful not to remove backslash content from the string.
      line = line.split('\\\\').map(function (portion) {
        return portion.replace(/\\"/g, params.doubleQuotes);
      }).join('\\\\');
      //Remove the final excess backslashes from the stringified value.
      line = line.replace(/\\\\/g, '\\');
      //If header exists, add it, otherwise, print only content
      if (output !== '') {
        output += eol + line + params.eol;
      } else {
        output = line + params.eol;
      }
    }
  });

  return output;
}

/**
 * Performs the unwind logic if necessary to convert single JSON document into multiple rows
 * @param params
 */
function createDataRows(data, params) {
  var dataRows = data;

  if (params.unwindPath) {
    dataRows = [];

    data.forEach(function(dataEl) {
      var unwindArray = lodashGet(dataEl, params.unwindPath);
      var isArr = Array.isArray(unwindArray);

      if (isArr && unwindArray.length) {
        unwindArray.forEach(function(unwindEl) {
          var dataCopy = lodashCloneDeep(dataEl);
          lodashSet(dataCopy, params.unwindPath, unwindEl);
          dataRows.push(dataCopy);
        });
      } else if (isArr && !unwindArray.length) {
        var dataCopy = lodashCloneDeep(dataEl);
        lodashSet(dataCopy, params.unwindPath, undefined);
        dataRows.push(dataCopy);
      } else {
        dataRows.push(dataEl);
      }
    });
  }

  return dataRows;
}
