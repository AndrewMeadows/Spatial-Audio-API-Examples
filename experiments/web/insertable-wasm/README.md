## WebAssembly with insertable-streams
This is an experiment using **WASM** to modify outgoing **WebRTC** audio via **insertable-streams**

## How to run:
1) Install **emsdk** and make it available to your environment
1) Run the `build.sh` script to compile the processor.cpp file
1) Get a valid JWT and edit it into `js/main.js`
1) Run local server: `python -m http.server`
1) Connect to test space as **UserA** from other computer (e.g. use space-inspector)
1) On this computer: using Chrome94+ visit: localhost:8000
1) Connect as **UserB** --> **UserA** should see **UserB** but hear a pulsing 120Hz tone on top of **UserB**'s audio.
