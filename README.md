# Core-Breach-Zero

Run `npm install` and `npm start`, then open `http://localhost:3000`. Register
or log in with a commander account to enter one of four rooms. Each room supports
up to four commanders; the room lead selects a map, waits for another commander,
then starts the recon session. The loading screen appears before the selected
map opens. Solo map recon is also available from the Play Menu.

Accounts and hashed seven-day sessions are stored in `accounts.json` beside the
server. Gameplay beyond map recon is not implemented yet. Set `PORT` to choose a
different listening port.