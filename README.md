# docmost-extensions

Our editor extensions and modules for [Docmost](https://github.com/docmost/docmost),
packaged as an **overlay on top of a pinned upstream release** and shipped as our own
Docker image (deployed on Railway). No long-lived fork: upstream is fetched at build
time, our files are copied on top, and a handful of tiny patches wire them in.

Current pin: see [`UPSTREAM_VERSION`](UPSTREAM_VERSION).

## Layout

```
UPSTREAM_VERSION        git tag of docmost/docmost to build from (e.g. v0.96.0)
extensions/             overlay: NEW files only, mirroring the upstream tree
  packages/editor-ext/src/lib/table-of-contents/         TOC: Tiptap node (schema, command)
  apps/client/src/features/editor/components/toc-block/  TOC: React node view + CSS module
  apps/server/src/core/comment/resolution/               comment resolution: NestJS module
  apps/client/src/features/comment/resolution/           comment resolution: hook, mutation, button
patches/                small `git diff` patches to EXISTING upstream files (wiring only)
scripts/build-tree.sh   clone upstream @ tag + overlay + patches  ->  build/
Dockerfile              same thing inside a build stage, then the upstream build + runtime
docker-compose.yml      local stack (our image + Postgres + Redis), mirrors upstream's
build/                  generated, git-ignored
```

### Why overlay + patches

* Upstream moves fast. Bumping is a one-line change to `UPSTREAM_VERSION`; only the
  patches can conflict, and they are a few lines each.
* Our code is clearly separated from upstream code (licensing, review, ownership).
* The runtime image follows the upstream recipe: same base image, pnpm version,
  pruning, `USER node` and `CMD`. The only omission is upstream's
  `VOLUME ["/app/data/storage"]` instruction, which Railway's builder rejects;
  mount a volume at that path yourself (Railway Volume, or the compose file).

What the build does **not** include: the private `apps/server/src/ee` submodule
(Docmost Enterprise). The server checks for it with guarded `require()` calls and
runs without it, so enterprise-only server features are simply absent. The official
`docmost/docmost` image is built with that submodule, so this is the one functional
difference from the official image.

## Extensions

### Table of contents block (`/toc`)

An in-page TOC block, like Confluence's TOC macro.

* Node `tableOfContents` (`group: block`, `atom`, `selectable`, `draggable`), single
  attribute `maxLevel` (default 3, stored as `data-max-level`). Command
  `setTableOfContents()`.
* The block stores **no heading data**. The React view re-derives the heading list from
  the document on every transaction (`useEditorState` selector over
  `doc.descendants`), skipping empty headings, so it is live for local edits and for
  collaborators' edits.
* Clicking an entry scrolls to the heading (offsetting the fixed app header) and
  moves the cursor there. "+ / -" controls change the depth; they are only rendered
  when the editor is editable, so read mode and shared pages show a plain list.
* Server side (search indexing, HTML/Markdown/PDF export) renders an empty
  `<div data-type="tableOfContents">` placeholder. The docx exporter throws on unknown
  node types, so a one-line patch registers a no-op handler for it.

Follow-ups:

* Server-side export could render a static heading list instead of the empty
  placeholder. `renderHTML` only sees the node itself, so this needs a small
  pre-pass over the document in `apps/server/src/integrations/export` (patch).
* UI strings use `t()` and fall back to English; add translations to
  `apps/client/public/locales/*/translation.json` via a patch if needed.

### Comment resolution (resolve / re-open comment threads)

Upstream ships the UI scaffolding for resolving comments in the open-source
client (Open/Resolved tabs, menu item, API client call, websocket handling) and
the data model in the open-source server (`resolved_at`, `resolved_by_id`,
collaboration handler, notification job), but the `POST /comments/resolve`
endpoint and the resolve button live in the enterprise edition and are gated by
a license feature flag. This extension provides an **independent
implementation** of the missing pieces; nothing is copied from any `ee`
directory.

* Server: `CommentResolutionModule` (new files) adds `POST /api/comments/resolve`
  taking `{ commentId, pageId, resolved }`. Permission: anyone who may comment on
  the page. It updates `resolved_at`/`resolved_by_id`, syncs the inline
  comment mark through the collaboration server, emits the `commentResolved`
  websocket event, queues the existing "comment resolved" notification and
  writes `comment.resolved` / `comment.reopened` audit events. Only top-level
  threads can be resolved. Registered via a two-line patch to `core.module.ts`.
* Client: our own `useResolveCommentMutation`, a `ResolveCommentButton` and a
  `useCanResolveComments()` hook (always true). One patch swaps the enterprise
  imports in `comment-list-item.tsx` and `comment-menu.tsx` for ours.

Note: Docmost sells this as an Enterprise feature. Building it here was a
deliberate decision; the AGPL permits modifying the core, and the enterprise
license only covers the `ee` directories, which this repo never copies.

## Adding another extension

Editor extensions need these wiring points (plus one if the node is a block).
Server-side features follow the comment-resolution example instead: a new
NestJS module under `extensions/apps/server/src/...` plus a patch to the module
that should import it (`core.module.ts` or `app.module.ts`).

1. **Schema**: new folder `extensions/packages/editor-ext/src/lib/<name>/` with the
   Tiptap `Node`/`Mark`/`Extension` and an `index.ts`. Follow upstream `callout` and
   `page-break` for style; take a `view` option and use `ReactNodeViewRenderer` in
   `addNodeView()` if it has a React view.
   Patch `packages/editor-ext/src/index.ts` to export it.
2. **Client**: React view in
   `extensions/apps/client/src/features/editor/components/<name>/` (Mantine, CSS
   modules, `react-i18next`). Patch
   `apps/client/src/features/editor/extensions/extensions.ts` to import it and add
   `MyNode.configure({ view: MyView })` to `mainExtensions`.
3. **Server**: patch `apps/server/src/collaboration/collaboration.util.ts` to add the
   extension to `tiptapExtensions`. Without this the collaboration server cannot
   deserialise pages containing the node (content is dropped / fails to persist).
4. **Slash menu**: patch
   `apps/client/src/features/editor/components/slash-menu/menu-items.ts` to add an
   item (`title`, `description`, `searchTerms`, `icon`, `command`).
5. **Exports** (block nodes): add a handler to `defaultAsyncNodes` in
   `packages/editor-ext/src/lib/prosemirror-docx/schema.ts` or docx export of pages
   containing the node throws. HTML/Markdown export go through `renderHTML`.

Rules:

* `extensions/` may only contain **new** files. `scripts/build-tree.sh` fails if an
  overlay path already exists upstream; edit existing files with a patch instead.
* Keep patches to a few context lines around stable anchors (import lists, extension
  arrays) so they survive bumps.
* Never copy anything from `apps/server/src/ee`, `apps/client/src/ee` or
  `packages/ee`: those are under the Docmost Enterprise License, not AGPL.

### Creating a patch

```bash
SKIP_PATCHES=1 scripts/build-tree.sh      # upstream + overlay, no patches
cd build && $EDITOR apps/client/src/features/editor/extensions/extensions.ts
git diff -- apps/client/src/features/editor/extensions/extensions.ts \
  > ../patches/0006-client-register-my-node.patch
cd .. && scripts/build-tree.sh            # must apply cleanly
```

Patches are applied in filename order; number them.

## Building locally

```bash
scripts/build-tree.sh          # -> build/ (needs git + network)
cd build
pnpm install --frozen-lockfile # our overlay adds no dependencies
pnpm build                     # editor-ext, base-formula, client, server
```

Run the result against the compose databases:

```bash
docker compose up -d db redis
# then in build/, with APP_URL, APP_SECRET, DATABASE_URL, REDIS_URL set (see upstream .env.example):
pnpm start
```

Or build and run the image exactly as Railway will:

```bash
docker compose up --build      # http://localhost:3000, /api/health
```

The repo's `.dockerignore` excludes `build/`, so the Docker context stays small; the
builder stage fetches upstream itself.

## Bumping the upstream version

1. Check the tag exists: `git ls-remote --tags https://github.com/docmost/docmost 'v0.97.*'`.
2. Edit `UPSTREAM_VERSION`.
3. `scripts/build-tree.sh`. If a patch no longer applies the script stops and names it.
4. Re-roll that patch: `SKIP_PATCHES=1 scripts/build-tree.sh`, re-apply the intent by
   hand in `build/` (or `git -C build apply --3way patches/000X-*.patch` and fix the
   conflict), `git -C build diff -- <file> > patches/000X-*.patch`, run the script
   again until all patches apply.
5. Re-check the wiring points for upstream changes that affect us (new export paths,
   renamed extension arrays, Dockerfile changes: compare `build/Dockerfile` with ours
   and port anything that changed in the `installer` stage).
6. `pnpm install && pnpm build` in `build/`, then `docker compose up --build` and try
   `/toc` in a page.
7. Commit `UPSTREAM_VERSION` and the re-rolled patches together.

## Deploying on Railway

The Railway service currently runs the `docmost/docmost` image. Switch it to this repo:

1. Push this repository to GitHub.
2. In the Railway project, open the Docmost **service → Settings → Source**.
   Disconnect the Docker image source and connect the GitHub repo
   (`docmost-extensions`, branch `main`, root directory `/`).
3. Leave **Build** on automatic: Railway detects the `Dockerfile` at the repo root.
   No build args, no custom build/start command, no watch paths needed. The build
   needs network access to fetch upstream, which Railway provides.
4. Keep the template's **Postgres** and **Redis** services and the existing service
   **variables** (`APP_URL`, `APP_SECRET`, `DATABASE_URL`, `REDIS_URL`, storage/mail
   settings). Nothing changes: the image exposes port 3000 and runs `pnpm start` as
   the upstream image does. If `STORAGE_DRIVER` is `local` (the template default),
   make sure the service has a **Railway Volume mounted at `/app/data/storage`**; the
   template ships one, and the Dockerfile cannot declare it (Railway rejects
   `VOLUME`).
5. Deploy. Watch the build log for the `==> Applying ...patch` lines and the health
   check on `/api/health`. Database migrations run on start as before.

To roll back, point the service source back at the `docmost/docmost:<tag>` image.
To bump Docmost in production, bump `UPSTREAM_VERSION` as above and push.

## License

Our code (`extensions/`, `patches/`, `scripts/`, `Dockerfile`) is licensed under the
GNU Affero General Public License v3.0, the same license as Docmost; see
[LICENSE](LICENSE). Upstream Docmost is AGPL-3.0 except the `ee` directories, which
are under the Docmost Enterprise License and are never copied into this repository.
