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

### 2. VS Code Marketplace publisher and token

1. Open the [publisher management page](https://marketplace.visualstudio.com/manage) and sign in
   with a Microsoft account.
2. Create a publisher whose **ID** is `ezar101`: it must match `publisher` in
   `vscode/package.json`.
3. Open [Azure DevOps](https://dev.azure.com) with the same account (create an organization if
   it asks for one), then **User settings > Personal access tokens > New Token**:
   - Organization: **All accessible organizations**
   - Scopes: **Custom defined**, then **Marketplace > Manage**
   - Expiration: up to one year. Write the date down: you'll need a new token then.
4. Copy the token. You won't see it again.

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

### 4. GitHub secrets

In the repository, open **Settings > Secrets and variables > Actions** and add two repository
secrets:

| Name | Value |
|------|-------|
| `VSCE_PAT` | the Azure DevOps token |
| `OVSX_PAT` | the Open VSX token |

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

5. Follow the **Publish VS Code extension** workflow in the **Actions** tab. When it's done,
   check the store pages:
   - <https://marketplace.visualstudio.com/items?itemName=ezar101.viewsense-codeigniter>
   - <https://open-vsx.org/extension/ezar101/viewsense-codeigniter>

The Marketplace can take a few minutes to show a new version.

The workflow refuses a tag that doesn't match the version in `package.json`.

## When something goes wrong

- **The token expired** (`401` or `Unauthorized`): create a new token and update the secret.
- **One store worked, the other failed:** fix the cause, then publish the same `.vsix` by hand
  from the GitHub release, e.g. `npx ovsx publish viewsense-codeigniter-0.2.0.vsix -p <token>`.
  Don't push the tag again: a store refuses a version it already has.
- **A broken version is online:** publish a fixed version with a higher number. You can also
  unpublish from the publisher management page, but users who installed it keep it.
