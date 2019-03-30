/**
 *    Copyright 2019 Google LLC
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        https://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

const fs = require('fs')
const git = require("isomorphic-git");
git.plugins.set('fs', fs)


const last = (ary) => ary[ary.length-1];

const catchError = (res) => (e) => {
  console.error(e);
  res.status(500).send(e);
};


const makePath = (p) => p.join('/');


exports.grassland = (root, config) => {

  const authInfo = {
    username: config.username,
    password: config.password,
    token: config.token,
    oauth2format: config.oauth2format,
    url: config.url,
    corsProxy: config.corsProxy,
    noGitSuffix: config.noGitSuffix,
    depth: config.depth,
    since: config.since,
    exclude: config.exclude,
    relative: config.relative,
    headers: config.headers,
  };

  const dir = config.storageDir;

  const performPull = () => git.pull({ dir, ...authInfo });
  const performClone = () => git.clone({ dir, noCheckout: true, ...authInfo });
  
  let lastFetchedTime = 0;
  let fetchCheck = Promise.resolve();
  const checkRepo = () => {
    if (config.fetchTime > 0) {
      const now = Date.now();
      if (!fs.existsSync(dir)) {
        lastFetchedTime = now;
        fetchCheck = performClone();
      } else if ( (now - lastFetchedTime) > (config.fetchTime * 60 * 1000)) {
        lastFetchedTime = now;
        fetchCheck = performPull();
      }
    }
    return fetchCheck;
  }
  
  const getFileByReference = (filepath, ref) =>
        checkRepo()
        .then(() => git.resolveRef({dir, ref}))
        .then((oid) => git.readObject({ dir, oid, filepath, encoding: 'utf8' }))
        .then((blob) => blob.object);

  const getCommitForRef = (ref) =>
        checkRepo()
        .then(() => git.resolveRef({ dir, ref }));

  const baseRE = /(<base\s+href=")\/("\s*)/i  // getting into "the pony, he comes" territory https://is.gd/41FT2p
  const replaceBase = (fileText, commit, cdn) =>
        fileText.replace(baseRE, '$1' + makePath([ cdn || '', root , 'commit', commit, '']) + '$2');

  const serveFile = (filepath, ref, cdn, replaceFunction) => 
        Promise.all([ getFileByReference(filepath, ref), getCommitForRef(ref)])
        .then(([fileText, commit]) => (replaceFunction || replaceBase)(fileText, commit, cdn));

  const resolveCommit = (sha) => checkRepo().then(() => sha);
  const middleware = (req, res, next) => {
    const [command, reqtype, refId, ...path] = req._parsedUrl.path.split('/').filter(p => p);

    if (command === root) {
      if ((reqtype === 'ref') || (reqtype === 'commit')) {
        const getCommit =  (reqtype === 'ref') ? getCommitForRef: resolveCommit;
        const filepath = (config.prefix || '') + makePath(path);

        return getCommit(refId).then((oid) => git.readObject({ dir, oid, filepath }))
          .then((blob) => res
                .set({
                  'ETag': blob.oid,
                  'Cache-Control': 'immutable, public',
                  'Expires': 'Tue Dec 31 2069 16:00:00 GMT-0800'
                })
                .redirect((reqtype === 'ref') ? 302 : 301,
                          makePath(['',
                                    root,
                                    'blob',
                                    blob.oid,
                                    last(path),
                                   ])))
          .catch(catchError(res));
      } else if (reqtype === 'blob') {
        const oid = refId;
        return checkRepo()
          .then(() => git.readObject({dir, oid}))
          .then(({oid, object}) => res
                .set({
                  'ETag': oid,
                  'Cache-Control': 'immutable, public',
                  'Expires': 'Tue Dec 31 2069 16:00:00 GMT-0800'
                })
                .type(last(path)).send(object))
          .catch(catchError(res));
      }
    }
    next();
  };

  middleware.getFileByReference =  getFileByReference;
  middleware.getCommitForRef = getCommitForRef;
  middleware.replaceBase = replaceBase;
  middleware.serveFile = serveFile
  return middleware;
};
