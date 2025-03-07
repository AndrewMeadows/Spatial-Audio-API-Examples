const { default: SignJWT } = require('jose/jwt/sign');
const express = require('express');
const crypto = require('crypto');
const auth = require('./auth.json');
const fetch = require('node-fetch');
const { RtcTokenBuilder, RtmTokenBuilder, RtcRole, RtmRole } = require('agora-access-token');
const { ADJECTIVES, NOUNS } = require('./words');

// This is your "App ID" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_ID = auth.HIFI_APP_ID;
// This is the "App Secret" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_SECRET = auth.HIFI_APP_SECRET;
const SECRET_KEY_FOR_SIGNING = crypto.createSecretKey(Buffer.from(APP_SECRET, "utf8"));

const app = express();
const PORT = 8081;

app.set('view engine', 'ejs');

async function generateHiFiJWT(userID, spaceID, isAdmin) {
    let hiFiJWT;
    try {
        let jwtArgs = {
            "user_id": userID,
            "app_id": APP_ID
        };

        if (spaceID) {
            jwtArgs["space_id"] = spaceID;
        }

        if (isAdmin) {
            jwtArgs["admin"] = true;
        }

        hiFiJWT = await new SignJWT(jwtArgs)
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .sign(SECRET_KEY_FOR_SIGNING);

        return hiFiJWT;
    } catch (error) {
        console.error(`Couldn't create JWT! Error:\n${error}`);
        return;
    }
}

function generateAgoraAccessToken(providedUserID, spaceName) {
    // Rtc Examples
    const appID = auth.AGORA_APP_ID;
    const appCertificate = auth.AGORA_APP_CERTIFICATE;
    const channelName = spaceName;
    const account = providedUserID;
    const role = RtcRole.PUBLISHER;

    const expirationTimeInSeconds = 3600;

    const currentTimestamp = Math.floor(Date.now() / 1000);

    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Build token with uid
    return RtcTokenBuilder.buildTokenWithAccount(appID, appCertificate, channelName, account, role, privilegeExpiredTs);
}

app.use(express.static('static'));

let spaceNameToIDMap = new Map();
app.get('/videochat-agora', async (req, res) => {
    let spaceName = req.query.superSecretRoomNameParam || auth.AGORA_DEFAULT_CHANNEL_NAME;

    let spaceID;
    if (spaceNameToIDMap.has(spaceName)) {
        spaceID = spaceNameToIDMap.get(spaceName);
    } else {
        let createSpaceResponse;
        try {
            createSpaceResponse = await fetch(`https://api.highfidelity.com/api/v1/spaces/create?token=${adminJWT}&name=${spaceName}`);
        } catch (e) {
            return res.status(500).send();
        }

        let spaceJSON;
        try {
            spaceJSON = await createSpaceResponse.json();
        } catch (e) {
            return res.status(500).send();
        }

        spaceID = spaceJSON["space-id"];
        spaceNameToIDMap.set(spaceName, spaceID);
    }

    console.log(`The HiFi Space ID associated with Space Name \`${spaceName}\` is \`${spaceID}\``);

    let providedUserID = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}-${NOUNS[Math.floor(Math.random() * NOUNS.length)]}${Math.floor(Math.random() * Math.floor(1000))}`;
    let hiFiJWT = await generateHiFiJWT(providedUserID, spaceID, false);
    let agoraToken = generateAgoraAccessToken(providedUserID, spaceName);

    res.render('index', { providedUserID, hiFiJWT, agoraAppID: auth.AGORA_APP_ID, agoraToken, spaceName });
});

let adminJWT;
app.listen(PORT, async () => {
    adminJWT = await generateHiFiJWT("example-admin", undefined, true);
    console.log(`The High Fidelity Sample App is ready and listening at http://localhost:${PORT}\nVisit http://localhost:${PORT}/videochat-agora in your browser.`)
});