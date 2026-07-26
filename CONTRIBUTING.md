<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [How to contribute to this repository](#how-to-contribute-to-this-repository)
  - [Getting started](#getting-started)
    - [Clone the repository to your account](#clone-the-repository-to-your-account)
    - [Setup](#setup)
  - [Submitting your work](#submitting-your-work)
    - [Make changes](#make-changes)
    - [Running Tests](#running-tests)
    - [Running Tests in Watch Mode](#running-tests-in-watch-mode)
    - [Submit your work](#submit-your-work)
  - [Publishing a New Release to Atmosphere](#publishing-a-new-release-to-atmosphere)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# How to contribute to this repository
[Read more about submitting a contribution.](https://opensource.guide/how-to-contribute/#how-to-submit-a-contribution)

## Getting started

Anyone is welcome to contribute.

### Clone the repository to your account

### Setup

## Submitting your work
### Make changes
* Make your changes
* Create a branch and commit the changes to your repository

### Running Tests

```bash
cd tests
meteor npm i && npm test
```

### Running Tests in Watch Mode

```bash
cd tests
meteor npm i && npm run test:watch
```

### Submit your work
Open a pull request from your branch and describe what changes you are making and why.

[Read more about how to properly open a pull request.](https://opensource.guide/how-to-contribute/#opening-a-pull-request)

## Publishing a New Release to Atmosphere

Create a release branch from a clean, up-to-date `master` branch.

In `/package/collection2/package.js`, increment the version according to semantic versioning rules.

Update the `aldeed:collection2` and `local-test:aldeed:collection2` entries in `/package/collection2/.versions` to the same version.

In `CHANGELOG.md`, add a heading for this version and a description of changes committed since the previous version.

Verify that docs in `README.md` are updated for these changes.

In root of project, run `doctoc .`. This updates both TOCs in the markdown files.

Run tests (see "Running Tests" section above).

Open and merge a release pull request. Then check out the reviewed release commit from `master` and verify that the worktree is clean:

```sh
git switch master
git pull --ff-only origin master
git status --short
```

Verify your Meteor publisher account with `meteor whoami`. Then `cd` to the `package/collection2` directory and run `meteor publish`.

Publishing may update `/package/collection2/.versions` with the exact dependency versions used for the published build. If it does, review those generated changes and merge them before tagging.

After the package is visible on Atmosphere, tag the exact published commit using the repository's `vX.Y.Z` convention and create a matching GitHub release:

```sh
git tag v1.2.3
git push origin v1.2.3
```

(substitute actual version number)
