# Publishing a release

The VS Code extension is published to two stores:

- the [VS Code Marketplace](https://marketplace.visualstudio.com/vscode), used by VS Code,
- [Open VSX](https://open-vsx.org), used by VSCodium, Cursor, Windsurf, Gitpod and others.

The [`vscode-publish.yml`](../.github/workflows/vscode-publish.yml) workflow publishes to both
when you push a tag such as `vscode-v0.1.0`. It also creates a GitHub release with the `.vsix`
file.

The store websites change from time to time. If a screen doesn't match these steps, see the
official guides: [VS Code](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
and [Open VSX](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions).

## One-time setup

### 1. Make the repository public

The store pages link to the README, the issues and the license on GitHub, so they must be
public. In the repository, open **Settings > General > Danger Zone > Change visibility**.

### 2. VS Code Marketplace publisher and Trusted Publishing

The workflow publishes to the Marketplace with **Trusted Publishing**: GitHub Actions proves its
identity with OpenID Connect (OIDC), so no Marketplace token is created, stored or renewed. You
don't need Azure DevOps or the Azure portal. (Azure DevOps "global" personal access tokens, the
old way, are retired on December 1, 2026.)

1. Open the [publisher management page](https://marketplace.visualstudio.com/manage) and sign in
   with a Microsoft account.
2. Click **Create publisher** and fill in:
   - **ID**: `ezar101`. It must match `publisher` in `vscode/package.json`, and it can't be
     changed later.
   - **Name**: the display name shown on the store, e.g. `Ezar101`.
3. In the publisher, open the **Trusted Publishing** tab and create a policy:
   - Policy name: any name, e.g. `VS Code extension release`
   - Provider: **GitHub Actions**
   - Repository owner: `Ezar101`
   - Repository: `viewsense-codeigniter`, the name **without** the owner
   - Workflow: `vscode-publish.yml`, the file name only
   - Environment: `marketplace`, the protected GitHub environment of step 4

   Only this workflow of this repository, running in that environment, can then publish as
   `ezar101`.

   A policy can't be edited: to change it, create the new policy first, then delete the old one
   with **Delete**.

### 3. Open VSX account, namespace and token

1. Create an [Eclipse account](https://accounts.eclipse.org/user/register). In its profile, fill
   in the **GitHub Username** field.
2. Sign in to [open-vsx.org](https://open-vsx.org) with GitHub, open your profile settings, link
   the Eclipse account and sign the **Publisher Agreement**.
3. Create an access token in [your tokens](https://open-vsx.org/user-settings/tokens) and copy
   it.
4. Create the `ezar101` namespace, from the `vscode/` folder:

   ```sh
   npx ovsx create-namespace ezar101 -p <your Open VSX token>
   ```

### 4. Protected GitHub environment

The publish job runs in a GitHub environment named `marketplace`. It waits for your approval
before it starts, so a tag pushed by mistake publishes nothing. It also holds the Open VSX token:
only an approved publish job can read it.

In the repository, open **Settings > Environments > New environment**, name it `marketplace`,
then:

1. **Required reviewers:** check it and add yourself. Leave **Prevent self-review** unchecked,
   or you couldn't approve your own releases.
2. **Deployment branches and tags:** choose **Selected branches and tags**, then add a **tag**
   rule with the pattern `vscode-v*`. Only release tags can then use this environment.
3. **Environment secrets:** add `OVSX_PAT`, with the Open VSX token as its value. The Marketplace
   needs no secret.

If an `OVSX_PAT` **repository** secret exists from an older setup (**Settings > Secrets and
variables > Actions**), delete it: the environment secret replaces it.

## Each release

1. In `vscode/package.json`, set `version` (e.g. `0.2.0`, following
   [Semantic Versioning](https://semver.org)).
2. In `vscode/CHANGELOG.md`, move the `Unreleased` items under a new `## [0.2.0] - YYYY-MM-DD`
   heading, and add the comparison link at the bottom.
3. Commit, push, and wait for the CI to pass.
4. Tag the commit and push the tag:

   ```sh
   git tag vscode-v0.2.0
   git push origin vscode-v0.2.0
   ```

5. In the **Actions** tab, open the **Publish VS Code extension** run. It waits with the status
   **Waiting**: click **Review deployments**, check `marketplace` and click **Approve and
   deploy**. GitHub also sends you a notification.
6. When it's done, check the store pages:
   - <https://marketplace.visualstudio.com/items?itemName=ezar101.viewsense-codeigniter>
   - <https://open-vsx.org/extension/ezar101/viewsense-codeigniter>

The Marketplace can take a few minutes to show a new version.

The workflow refuses a tag that doesn't match the version in `package.json`.

## When something goes wrong

- **The Marketplace refuses the workflow** (`401`, `403` or `Unauthorized`): check the Trusted
  Publishing policy of the publisher. The repository, the workflow file name and the environment
  (`marketplace`) must match exactly, e.g. after a rename.
- **The run never starts:** it's waiting for your approval (step 5), or the tag doesn't match
  the `vscode-v*` rule of the environment.
- **The Open VSX token expired:** create a new token and update the `OVSX_PAT` secret of the
  `marketplace` environment.
- **One store worked, the other failed:** fix the cause, then publish the same `.vsix` by hand
  from the GitHub release, e.g. `npx ovsx publish viewsense-codeigniter-0.2.0.vsix -p <token>`.
  Don't push the tag again: a store refuses a version it already has.
- **A broken version is online:** publish a fixed version with a higher number. You can also
  unpublish from the publisher management page, but users who installed it keep it.
