# Security policy

## Supported versions

Only the latest version of the VS Code extension gets security fixes.

## What ViewSense does with your project

ViewSense reads the PHP files of the open project, writes a comment block at the top of view
files, and writes helper files in a `.viewsense/` folder. It never runs your PHP code, never
sends anything over the network and has no runtime dependency besides the bundled PHP parser.

## Report a vulnerability

Please don't open a public issue. Use GitHub's private reporting instead:

1. Open the [Security tab](https://github.com/Ezar101/viewsense-codeigniter/security) of the
   repository.
2. Click **Report a vulnerability** and describe the problem, with steps to reproduce it.

You'll get an answer within a week. Once a fix is published, the report can be made public, with
credit to you if you wish.
