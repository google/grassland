# The problem

Okay, here's a problem: content distribution

You've got a web-site that has a lot of static content and you need
that static content to be available very quickly to browsers all over
the world, without it costing you a fortune.

Luckily, this is a solved problem.  It is called a
"content-distribution network", a group of  “edge servers” situated all over
the world, caching content locally near users.  If the user needs a
file from you, they ask the nearest edge server; only if the server
doesn't have the file in its own cache does it go and ask your server
for it.

Here's another problem: version management

You've got a web-site that has a lot of static content and you need
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

A product that allows the customer to issue releases of versioned
data:

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




# Background: CDN

A CDN is a network of “edge servers” caching data close to the user,
wherever they are.  A CDN typically serves hundred or thousands of
web-sites. Each web-site has a single “origin server” that supplies
the data.

Most CDNs supports two types of origin servers:
* data-buckets -- the CDN had a big file server somewhere and allows
  you to upload files there. 
* http --  you maintain a  web server solely to answer queries from
  the CDN. 


# Problems with CDN deployment

If you use a data-bucket-style CDN for your web-site, then you have a
problem.  Actually, several problem.

First, you have come up with some snapshot/upload strategy.  There
are, I believe, some plugins for WebPack that will help but still, you
have to do.

Then of course, you don't have a good caching strategy.  How does a
cache know whether the version of a file that it has is the most
recent one?  How does it even ask?

Worse, if a user comes to the site at the wrong time, Potentially inconsistent

Single version only 


Load-balancer:
Requires (complex, expensive) instance/instance group behind it
New release requires reboot:
Operationally difficult
Down-time
Single version only
Potentially inconsistent
No built-in caching strategy
Data-bucket:


Background: Git
Keeps every version of every file
One version of one file is a blob
A blob has a blob-ID
The blob-ID is a hash of the content
A commit is a mapping from path to blob-ID
A commit has a commit-ID
A tag is a temporary alias for a commit
A branch is like a tag



Hypothetical: 

What if Git were 
an origin server?


It works now https://raw.githubusercontent.com/joshuachen-g/gcp-projects/master/permissions.md
Several sites do this for GitHub 
Advantages:
Simple to release
Multiple version
Disadvantages:
No security
Naming
Instantaneous?
Atomic?
Low performance



Caching
The two hardest problems in computer engineering:
Naming
Off-by-one errors
Caching
Caching is vital to good performance of web-apps

Two rules to winning at caching


Never change the content pointed to by a path
Never change the path to reach particular content



CDN-able URLs
Key Observations:
https://ourgit.net/customerRepo/blob/8f2b83df18a8227a05c21c2ee.html
  obeys Rule 1 and Rule 2
https://ourgit.net/customerRepo/commit/5262272c567d6/index.html
  obeys only Rule 1: it easily becomes obsolete (still valid but disused)
https://ourgit.net/customerRepo/tag/prod/index.html
obeys neither rule


If, 
for CDN-able URLs


[secret sauce]


https://ourgit.net/customerRepo/blob/8f2b83df18a8227a05c21c2ee.html
 STATUS 200 OK: just serve it
https://ourgit.net/customerRepo/commit/5262272c567d6/index.html
 STATUS 301 MOVED PERMANENTLY: redirect to the blob
https://ourgit.net/customerRepo/tag/prod/index.html
 STATUS 302 MOVED TEMPORARILY: redirect temporarily to the blob


Then, 
for CDN-able URLs


(for any cache, in a browser or CDN)
If you have a blob-URL, its content is valid
If you have a commit-URL, its redirect is valid
If you have a tag-URL, its redirect is valid for a few minutes
i.e., very high-performance.  Near-perfect caching


Security/mapping layer

Passes through all blob URLs
Passes through all commits on certain paths
Passes through certain tags on certain paths
Maps / to a fixed, tagged URL
Does other RE mapping



Versioning index.html: 
achieving atomicity


If
   https://customercompany.com
is mapped to 
https://ourgit.net/customerRepo/tag/prod/index.html
which points to 
https://ourgit.net/customerRepo/tag/v1.2.3/index.html
which contains
 <base href="/commit/5262272c567d6/" />
then all retrievals (of images, JS, and CSS) are from the same commit

(Might be better to process index.html specially.)



Doing it in Google


Tweak Cloud Source Repositories to support:
security/mapping layer
redirect protocol
blob retrieval
Tweak Cloud CDN to access Source Repo


Marketing it from Google


Teach it to existing small-business clients
PR effort to highlight benefits 


Impact


Increased functionality and wider use of Cloud CDN
Increased functionality and wider use of Cloud Source Repositories
Google customers have an improved experience administering their sites
Users of sites hosted by Google see better performance
Low cost to implement and operate

