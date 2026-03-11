# Deployment on Render

This repository contains two separate Node projects:

* `server` – Express backend, compiled to `server/dist`
* `client` – Vue/Vite frontend, compiled to `client/dist`

Render can host them either as two independent services or as a
single Docker service.  The two-service setup is simpler and is the
default configuration outlined below.

---

## Option A – two services (recommended)

1. **Backend service**
   * Type: **Web Service** (Node)
   * Root directory: `server` (or `<none>` if you prefer using `cd` in
     commands)
   * Build command:
     ```sh
     npm install
     npm run build      # runs server/tsc
     ```
   * Start command:
     ```sh
     npm start          # starts compiled server/dist/index.js
     ```
   * Environment variables:
     * `PORT` (Render provides automatically)
     * Any other secret keys or flags your API needs
   * **Code note:** `server/src/index.ts` already guards static
     serving – if `client/dist` does not exist, the warning is logged
     but no error is thrown.

2. **Frontend service**
   * Type: **Static Site** (ideal) or **Web Service** if you need server
     logic.
   * Root directory: `client`
   * Build command:
     ```sh
     npm install
     npm run build      # Vite generates `client/dist`
     ```
   * Publish directory (Static Site): `client/dist` (or `dist`)
   * Environment variables:
     * `VITE_API_BASE_URL` – full URL of the backend service (e.g.
       `https://element-list-server.onrender.com`).  The compiled
       frontend uses this value for API calls; when empty the app falls
       back to `/api` which only works in dev or when both services are
       collocated.
   * If using a Web Service instead of Static Site, set Start command
     to something like `npm run preview` or `serve -s dist` and still
     supply `VITE_API_BASE_URL`.

3. Deploy!  Pushing to the monitored branch triggers rebuilds for both
   services.  Verify that client requests are sent to the proper host
   and that the backend is reachable.

---

## Option B – single Docker service

1. Create a `Dockerfile` in the repository root that builds both
   projects and starts the server.

   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package.json package-lock.json ./
   RUN npm install
   COPY . .
   RUN cd client && npm install && npm run build
   RUN cd server && npm install && npm run build
   EXPOSE 3000
   CMD ["node","server/dist/index.js"]
   ```

2. On Render, choose **Web Service** → **Docker** and point to this
   `Dockerfile`.
3. Set environment variables as in the two-service setup.  The client
   build will be included in the image, so `server`’s conditional
   static‑serving code will pick it up.

---

## Common pitfalls

* **`ENOENT` errors** – occur when `server` tries to serve
  `client/dist` but the frontend has not been built.  Either build the
  client in the same service or remove the static‑serving code.
* **CORS / missing API base URL** – the frontend will default to the
  same host as itself; if the backend lives elsewhere you **must set
  `VITE_API_BASE_URL`**.  Without it you’ll see network errors or
  404s in the browser.
* **Port binding** – always use `process.env.PORT` in `server`; Render
  supplies this automatically (see
  https://render.com/docs/web-services#port-binding).

---

With either option in place you'll end up with two URLs:

* `https://<your-backend>.onrender.com` – API
* `https://<your-frontend>.onrender.com` – SPA talking to API

Enjoy your deployed application!