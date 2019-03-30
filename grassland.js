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


function last(ary) {
  return ary[ary.length-1];
}

  const catchError = (res) => (e) => {
    console.error(e);
    res.status(500).send(e);
  };



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
    const now = Date.now();
    if (!fs.existsSync(dir)) {
      lastFetchedTime = now;
      fetchCheck = performClone();
    } else if (config.fetchTime > 0) {
      if ( (now - lastFetchedTime) > (config.fetchTime * 60 * 1000)) {
        lastFetchedTime = now;
        fetchCheck = performPull();
      }
    }
    return fetchCheck;
  }
    
  
  const getFileByReference = (ref, filepath) =>
        checkRepo()
        .then(() => git.resolveRef({dir, ref}))
        .then((oid) => git.readObject({ dir, oid, filepath, encoding: 'utf8' }))
        .then((blob) => blob.object);

  const getCommitForRef = (ref) =>
        checkRepo()
        .then(() => git.resolveRef({ dir, ref }));

  const baseRE = /(<base\s+href="\/)("\s*\/?>)/i
  const replaceBase = (fileText, commit) =>
        fileText.replace(baseRE, '$1' + [ root , 'commit', commit, ''].join('/') + '$2');

  const middleware = (req, res, next) => {
    const [command, reqtype, reqarg, ...path] = req._parsedUrl.path.split('/').filter(p => p);

    if (command === root) {
      if ((reqtype === 'ref') || (reqtype === 'commit')) {
        const commit =  (reqtype === 'ref') ? getCommitForRef(reqarg):  Promise.resolve(reqarg);
        const filepath = (config.prefix || '') + path.join('/');
              
        return commit.then((oid) => git.readObject({ dir, oid, filepath }))
          .then((blob) => res.redirect((reqtype === 'ref') ? 302 : 301,
                                       ['',
                                        root,
                                        'blob',
                                        blob.oid,
                                        last(path),
                                       ].join('/')))
          .catch(catchError(res));
      } else if (reqtype === 'blob') {
        return git.readObject({
          dir,
          oid: reqarg,
          // encoding: 'utf8',
        }).then((buffer) => res.type(last(path)).send(buffer.object))
          .catch(catchError(res));
      }
    }
    next();
  };

  middleware.getFileByReference =  getFileByReference;
  middleware.getCommitForRef = getCommitForRef;
  middleware.replaceBase = replaceBase;
  
  return middleware;
};
