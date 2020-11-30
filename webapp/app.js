'use strict';
const http = require('http');
var assert = require('assert');
const express= require('express');
const app = express();
const mustache = require('mustache');
const filesystem = require('fs');
const url = require('url');
const port = Number(process.argv[2]);

const hbase = require('hbase')
// host:'localhost', port:8070
var hclient = hbase({ host: process.argv[3], port: Number(process.argv[4])})

// function rowToMap(row) {
// 	var stats = {}
// 	row.forEach(function (item) {
// 		stats[item['column']] = Number(item['$'])
// 	});
// 	return stats;
// }
// hclient.table('yson_street_by_seg').row('W Washington950').get((error, value) => {
// 	console.info(rowToMap(value))
// 	console.info(value)
// })
//
// hclient.table('spertus_carriers').scan({ maxVersions: 1}, (err,rows) => {
// 	console.info(rows)
// })
//
// hclient.table('spertus_ontime_by_year').scan({
// 	filter: {type : "PrefixFilter",
// 		      value: "AA"},
// 	maxVersions: 1},
// 	(err, value) => {
// 	  console.info(value)
// 	})

app.use(express.static('public'));
app.get('/traffic.html', function (req, res) {
	hclient.table('yson_streets').scan({ maxVersions: 1}, (err,rows) => {
		var template = filesystem.readFileSync("submit.mustache").toString();
		var html = mustache.render(template, {
			streets : rows
		});
		res.send(html)
	})
});

function removePrefix(text, prefix) {
	return text.substr(prefix.length)
}

app.get('/street-results.html',function (req, res) {
	const street = req.query['street'];
	// console.log(street); // print street name

	function processSegmentIdRecord(segmentIdRecord) {
		var result = { segment_id : segmentIdRecord['segment_id']};
		["from_street", "to_street", "traffic_direction",
			"speed_month", "speed_week", "speed_day", "speed_hour", "speed_now"].forEach(val => {
			result[val] = segmentIdRecord[val];
		})
		return result;
	}
	function SpeedInfo(cells) {
		var result = [];
		var segmentIdRecord;
		cells.forEach(function(cell) {
			var segment_id = Number(removePrefix(cell['key'], street))
			if(segmentIdRecord === undefined)  {
				segmentIdRecord = { segment_id: segment_id }
			} else if (segmentIdRecord['segment_id'] != segment_id ) {
				result.push(processSegmentIdRecord(segmentIdRecord))
				segmentIdRecord = { segment_id: segment_id }
			}
			segmentIdRecord[removePrefix(cell['column'],'stats:')] = cell['$']
		})
		result.push(processSegmentIdRecord(segmentIdRecord))
		return result;
	}
	hclient.table('yson_street_by_seg').scan({
			filter: {type : "PrefixFilter", value: street},
			maxVersions: 1},
		(err, cells) => {
			var si = SpeedInfo(cells);
			// console.log(si)
			var template = filesystem.readFileSync("result-table.mustache").toString();
			var html = mustache.render(template, {
				SpeedInfo : si,
				street : street
			});
			// res.send(html)
		})
	// console.log(si)



	function processRedlightSpeedRecord(streetRecord) {
		var result = { street : streetRecord['street_name']};
		["redlight_year", "redlight_months", "speed_year", "speed_months"].forEach(val => {
			result[val] = streetRecord[val];
		})
		return result;
	}
	function RedlightSpeedInfo(cells) {
		var result = [];
		var streetRecord;
		// console.log(streetRecord)
		cells.forEach(function(cell) {
			var street_name = cell['key']

			if(streetRecord === undefined)  {
				streetRecord = { street_name: street_name }
				// console.log(streetRecord)
			} else if (streetRecord['street_name'] != street_name ) {
				result.push(processRedlightSpeedRecord(streetRecord))
				streetRecord = {street_name: street_name}
			}
			streetRecord[removePrefix(cell['column'],'stats:')] = cell['$']
		})
		result.push(processRedlightSpeedRecord(streetRecord))
		return result;
	}
	hclient.table('yson_redlight_speed').scan({
			filter: {type : "PrefixFilter", value: street},
			maxVersions: 1},
		(err, cells) => {
			if (cells.length > 0) {
				var rsi = RedlightSpeedInfo(cells);
			} else {
				var rsi = undefined;
			}
			var template = filesystem.readFileSync("result-table.mustache").toString();
			var html = mustache.render(template, {
				RedlightSpeedInfo : rsi,
				street : street
			});
			res.send(html)
		})
});

app.listen(port);
