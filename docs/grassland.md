# The problem

Okay, here's a problem: content distribution

You have a web-site that has a lot of static content and you need
that static content to be available very quickly to browsers all over
the world, without it costing you a fortune.

Luckily, this is a solved problem.  It is called a
"content-distribution network", a group of “edge servers” situated all
over the world, caching content locally near users.  If the user needs
a file from you, they ask the nearest edge server; only if the server
doesn't have the file in its own cache does it go and ask your server
(called the "origin server") for it.

Here's another problem: version management

You have a web-site that has a lot of static content and you need
to update that content.  You might have multiple version of the same
file; you might need to know the history of each file; you might even
have to roll back changes.

Again, a solved problem.  There are many version-control products out
there. Git is probably the most popular and that's the one I'll be
talking about.

Here is another problem: distribution of versioned content

You've got a web-site that has a lot of static content under version
management *and* you need to distribute that content worldwide.

That was not previously a solved problem

# The solution (in the abstract)

Obviously, people have found some way to solve this problem; there are
thousands or millions of web-sites that distribute versioned content
and each one has found some solution.  Most of those solutions are
pretty clunky.

The ideal solution would allow the user to manage the distribution of
versioned content while being:

* simple -- performing a release has to be one step or very few steps
* reliable -- hand in hand with simple, the release, and the
subsequent distribution of that release, has to work without much
human intervention
* instantaneous -- in a worldwide environment, it isn't reasonable to
bring the site down, even for a few minutes, "in the middle of the
night", because of course, worldwide, there is no middle of the
night.  It's always a busy time somewhere.
* atomic -- it is quite important that a user never be stuck between
releases.  Files, particularly HTML, often refer to each other, and if
a user is seeing some files from one release and some files from
another, the site might not function properly.
* high-performance -- in practice, fairly few files are changed from
one release to the next; unchanged files should not be evicted from
the cache.
* multi-version -- some sites need to have several versions live at
  the same time, e.g. production, stage, demo, white-label.

How would such a product be possible?


# Background: CDN

A CDN is a network of “edge servers” caching data close to the user, wherever
they are.  A CDN typically serves hundred or thousands of web-sites. Each
web-site has a single “origin server” that supplies the data.

Most CDNs supports two types of origin servers:
* data-buckets -- the CDN had a big file server somewhere and allows
  you to upload files there. 
* HTTP --  you maintain a  web server solely to answer queries from
  the CDN. 


# Problems with CDN deployment

If you use a data-bucket-style CDN for your web-site, then you have a problem.
Actually, several problem:

First, you have come up with some snapshot/upload strategy.  There are, I
believe, some plugins for WebPack that will help but still, you have to do it. 

Then of course, you don't have a good caching strategy.  How does a cache know
whether the version of a file that it has is the most recent one?  How does it
even ask?

Worse, if a user comes to the site at the wrong time, it might very well be in
the middle of an update.

And of course, it only distributes a single version at a time.  If you have
multiple versions, you need multiple sites.  If a user switches versions, his
entire cache is invalidated.

If you use an HTTP-based approach, you have all of the problems above plus you
have all the issue of keeping a web-server up 24/7.

# Background: Git

You probably have a good idea of how Git functions, but let me review some key issues:

* Git keeps every version of every file
* One version of one file is a blob
* A blob has a blob-ID
* The blob-ID is a hash of the content, so effectively there is a 1-1
* mapping between the blob and its ID.
* A commit is a mapping from path to blob-ID
* A commit has a commit-ID
* A tag is a temporary alias for a commit (and a branch is like a tag)


# Hypothetical: 

What if Git were an origin server?

It works now https://raw.githubusercontent.com/joshuachen-g/gcp-projects/master/permissions.md
Several sites use GitHub itself as an origin server.

This has some advantages. It is certainly simple to perform a release, you just
mark it with with a particular tag and that tag becomes your release.  Multiple
version?  No problem: multiple tags.

