# Fault dashboard design preview

The dashboard can render its existing layout with no connected data. This preview deliberately does not call the backend, verify a login token, open the risk event stream, or request a Google map. Empty areas say **N/A** or **No data connected**; it does not show fake site or ticket data.

## Run in the Replit Shell

From the repository root:

```bash
pnpm install --frozen-lockfile
PORT=3000 BASE_PATH=/ VITE_DESIGN_PREVIEW=true pnpm --filter @workspace/cow-dashboard dev
```

Open the Replit web preview for port 3000. Stop the process with Ctrl+C when done.

## Verify the build

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/cow-dashboard run typecheck
PORT=3000 BASE_PATH=/fault-managment/ VITE_DESIGN_PREVIEW=true pnpm --filter @workspace/cow-dashboard run build
```

The normal application build remains authenticated and connected to its existing API when `VITE_DESIGN_PREVIEW` is not set. The preview is a separate build setting; it does not grant access to live data. The GitHub Actions workflow checks this preview build, but does not publish a public website.
