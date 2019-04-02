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

import express = require('express');

import fs = require('fs');
import git = require("isomorphic-git");

const getNow = () => Date.now();

git.plugins.set('fs', fs)

function last<T>(ary: T[]) : T {
  return ary[ary.length-1];
}

const catchError = (res: express.Response) => (e: any) => {
  console.error(e);
  res.status(500).send(e);
};

const makePath = (p: string[]) => p.join('/');


export interface GrasslandConfiguration {
  username?: string;
  password?: string;
  token?: string;
  oauth2format?: 'github' | 'bitbucket' | 'gitlab';
  url?: string;
  corsProxy?: string;
  noGitSuffix?: string;
  depth?: number;
  since?: Date;
  exclude?: string[];
  relative?: boolean;
  headers?: {[key: string]: string};
  storageDir?:string;
  prefix?: string;
  fetchTime?: number;
}

export class Grassland {
  git = git;
  fs = fs;

  private readonly dir = this.config.storageDir;

  private fetchCheck = Promise.resolve();
  private lastFetchedTime = 0;
  
  private checkRepo() {
    if (this.config.fetchTime > 0) {
      const now = getNow();
      if (!fs.existsSync(this.dir)) {
        const cloneInfo = {
          username: this.config.username,
          password: this.config.password,
          token: this.config.token,
          oauth2format: this.config.oauth2format,
          url: this.config.url,
          corsProxy: this.config.corsProxy,
          depth: this.config.depth,
          since: this.config.since,
          exclude: this.config.exclude,
          relative: this.config.relative,
          headers: this.config.headers,
        };
        this.lastFetchedTime = now;
        this.fetchCheck = this.git.clone({ dir: this.dir, noCheckout: true, ...cloneInfo });
      } else if ( (now - this.lastFetchedTime) > (this.config.fetchTime * 60 * 1000)) {
        const pullInfo = {
          username: this.config.username,
          password: this.config.password,
          token: this.config.token,
          oauth2format: this.config.oauth2format,
          headers: this.config.headers,
        };
        this.lastFetchedTime = now;
        this.fetchCheck = this.git.pull({ dir: this.dir, ...pullInfo });
      }
    }
    return this.fetchCheck;
  }

  
  /**
   * Given a path and a reference (a commit or a ref -- a ref being a tag or a branch), 
   * returns the underlying object.
   */
  getFileByReference(filepath: string, ref: string) {
    return this.checkRepo()
      .then(() => this.git.resolveRef({ dir: this.dir, ref}))
      .then((oid) => this.git.readObject({ dir: this.dir,oid, filepath, encoding: 'utf8' }))
      .then((blob) => blob.object);
  }
  
  /**
   * What it says on the tin: given a ref (that is, a tag or a branch), finds the
   * commit-id that, as of the most recent pull, is pointed to by that ref.
   */
  getCommitForRef(ref: string) {
    return this.checkRepo()
      .then(() => this.git.resolveRef({ dir: this.dir,ref }));
  }
  
  /**
   * Perform the standard substitution in the html file.
   * the first occurance of <base href="/"> will be transmuted into
   * <base href="https://example.somecdn.com/root/commit/5fbe1f58671/" >
   * (assuming those are the value for cdn, root, and commit.
   * It's done with a reg-exp, which is getting into "the pony, he comes" 
   * territory https://is.gd/41FT2p but should be OK.
   */
  replaceBase(fileText: string, commit: string, cdn: string) {
    const baseRE = /(<base\s+href=")\/("\s*)/i 
    return fileText.replace(baseRE, '$1' + makePath([ cdn || '', this.root , 'commit', commit, '']) + '$2');
  }
  
  /**
   * Get an actual file at a filepath and tag or commit, not just a
   * redirect.  This is used for getting index.html (and equivalent
   * files), where a <base> tag must be updated with the path to the
   * CDN and a commit-id.  By default, it uses replaceBase() to
   * re-write the file, but the caller can pass in some other function
   * of type (string) => string.
   */
  serveFile(filepath: string, ref: string, cdn: string, replaceFunction?: ((s1:string, s2:string, s3:string) => string)): Promise<string> {
    return Promise.all([ this.getFileByReference(filepath, ref), this.getCommitForRef(ref)])
      .then(([buffer, commit]) => {
        const f = replaceFunction || ((s1:string, s2:string, s3:string) => this.replaceBase(s1, s2, s3));
        return f(buffer.toString(), commit, cdn);
      });
  }

  readonly middleware: express.RequestHandler;
  
  constructor(private readonly root: string,
              private readonly config: GrasslandConfiguration,
              private readonly inject = {}) {
    /**
     * For testing ONLY -- you can inject replacement mocks for fs, git, and now()
     const {fs, git, getNow} = Object.assign({
     fs: realFs,
     git: isomorphicGit,
     getNow: realNow,
     }, inject);
    */

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
     * It is a function, not a method, so the user does not have to worry about binding.
     */
    this.middleware = (req: express.Request,
                       res: express.Response,
                       next: express.NextFunction): void => {
      const [command, reqtype, refId, ...path] = req.path.split('/').filter(p => p);
      const resolveCommit = (sha: string) => this.checkRepo().then(() => sha);

      if (command === root) {
        if ((reqtype === 'ref') || (reqtype === 'commit')) {
          const isCommit = reqtype === 'commit';
          const getCommit = isCommit ? resolveCommit: ((s: string) => this.getCommitForRef(s));
          const filepath = (this.config.prefix || '') + makePath(path);

          getCommit(refId).then((oid) => this.git.readObject({ dir: this.dir, oid, filepath }))
            .then((blob) => res
                  .set(isCommit ? {'ETag': blob.oid, ...permanentHeaders,}: {})
                  .redirect(isCommit? 301: 302,
                            makePath(['',
                                      root,
                                      'blob',
                                      blob.oid,
                                      last(path),  // preserve the file-name, for MIME-type
                                     ])))
            .catch(catchError(res));
          return;
        } else if (reqtype === 'blob') {
          const oid = refId;
          this.checkRepo()
            .then(() => this.git.readObject({ dir: this.dir, oid}))
            .then(({oid, object}) => res
                  .set({'ETag': oid, ...permanentHeaders,})
                  .type(last(path))
                  .send(object))
            .catch(catchError(res));
          return;
        }
      }
      next();
    };
  }
}

export function grassland(root: string, config: GrasslandConfiguration) {
  return new Grassland(root, config);
}

