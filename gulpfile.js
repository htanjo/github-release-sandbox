'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var runSequence = require('run-sequence');
var config = require('config');
var GitHubApi = require('github4');
var gitRemoteOriginUrl = require('git-remote-origin-url');
var hostedGitInfo = require('hosted-git-info');
var pify = require('pify');
var fs = require('fs');

var github = new GitHubApi();
github.authenticate(config.auth);

var pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
var releaseData = {
  packageName: pkg.name,
  tag: 'v' + pkg.version
};

function getRepoInfo() {
  if (releaseData.repo) {
    return Promise.resolve(releaseData.repo);
  }
  return gitRemoteOriginUrl()
    .then(function (url) {
      releaseData.repo  = hostedGitInfo.fromUrl(url);
      return releaseData.repo;
    });
}

function getReleaseId() {
  if (releaseData.id) {
    return Promise.resolve(releaseData.id);
  }
  return getRepoInfo()
    .then(function (repo) {
      return pify(github.repos.getReleaseByTag)({
        user: repo.user,
        repo: repo.project,
        tag: releaseData.tag
      });
    })
    .then(function (release) {
      releaseData.id = release.id;
      return releaseData.id;
    });
}

function createRelease(target) {
  return pify(github.repos.createRelease)(target)
    .then(function (res) {
      releaseData.id = res.id;
      return res;
    });
}

function uploadAsset(target) {
  return pify(github.repos.uploadAsset)(target);
}

gulp.task('create-release', function () {
  return getRepoInfo()
    .then(function (repo) {
      return createRelease({
        user: repo.user,
        repo: repo.project,
        tag_name: releaseData.tag
        // body: ''
      });
    })
    .then(function (res) {
      $.util.log($.util.colors.green('Release "' + res.tag_name + '" created'));
    })
    .catch(function (err) {
      $.util.log($.util.colors.red(err.toString()));
    });
});

gulp.task('upload-asset', function () {
  return Promise.all([getRepoInfo(), getReleaseId()])
    .then(function (results) {
      var repo = results[0];
      var id = results[1];
      return uploadAsset({
        user: repo.user,
        repo: repo.project,
        id: id,
        name: releaseData.packageName + '-' + releaseData.tag + '.zip',
        filePath: 'dist/' + releaseData.packageName + '.zip'
      });
    })
    .then(function (res) {
      $.util.log($.util.colors.green('Asset "' + res.name + '" uploaded'));
    })
    .catch(function (err) {
      $.util.log($.util.colors.red(err.toString()));
    });
});

gulp.task('release', function (callback) {
  runSequence('create-release', 'upload-asset', callback);
});
