Solved problem:
content distribution
Problem:
Distribute static content efficiently world-wide
Solution:
Network of “edge servers” situated all over the world, caching content locally near users




Solved problem:
version management
Problem:
Preserve multiple versions of files
Solution:
VCS products like Git




Unsolved problem:
distribution of versioned content
Problem:
Distribute versioned static content efficiently world-wide



What
For the customer:
A product that allows the customer to issue releases of versioned code and data that are
Simple
Reliable
Instantaneous
Atomic
High-performance 
Multi-version (production, stage, white-label)


Who
Small-to-medium businesses that
operate a web app 
distribute significant static content
need frequent updates to content 
have small (or no) operations staff
use Git


Background: CDN
Network of “edge servers” cache data close to user
Single “origin server” supplying data
Currently Google Cloud CDN supports two types of origin servers:
Google load-balancer
Google data-buckets

All of the (current) edge servers for Google Cloud CDN

Problems with
CDN deployment
Load-balancer:
Requires (complex, expensive) instance/instance group behind it
New release requires reboot:
Operationally difficult
Down-time
Single version only
Potentially inconsistent
No built-in caching strategy
Data-bucket:
Requires custom snapshot/upload strategy
Weak caching strategy
Single version only
Potentially inconsistent

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

