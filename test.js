const fs = require('fs');
const path = require('path');
const getStream = require('get-stream');
const isZip = require('is-zip');
const nock = require('nock');
const pathExists = require('path-exists');
const pify = require('pify');
const randomBuffer = require('random-buffer');
const disposition = require('content-disposition');
const test = require('ava');
const m = require('./');

const fsP = pify(fs);

test.before(() => {
	nock('http://foo.bar')
		.persist()
		.get('/404')
		.reply(404)
		.get('/foo.zip')
		.replyWithFile(200, path.join(__dirname, 'fixture.zip'))
		.get('/foo?bar.zip')
		.replyWithFile(200, path.join(__dirname, 'fixture.zip'))
		.get('/foo')
		.replyWithFile(200, path.join(__dirname, 'fixture.zip'), {'Content-Disposition': disposition('bar.zip')})
		.get('/chinese')
		.replyWithFile(200, path.join(__dirname, 'fixture.zip'), {'Content-Disposition': disposition('文件.zip')})
		.get('/large.bin')
		.reply(200, randomBuffer(7928260))
		.get('/redirect.zip')
		.reply(302, null, {location: 'http://foo.bar/foo.zip'});
});

test('download as stream', async t => {
	t.true(isZip(await getStream.buffer(m('http://foo.bar/foo.zip'))));
});

test('download as promise', async t => {
	t.true(isZip(await m('http://foo.bar/foo.zip')));
});

test('download a very large file', async t => {
	t.is((await getStream.buffer(m('http://foo.bar/large.bin'))).length, 7928260);
});

test('save file', async t => {
	await m('http://foo.bar/foo.zip', __dirname);
	t.true(await pathExists(path.join(__dirname, 'foo.zip')));
	await fsP.unlink(path.join(__dirname, 'foo.zip'));
});

test('extract file', async t => {
	await m('http://foo.bar/foo.zip', __dirname, {extract: true});
	t.true(await pathExists(path.join(__dirname, 'file.txt')));
	await fsP.unlink(path.join(__dirname, 'file.txt'));
});

test('error on 404', async t => {
	t.throws(m('http://foo.bar/404'), 'Response code 404 (Not Found)');
});

test('rename to valid filename', async t => {
	await m('http://foo.bar/foo?bar.zip', __dirname);
	t.true(await pathExists(path.join(__dirname, 'foo!bar.zip')));
	await fsP.unlink(path.join(__dirname, 'foo!bar.zip'));
});

test('have filename from headers', async t => {
	await m('http://foo.bar/foo', __dirname);
	t.true(await pathExists(path.join(__dirname, 'bar.zip')));
	await fsP.unlink(path.join(__dirname, 'bar.zip'));
});

test('have chinese filename from headers', async t => {
	await m('http://foo.bar/chinese', __dirname);
	t.true(await pathExists(path.join(__dirname, '文件.zip')));
	await fsP.unlink(path.join(__dirname, '文件.zip'));
});

test('follow redirects', async t => {
	t.true(isZip(await m('http://foo.bar/redirect.zip')));
});
