const crypto = require('crypto');
const { default: SignJWT } = require('jose/dist/node/cjs/jwt/sign');
const auth = require('../../auth.json');
const twilio = require('twilio');

export function uppercaseFirstLetter(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// This is your "App ID" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_ID = auth.HIFI_APP_ID;
// This is the "App Secret" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_SECRET = auth.HIFI_APP_SECRET;
const SECRET_KEY_FOR_SIGNING = crypto.createSecretKey(Buffer.from(APP_SECRET, "utf8"));
const JWT_EXPIRATION_MS = 15 * 60 * 1000;
export async function generateHiFiJWT(userID: string, spaceName: string, isAdmin: boolean = false) {
    let hiFiJWT;
    try {
        let jwtArgs = {
            "user_id": userID,
            "app_id": APP_ID,
            "space_name": spaceName,
            "admin": isAdmin,
            "exp": Math.round((Date.now() + JWT_EXPIRATION_MS) / 1000)
        };

        hiFiJWT = await new SignJWT(jwtArgs)
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .sign(SECRET_KEY_FOR_SIGNING);

        return hiFiJWT;
    } catch (error) {
        console.error(`Couldn't create JWT! Error:${error}`);
        return;
    }
}

export function generateTwilioAccessToken(providedUserID: string, spaceName: string) {
    if (!auth.TWILIO_ACCOUNT_SID || auth.TWILIO_ACCOUNT_SID.length === 0 || !auth.TWILIO_API_KEY_SID || auth.TWILIO_API_KEY_SID.length === 0 || !auth.TWILIO_API_KEY_SECRET || auth.TWILIO_API_KEY_SECRET.length === 0) {
        return "";
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    // Create an Access Token
    let accessToken = new AccessToken(
        auth.TWILIO_ACCOUNT_SID,
        auth.TWILIO_API_KEY_SID,
        auth.TWILIO_API_KEY_SECRET
    );

    // Set the Identity of this token
    accessToken.identity = providedUserID;

    // Grant access to Video
    let grant = new VideoGrant();
    grant.room = spaceName;
    accessToken.addGrant(grant);

    // Serialize the token as a JWT
    return accessToken.toJwt();
}
