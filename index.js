'use strict';
const fs = require('fs');
const path = require('path');
const url = require('url');
const caw = require('caw');
const decompress = require('decompress');
const filenamify = require('filenamify');
const getStream = require('get-stream');
const got = require('got');
const mkdirp = require('mkdirp');
const pify = require('pify');
const PromiseA = require('bluebird');
const disposition = require('content-disposition');
const urldecode = require('urldecode');

const fsP = pify(fs);

const createPromise = (uri, output, stream, opts) => {
	const response = opts.encoding === null ? getStream.buffer(stream) : getStream(stream, opts);

	return response.then(data => {
		if (!output && opts.extract) {
			return decompress(data, opts);
		}

		if (!output) {
			return data;
		}

		if (opts.extract) {
			return decompress(data, path.dirname(output), opts);
		}

		return pify(mkdirp)(path.dirname(output))
			.then(() => fsP.writeFile(output, data))
			.then(() => ({output, data}));
	});
};

module.exports = (uri, output, opts) => {
	if (typeof output === 'object') {
		opts = output;
		output = null;
	}

	opts = Object.assign({
		encoding: null,
		rejectUnauthorized: process.env.npm_config_strict_ssl !== 'false'
	}, opts);

	let protocol = url.parse(uri).protocol;

	if (protocol) {
		protocol = protocol.slice(0, -1);
	}

	const agent = caw(opts.proxy, {protocol});
	const stream = got.stream(uri, Object.assign(opts, {agent}));

	output = output || opts.output || opts.directory || opts.dir;
	const filename = opts.filename;

	const promise = new PromiseA((resolve, reject) => {
		if (filename) return resolve(filename);

		stream.once('response', res => {
			stream.removeListener('error', reject);
			let filename;
			const header = res.headers['Content-Disposition'] || res.headers['content-disposition'];
			if (header) filename = disposition.parse(header).parameters.filename;
			if (filename) filename = urldecode(filename);
			return resolve(filename);
		});

		stream.once('error', reject);

	}).then(filename => {
		filename = filename || filenamify(path.basename(uri));
		return output ? path.join(output, filename) : null;
	}).then(file => createPromise(uri, file, stream, opts));

	stream.then = function () {
		return promise.then(...arguments);
	};

	stream.catch = function () {
		return promise.catch(...arguments);
	};

	return stream;
};
