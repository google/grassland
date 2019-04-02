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

const realFs = require('fs')
const isomorphicGit = require("isomorphic-git");

const realNow = () => Date.now();

isomorphicGit.plugins.set('fs', realFs)

const last = (ary) => ary[ary.length-1];

const catchError = (res) => (e) => {
  console.error(e);
  res.status(500).send(e);
};

const makePath = (p) => p.join('/');

exports.grassland = (root, config, inject) => {

  /**
   * For testing ONLY -- you can inject replacement mocks for fs, git, and now()
   */
  const {fs, git, getNow} = Object.assign({
    fs: realFs,
    git: isomorphicGit,
    getNow: realNow,
  }, inject);
  
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
      const now = getNow();
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

  
  /**
   * Given a path and a reference (a commit or a ref -- a ref being a tag or a branch), 
   * returns the underlying object.
   */
  const getFileByReference = (filepath, ref) =>
        checkRepo()
        .then(() => git.resolveRef({dir, ref}))
        .then((oid) => git.readObject({ dir, oid, filepath, encoding: 'utf8' }))
        .then((blob) => blob.object);
  
  /**
   * What it says on the tin: given a ref (that is, a tag or a branch), finds the
   * commit-id that, as of the most recent pull, is pointed to by that ref.
   */
  const getCommitForRef = (ref) =>
        checkRepo()
        .then(() => git.resolveRef({ dir, ref }));

  /**
   * Perform the standard substitution in the html file.
   * the first occurance of <base href="/"> will be transmuted into
   * <base href="https://example.somecdn.com/root/commit/5fbe1f58671/" >
   * (assuming those are the value for cdn, root, and commit.
   * It's done with a reg-exp, which is getting into "the pony, he comes" 
   * territory https://is.gd/41FT2p but should be OK.
   */
  const baseRE = /(<base\s+href=")\/("\s*)/i 
  const replaceBase = (fileText, commit, cdn) =>
        fileText.replace(baseRE, '$1' + makePath([ cdn || '', root , 'commit', commit, '']) + '$2');

  /**
   * Get an actual file at a filepath and tag or commit, not just a
   * redirect.  This is used for getting index.html (and equivalent
   * files), where a <base> tag must be updated with the path to the
   * CDN and a commit-id.  By default, it uses replaceBase() to
   * re-write the file, but the caller can pass in some other function
   * of type (string) => string.
   */
  const serveFile = (filepath, ref, cdn, replaceFunction) => 
        Promise.all([ getFileByReference(filepath, ref), getCommitForRef(ref)])
        .then(([fileText, commit]) => (replaceFunction || replaceBase)(fileText, commit, cdn));

  const resolveCommit = (sha) => checkRepo().then(() => sha);

  /**
   * the redirect sent in response to a request-by-commit or a file sent in request
   * to a request-by-blob-id is permanent and any cache can hold it as long as it wishes.
   */
  const permanentHeaders = {
    'Cache-Control': 'immutable, public',
    'Expires': 'Tue Dec 31 2069 16:00:00 GMT-0800',
  }


  /**
   * This is the actual Grassland function.  It responds to three kinds of requests
   * * /ref, a request by tag or branch -- it responds with a temporary redirect to a blob
   * * /commit, a request by commit -- it responds with a permanent redirect to a blob
   * * /blob, a request by blob -- it responds with the content of the file
   */
  const middleware = (req, res, next) => {
    const [command, reqtype, refId, ...path] = req.path.split('/').filter(p => p);
    if (command === root) {
      if ((reqtype === 'ref') || (reqtype === 'commit')) {
        const isCommit = reqtype === 'commit';
        const getCommit = isCommit ? resolveCommit: getCommitForRef;
        const filepath = (config.prefix || '') + makePath(path);

        return getCommit(refId).then((oid) => git.readObject({ dir, oid, filepath }))
          .then((blob) => res
                .set(isCommit ? {'ETag': blob.oid, ...permanentHeaders,}: {})
                .redirect((reqtype === 'ref') ? 302 : 301,
                          makePath(['',
                                    root,
                                    'blob',
                                    blob.oid,
                                    last(path),  // preserve the file-name, for MIME-type
                                   ])))
          .catch(catchError(res));
      } else if (reqtype === 'blob') {
        const oid = refId;
        return checkRepo()
          .then(() => git.readObject({dir, oid}))
          .then(({oid, object}) => res
                .set({
                  'ETag': oid,
                  ...permanentHeaders,
                })
                .type(last(path))
                .send(object))
          .catch(catchError(res));
      }
    }
    next();
  };

  return {
    getFileByReference,
    getCommitForRef,
    replaceBase,
    serveFile,
    middleware,
  };
};
