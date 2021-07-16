# Spatial-Standup
A very complex demo application for High Fidelity's Spatial Audio API written in modular TypeScript which integrates many of the Spatial Audio API's features. Other features include:
- Twilio video conferencing with in-avatar video.
- The ability to configure the application and its virtual rooms with a `.json` configuration file.
- Users can join a "Watch Party" inside a "Watch Party Room" and watch synced YouTube videos together.
- Rooms contain "landmarks", which can have associated sounds. Users who click on these landmarks will hear the sounds spatialized locally on their client using [Howler.JS](https://howlerjs.com/).
- Code for a Discord bot and Slack integration which can be used to add a `/hifi` command to Discord/Slack (try `npm run discord`).
- The repository includes code for generating a native Electron app from the Spatial Standup code (try `npm run electron`).
- Code for injecting Audio Bots (with tree sounds!) into a Spatial Standup Room (try `npm run audiobots`).
- A particle system, currently used for "Signals" (click the star and minus icon in the top right, then click on the canvas).
- A bare-bones "map editor" mode (press CTRL+E on your keyboard).

For help with Spatial Standup, or for general help with the Spatial Audio API, [click here to join our Discord server](https://discord.gg/WwjNQx9K).

!["Spatial-Standup" Example Screenshot](./screenshot.png)

## Author
Zach Fox

## Setup
1. Install [NodeJS v14.15.x](https://nodejs.org/en/)
2. Run `npm install`
3. Copy `auth.example.json` to `auth.json`.
4. Populate your credentials inside `./auth.json`.
    - Obtain `HIFI_*` credentials from the [High Fidelity Spatial Audio API Developer Console](https://account.highfidelity.com/dev/account)
    - _Optionally,_ obtain `TWILIO_*` credentials from the [Twilio Console](https://www.twilio.com/console)
        - If you don't supply Twilio credentials in `./auth.json`, video conferencing inside Spatial Standup will not work. Users will see a disabled "video" button in the SS UI, and users who hover over that button will see a "🚫" cursor.
    - _Optionally,_ obtain `SLACK_*` credentials from the [Slack Apps Console](https://api.slack.com/apps)
        - This is only necessary if you want to develop a Slack app which links users to Spatial Standup. Detailed instructions for doing this are not included in this README.
5. Open `./node_modules/webpack-hot-middleware/process-update.js` in a text editor. Change `ignoreUnaccepted: true,` to `ignoreUnaccepted: false,`.
    - This is a bug that occurs between webpack-hot-middleware and webpack 5.
6. Open `./node_modules/util/util.js` in a text editor. Change `if (process.env.NODE_DEBUG) {` to `if (typeof (process) !== "undefined" && process.env.NODE_DEBUG) {`.
    - This is a bug with Twilio's client library.

## Running Spatial Standup in a Browser - Development Environment
This is the most basic way to run Spatial Standup.

After performing the above Setup instructions:
1. Run `npm run server:dev` (or `npm run server`; they do the same thing)
2. If your Web browser doesn't automatically open, use a Web browser to navigate to [http://localhost:8180/](http://localhost:8180/).

Running `npm run server:dev` will:
1. Build the Spatial Standup client code in Development mode (i.e. with source maps enabled and no minification).
2. Run the Spatial Standup server serving content on port 8180 in Development mode (with hot swapping enabled, etc).

## Running Spatial Standup in a Browser - Production Environment
Do this if you are ready to deploy Spatial Standup to a production environment.

After performing the above Setup instructions:
1. Run `npm run server:prod`
2. If your Web browser doesn't automatically open, use a Web browser to navigate to [http://localhost:8180/](http://localhost:8180/).

Running `npm run server:prod` will:
1. Build the Spatial Standup client code in Production mode (i.e. with source maps disabled, minification, and separate CSS files).
2. Run the Spatial Standup server in Production mode serving content on port 8180.

## Building the Spatial Standup Web Client
You should almost never need to do this manually; running one of several other commands will build the Web client automatically. If you'd like to build the Web client anyway, after performing the above Setup instructions:
1. Run `npm run client:dev` (for development mode) or `npm run client:prod` (for production mode).
2. View the output HTML/CSS/JS in the `./dist` folder.

## Running the Audiobots
This repository contains "audio bots" which will connect to the default HiFi Space configured in `auth.json`. The audio bots, by default, play calming tree sounds.

To start the audio bots, after following the above Setup instructions:
1. Run `npm run audiobots`.

## Running the Discord Bot
The Spatial Standup Discord Bot allows users in a Discord server to join a Spatial Standup Room by typing `/hifi` in a channel where the Bot is present. Setting up and deploying the Discord bot is left as an exercise to the reader (I'll write documentation for this if folks find that they'd like it).

## Building Spatial Standup as a Native App with Electron
If you'd like to run the Spatial Standup client as a native app, try one of these commands:
- `npm run electron`
    - This will build the necessary client files, invoke Electron to transform those files into a native app, then launch the native app.
- `npm run make`
    - This will build the necessary client files, invoke Electron to transform those files into a native app, then place the native app files in the `./out` directory.
- `npm run start`
    - If you've already built the Electron app via `npm run make`, this command will start up the Electron app.
- `npm run package`
    - This command will build the necessary client files, invoke Electron to transform those files into a native app, then package the native app into an installer for your current platform.

## Getting Analytics about Spatial Standup Usage - PostgreSQL Database
1. Install `postgresql` on your local machine.
2. Configure `postgresql` locally, then create a new database (called `sar`, for example).
3. Create a new schema inside that new database called `analytics`.
4. Configure `auth.json` to connect to your PostgreSQL database.

Certain analytics, such as "Server Started", "User Connected", and "User Disconnected" will both be printed to the server's logs and be added to the Postgres database.

You can use commands like the below to access the analytics from the database:
```
SELECT * FROM analytics.events
ORDER BY id ASC;
```

## Getting Analytics about Spatial Standup Usage - Google Sheets
1. Inside `auth.json`, fill in `ANALYTICS_GOOGLE_SHEET_ID` with the Google Sheet ID of the sheet to which you want analytics to be saved.
2. Copy `google-service-account.example.json` to `google-service-account.json` and fill in the values for each key.
    - For more information about Google Service Accounts, [see Google's documentation here](https://cloud.google.com/iam/docs/service-accounts).
    - Make sure the project associated with your Service Account has access to the Google Sheets API.

Certain analytics, such as "Server Started", "User Connected", and "User Disconnected" will both be printed to the server's logs and be added to the specified Google Sheet.
