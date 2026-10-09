# Running both repos on Dokploy

The preferred way to get an instance: no stack to boot, and a GitHub-hosted
runner can drive it over HTTPS. Condensed from the ComPlat Dokploy runbook — procedure A was executed end to
end there, procedure B's field values were read from the compose file.

Dokploy v0.30.6. `<suffix>` below is your Dokploy instance's domain suffix.

## A. chemotion_saurus — Application

Docusaurus, built by Railpack, served by Caddy. ~3 minutes from Deploy to a
live page.

1. **Create Service** → type **Application**, name = the branch, sanitised.
2. **General** → Provider `Git`, Repository
   `https://github.com/ComPlat/chemotion_saurus`, Branch = yours, Build Path
   `/`. **Save**, then Build Type **Railpack**, **Save** again.
3. **Environment** → `RAILPACK_SPA_OUTPUT_DIR=build`. The pre-filled
   `NODE_ENV` / `PORT` lines are placeholder text; type over them. **Save**.
4. **Domains → Add Domain** → Host `<initials>-<name>-deploy.<suffix>`,
   **Path `/docs`**, **Strip Path on**, Container Port `80`, HTTPS on,
   Let's Encrypt.
5. **Deploy**. The site opens at `https://<host>/docs/`; the bare root serves
   nothing, which is expected.

**Path and Strip Path are not optional.** `docusaurus.config.js` hardcodes
`baseUrl: "/docs/"` with no environment override, so every asset URL points at
`/docs/…` while Railpack's Caddy serves `build/` at `/`. Without them you get
an unstyled page reading *"Your Docusaurus site did not load properly."* The
GitLab wiki omits both.

## B. chemotion_ELN — Compose

1. **Create Service** → type **Compose**, name = the branch. If the name ends
   in a digit, spell it out in App Name (`ketcher2` → `ketchertwo`).
2. **General** → Provider `Git`, Repository
   `https://github.com/ComPlat/chemotion_ELN`, Branch = yours, Compose Path
   `./docker-compose.p2d.yml`. The branch must carry `Dockerfile.p2d` and
   `docker-compose.p2d.yml` — rebase onto `main` if it does not.
3. **Domains → Add Domain** → press the ⟳ fetch button, Service `app`, Host as
   above, Container Port `4000`, HTTPS on, Let's Encrypt.
4. **Advanced → Run Command** → copy the greyed Default Command, drop the
   leading `docker`, append the flags:
   ```
   compose -p <this service's own app-name> -f ./docker-compose.p2d.yml up -d \
     --build --remove-orphans --force-recreate --renew-anon-volumes
   ```
   `<app-name>` is the grey string under the service title. Copying a service
   and leaving the old name here **redeploys the original instead**.
5. **Deploy**. Comes seeded with development seeds 1, 3, 4 and 5. Expect
   several minutes for gems and assets.

### If the seeded admin will not log in

`rails` is not on `PATH` in a non-login shell because the asdf shims are not
loaded. The password below is the documented development default on a
disposable instance — never use it anywhere that holds real data:

```bash
export PATH=/asdf/shims:$PATH
cd /chemotion/app
bundle exec rails runner 'a = Admin.find_by(name_abbreviation: "ADM") || Admin.first;
  a.update!(account_active: true, password: "adminadmin", password_confirmation: "adminadmin");
  a.update_columns(locked_at: nil, failed_attempts: 0)'
```

`update!`, not `update`: the non-bang form returns `false` silently on a
validation failure, so it looks like it worked. And clear `locked_at` /
`failed_attempts`, or Devise keeps rejecting a correct password.

### If background jobs never run

There is no separate worker service in `docker-compose.p2d.yml`; `app` carries
`CONFIG_ROLE=combine` and is meant to start delayed_job itself. If the queue
stalls, start one in the same shell:

```bash
bundle exec bin/delayed_job start   # status | restart | stop
```

It dies on the next redeploy. A stale `tmp/pids/delayed_job.pid` after an
unclean stop makes `start` think a worker is alive — delete it and retry.

## What a capture flow needs from a deployment

| Need | On Dokploy |
|---|---|
| a URL | the domain above → `ELN_BASE` |
| a login | the seeded users, unlocked as above → `ELN_*_PASSWORD` |
| **fixtures** | a shell on the app container → `ELN_EXEC` |
| a commit to record | the ref you deployed → `ELN_SHA` |

The third is the one that bites. `rails()` needs to reach the app's shell, so
`ELN_EXEC` must be something like
`ssh <dokploy-host> docker exec -i <app container> bash -lc`. Without a shell,
a flow has to build its state through the app's own API and must say in the
task that it does — or, where neither is possible, run against the seeded data
and assert what the seeds actually contain rather than assuming.

### Two things p2d does not give you

**No job worker.** `docker-compose.p2d.yml` defines `db`, `app` and
`configure`; `app` carries `CONFIG_ROLE=combine` and the base image is meant to
start delayed_job itself. Anything asynchronous - SDS extraction, reports,
exports - spins forever if it did not, which reads as a broken feature rather
than a missing process. Start one by hand (it dies on the next redeploy), or
add a worker service to the compose you use for capture.

**No test harness.** `cypress-on-rails` is in the Gemfile's `:test` group, so a
production deployment does not install it and the `/__cypress__/command`
endpoint does not exist. **The existing Cypress suite cannot run against a
Dokploy instance**, and should not: it would mean testing a production build
with no fixture control against a shared database. E2E belongs in CI with a
throwaway test database - `.github/workflows/end-to-end.yml` in the ELN already
does that, currently on `workflow_dispatch` only.

What Dokploy logs *are* good for is explaining a failure the browser cannot:
whether the worker started, whether a migration ran, what a 500 actually said.
`./bin/dokploy.sh logs eln`, and the capture workflow pulls them automatically
when a run fails.

### Image pinning

The compose file pins `db:3.1.2` and the base `eln-3.1.2`. A branch that needs
a newer base image, or whose migrations run past that image's schema, can fail
to boot for reasons that look like the branch's fault. Check the pins before
blaming the code.

Dokploy instances are disposable and guarantee nothing about uptime or
persistence. Keep test accounts dummy and real data out.

## Redeploying from a script

`./bin/dokploy.sh --dry-run deploy eln <branch>` prints the API calls without
sending them. The endpoint paths in that script are **unverified** — check them
against your Dokploy's own API docs and override with `DOKPLOY_DEPLOY_PATH` /
`DOKPLOY_STATUS_PATH`. For the first deployment of a service, use the click
path above; the script is for redeploying one that exists.
