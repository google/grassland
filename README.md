# Grassland

This is a Node implementation of the Grassland protocol, suitable for
use as Express middleware.

See [here](./docs/grassland.md) for a discussion of what the Grassland
protocol is and why you want to use it.

## Disclaimer

This is not an officially supported Google product!

It is an open-source product released under the Apache 2.0 licence

## Static service

The Grassland middleware can be installed like this:

``` javascript
     const repo = grassland(path, config)
     app.use(repo);
```

The path is where the static content will be served from, so if it is
set to 'static', you should configure the CDN to use
`http://example.com/static` as the origin server.

The config is an object that controls the details of the the
Grassland.  Many of the fields are passed are passed to the underlying
Git implementation, isomorphic-git, and you can find the details of
their meanings [there](https://isomorphic-git.org/docs/en/clone).
    
* username
* password
* token
* oauth2format
* url
* corsProxy
* noGitSuffix
* depth
* since
* exclude
* relative
* headers

Of these, only `url` is required -- at least by the software: your
repo may require you to add other security information .  There are a few Grassland-specific
fields too:

* prefix -- a prefix added to the path coming from the CDN before it
is sought in the repo.  For example, if the prefix is `public` then
the request for
`https://example.com/static/commit/63a4fe21/images/background.png` will
return the data found at `/public/images/background.png`. 
* storageDir -- a local directory to use as the working directory for
  the local repo.
* fetchTime -- the minimum time (in minutes) between fetches from the
  remote repo.  If it is zero, the fetch will never be performed and
  the assumption is that the repo at `storageDir` is being updated in
  some other way.

Of this, only `storageDir` is required, but for most applications,
`fetchTime` should be set too.

## File service

The middleware can be used alone, but then you have to figure out how
to point all the URLs requesting static data to the CDN and to the
right commit.  Since this can be tricky, Grassland provides some
functions that will do the work.

The assumption is that there is a single HTML file, served typically
from the root, which is created by taking an file from the repo and
finding a line that looks like this:

    <base href="/" >

then modify it to look like this:

    <base href="https://example.thiscdn.com/commit/63a4fe21/" >


where 63a4fe21 is the commit currently pointed to by some
specific tag (perhaps "live" or "prod" or something like that).  This
can be accomplished by a method called `serveFile()`

``` javascript
app.get('/', (req, res) =>
  repo.serveFile('public/index.html', 'prod', 'http://example.thiscdn.com/'),
    .then((fileText) =>  res.type('html').send(fileText))
    .catch(e => {
      console.error(e);
      res.status(500).send(e)
    })
);
```



## TODO


* better tests
* a strategy for dealing with compiled static files
* a strategy for dealing with robots
* [stronger security](https://github.com/google/grassland/issues/3) --
  right now, the code assumes that everything under the "root" given
  for your repo is supposed to be entirely public, every version of
  every file.  Obviously, this isn't the case universally.


Copyright 2019 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