But it has some disadvantages.  There is no security, of course: the entire tree
is exposed.  There are questions of atomicity and  naming (*you* know that the
label `prod` is your production tag, but how do you get your users to request
everything from that tag?), but most important is caching.   That's the whole
point of the exercise here, right?  You need the cache to run efficiently so
users all over the world can load your site quickly.


# Caching

The two hardest problems in computer engineering are famously:

* Naming
* Off-by-one errors
* Caching

Caching is vital to good performance of web-apps.  There are two rules to
winning at caching: 

1. Never change the content pointed to by a path
2. Never change the path to reach particular content

Imagine you were requesting a file by its blob-ID, say:

`https://our-repo.net/blob/8f2b83df18a8227a05c21c2ee/index.html`

That URL obeys both rules.  A blob cannot change and there is a one-to-one
connection been a blob and its ID.

What if you request a file by its commit ID:

`https://our-repo.net/commit/5262272c567d6/index.html`

This  obeys only Rule 1:  the content at that URL will never change, but over
time, many different URLs will point to that content.  That particular URL will
soon become obsolete (still valid but no longer used).

If you ask for a file by a tag or branch,

`https://our-repo.net/tag/prod/index.html`

that URL follows neither rule.  The same URL tomorrow might retrieve different content.


# Our secret sauce: the Grassland Protocol

So here is how it works:  When the server gets a request for a blob

`https://our-repo.net/blob/8f2b83df18a8227a05c21c2ee/index.html`

It just serves it, with STATUS 200 OK.  The expiration date is set to decades in
the future so any local cache, intermediate cache, or CDN that is holding the
content for that URL can confidently serve it.

But when the server gets a request for a file at a particular commit, like this

`https://our-repo.net/commit/5262272c567d6/index.html`

Then it responds with a STATUS 301 MOVED PERMANENTLY.  It redirects it to the
underlying blob.

If the user has already been using the site, even during a previous version,
they probably already have that blob in cache.  If they don't, they ask the CDN
for it, and since it's unlikely that this user is the first person in their
geographical region to have ever used the site, the CDN probably already has the
blob.  Only in the rare case that this is the very first request for that blob
from anyone in the reguon does the CDN have to go back and ask the origin server
for it.

And the redirect itself is marked with a very long expiration date, so a cache
can hold on to it too.

If the server gets a request for a file by a branch or tag,

`https://our-repo.net/tag/prod/index.html`

it can respond with STATUS 302 MOVED TEMPORARILY, redirecting temporarily to the
blob.  This is rather expensive because the lifetime of the redirect must have a
very short lifespan, a few minutes or an hour at most, since nobody knows when
the tag or branch might move.

# Implementation

There are several way to actually exploit the Grassland protocol.  What I think
is a "standard" way is [here](https://github.com/google/grassland/tree/master/src), and the key details are as follows.

*  the protocol is written as Express middleware, responding from /blog and /commit
* /tag does not respond according to protocol for HTML files, but instead reads
  the underlying file, and looks for a line consisting of <base href="/"> and
  replaces it with the local equivalent of <base
  href="https://our-repo/commit/5262272c567d6/"> (for the appropriate value of
  the commit-ID).  This is expensive in itself, since as a tag-based request it
  must be repeated every few minutes (once every few minutes for all users
  worldwide, not once for each user), but it allows the browser to only make highly
  efficient commit and blob requests.
* a commit request like /commit/5262272c567d6/x/y/z/file.ext will be redirected
  to /blob/8f2b83df18a8227a05c21c2ee/file.ext.  Keeping the extension makes it possible for the
  server to mark the blob request with the appropriate MIME types; keeping the
  filename helps developers to make some sense in the cache logs; discarding the
  path means that if identical files show up in different places in the source
  tree, the copies will all be cached together.

# Current situation

The implementation of the Grassland protocol can be considered Beta: it works
but will likely be changed in some substantial ways before its first release.  I
hope to establish real user-groups and so on, but for the time being, you can
contact me about it at mlorton@google.com




