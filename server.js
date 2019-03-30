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

const express = require('express');
const {grassland} = require('./grassland');

const app = express();
const port = 3000;

const getTagForHost = req => req.header('HOST').split('.')[0];

const repo = grassland('grassland',
                       {
                         storageDir: '/Users/mlorton/testrepos/vpc-4',
                         url: "https://github.com/Malvolio/grassland-demo.git",
                         prefix: 'public/',
                       }
                      );
app.use(repo);

app.get('/',
        (req, res) => 
        repo.serveFile('public/index.html', getTagForHost(req))
        .then((fileText) =>  res.type('html').send(fileText))
        .catch(e => {
          console.error(e);
          res.status(500).send(e)
        }));

app.listen(port, () => console.log(`Example app listening on port ${port}!`));

