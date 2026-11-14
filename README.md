# Room-code server for Ragdoll Playground

A tiny Node server (about 100 lines, one dependency) that lets players meet by **room code**. It only passes each
player's connection details to the other once, a few KB. The game itself then runs directly between the browsers
(WebRTC), so this server uses almost no bandwidth and the static game can live anywhere.

## Deploy on Render (free)

1. Put this `server/` folder in a GitHub repo (it can be its own repo, or a folder in a bigger one).
2. On render.com: **New > Web Service**, connect the repo. If `server/` is a folder inside a bigger repo, set **Root Directory** to `server`.
3. Runtime **Node**, Build Command `npm install`, Start Command `npm start`, instance type **Free**.
4. When it is live you get an address like `https://ragdoll-signal.onrender.com`. Opening it in a browser should say "ragdoll signalling server ok".
5. In your game's `web/config.js` set `window.RD_SIGNAL = 'wss://ragdoll-signal.onrender.com';` (same name, `wss://` instead of `https://`), rebuild with `./web/build.sh`, and upload `dist-web/` to your static host.

Free Render services go to sleep after ~15 minutes without traffic and need up to a minute to wake. The game pokes the
server when the page loads and keeps retrying with a "waking up the server" message, so the first player just waits a bit.
Rooms live in memory: if the server restarts, hosts reconnect and re-register their room automatically.

## Settings (environment variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `MAX_GUESTS` | 3 | guests per room (4 players total) |
| `MAX_ROOMS` | 2000 | open rooms at once |
| `ALLOWED_ORIGINS` | any | comma list of page addresses allowed to connect, e.g. `https://you.github.io,https://yourgame.example.com` (recommended once it works) |

## Try it locally

```
cd server && npm install && npm test   # plays a host and guests against it
npm start                              # then use ?server=ws://localhost:8080 on the game page
```
