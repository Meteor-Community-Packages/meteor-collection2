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

Check out `master` branch.

In `/package/collection2/package.js`, increment the version according to semantic versioning rules.

In `CHANGELOG.md`, add a heading for this version and a description of changes committed since the previous version.

Verify that docs in `README.md` are updated for these changes.

In root of project, run `doctoc .`. This updates both TOCs in the markdown files.

Run tests (see "Running Tests" section above).

`cd` to `package/collection2` directory and run `meteor publish`. (You must have permission.)

Commit all version and docs changes, tag, and push:

```sh
git add .
git commit -m "publish 1.2.3"
git push origin master
git tag 1.2.3 && git push --tags
```

(substitute actual version number)
