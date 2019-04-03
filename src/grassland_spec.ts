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
import proxyquire = require('proxyquire');



function cacheArgs(cacheControl: string): Set<string> {
  return new Set((cacheControl || '').split(/,\s*/));
}

const FIVE_MINUTES = 5 * 60 * 1000;
let doesExist = true;
let currentTime = FIVE_MINUTES;


function makeResult() {
  const res = jasmine.createSpyObj("response", ["status", "send", "set", "redirect", "type"]);
  res.redirect.and.returnValue(res);
  res.send.and.returnValue(res);
  res.set.and.returnValue(res);
  res.status.and.returnValue(res);
  res.type.and.returnValue(res);
  return res;
}

describe('grassland', () => {
  const configInfo = {
    username: "config-username",
    password: "config-password",
    token: "config-token",
    oauth2format: "github" as "github" | "bitbucket" | "gitlab",
    url: "config-url",
    storageDir: "storageDir",
    fetchTime: 5,
  };

  const refReq = {
    path: "root/ref/0abcd/path/to/index.html",
  } as express.Request;

  const commitReq = {
    path: "root/commit/1abcd/path/to/index.html",
  } as express.Request;
  
  const blobReq = {
    path: "root/blob/2abcd/index.html",
  } as express.Request;

  const extReq = {
    path: "something-else",
  } as express.Request;

  const getNow = () => 0;

  let middleware: express.RequestHandler;
  
  let gitStub: any;
  let fsStub: any;
  let nowStub: any;
  let next: express.NextFunction;

  let x: number = gitStub;
  
  beforeEach(() => {
    gitStub = jasmine.createSpyObj('git', ["clone", "pull", "readObject", "resolveRef"]);
    fsStub = jasmine.createSpyObj('fs', ["existsSync"]);
    nowStub = jasmine.createSpyObj('now', ["getNow"]);
    next = jasmine.createSpy('next');
    gitStub.plugins = {
      set: () => {}
    };

    const {grassland} = proxyquire.noCallThru()(
      './grassland',
      {
        'isomorphic-git' : gitStub,
        'fs': fsStub,
        './now': nowStub,
      });
  
    middleware = grassland('root', configInfo).middleware;

    doesExist = true;
    currentTime = FIVE_MINUTES - 1;
    gitStub.clone.and.returnValue(Promise.resolve());
    gitStub.pull.and.returnValue(Promise.resolve());
    gitStub.readObject.and.returnValue(Promise.resolve({
      oid: "2abcd",
      object: "content-of-index-file",
    }));
    gitStub.resolveRef.and.returnValue(Promise.resolve("2abcd"));
    fsStub.existsSync.and.callFake(() => doesExist);
    nowStub.getNow.and.callFake(() => currentTime);
  });


  it('clones the repo if it does not exist', async () => {
    doesExist = false;
    const res = makeResult();
    await middleware(commitReq, res, next);
    expect(gitStub.clone).toHaveBeenCalled();
  });
  
  it('pulls the repo if it exists and time has passed', async () => {
    doesExist = true;
    currentTime = FIVE_MINUTES + 1;
    const res = makeResult();
    await middleware(commitReq, res, next);
    expect(gitStub.pull).toHaveBeenCalled();
  });

  it('does not pull the repo if it exists but not enough time has passed', async () => {
    doesExist = true;
    currentTime = FIVE_MINUTES - 1;
    const res = makeResult();
    await middleware(commitReq, res, next);
    expect(gitStub.pull).not.toHaveBeenCalled();
  });
  
  it('redirects on ref', async () => {
    const res = makeResult();
    
    await middleware(refReq, res, next);
    expect(gitStub.resolveRef).toHaveBeenCalled();
    expect(gitStub.readObject).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, '/root/blob/2abcd/index.html');
    expect(!!res.set.calls.argsFor(0)[0]['Cache-Control']).toEqual(false);
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects on commit', async () => {
    const res = makeResult();
    await middleware(commitReq, res, next);
    expect(res.redirect).toHaveBeenCalledWith(301, '/root/blob/2abcd/index.html');

    const hs = cacheArgs(res.set.calls.argsFor(0)[0]['Cache-Control']);
    expect(hs.has('immutable')).toEqual(true);
    expect(hs.has('public')).toEqual(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds directly to blob request', async () => {
    const res = makeResult();
    await middleware(blobReq, res, next);
    expect(res.send).toHaveBeenCalledWith("content-of-index-file");

    const hs = cacheArgs(res.set.calls.argsFor(0)[0]['Cache-Control']);
    expect(hs.has('immutable')).toEqual(true);
    expect(hs.has('public')).toEqual(true);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('responds directly to blob request', async () => {
    const res = makeResult();
    await middleware(extReq, res, next);
    expect(next).toHaveBeenCalled();
  });
});
