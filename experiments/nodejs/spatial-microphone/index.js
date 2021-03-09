const { default: SignJWT } = require('jose/jwt/sign');
const crypto = require('crypto');
const auth = require('./auth.json');
const { Point3D, AudioAPIData, Communicator } = require("hifi-spatial-audio"); // Used to interface with the High Fidelity Spatial Audio API.
const { RTCAudioSink } = require('wrtc').nonstandard;
const Lame = require("node-lame").Lame;
const wav = require('wav');

// This is your "App ID" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_ID = auth.HIFI_APP_ID;
// This is the "App Secret" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_SECRET = auth.HIFI_APP_SECRET;
const SECRET_KEY_FOR_SIGNING = crypto.createSecretKey(Buffer.from(APP_SECRET, "utf8"));

async function generateHiFiJWT(userID, spaceName, isAdmin) {
    let hiFiJWT;
    try {
        let jwtArgs = {
            "user_id": userID,
            "app_id": APP_ID
        };

        if (spaceName) {
            jwtArgs["space_name"] = spaceName;
        }

        if (isAdmin) {
            jwtArgs["admin"] = true;
        }

        hiFiJWT = await new SignJWT(jwtArgs)
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .sign(SECRET_KEY_FOR_SIGNING);

        return hiFiJWT;
    } catch (error) {
        console.error(`Couldn't create JWT! Error:${error}`);
        return;
    }
}

class ServerSpaceInfo {
    constructor({ spaceName, spatialMicrophone } = {}) {
        this.spaceName = spaceName;
        this.spatialMicrophone = spatialMicrophone;
        this.participants = [];
    }
}

class Participant {
    constructor({ visitIDHash } = {}) {
        this.visitIDHash = visitIDHash;
    }
}

class SpatialMicrophone {
    constructor({ spaceName, position } = {}) {
        this.spaceName = spaceName;
        // Define the initial HiFi Audio API Data used when connecting to the Spatial Audio API.
        this.audioAPIData = new AudioAPIData({
            position: new Point3D(position)
        });
        // Set up the HiFiCommunicator used to communicate with the Spatial Audio API.
        this.communicator = new Communicator({ initialHiFiAudioAPIData: this.audioAPIData });
        this.stereoSamples = new Int16Array();
        this.startRecordTime = undefined;
        this.initialized = false;
        this.wantedToImmediatelyStartRecording = false;
        this.isRecording = false;
    }

    async init() {
        // Generate the JWT used to connect to our High Fidelity Space.
        let hiFiJWT = await generateHiFiJWT("spatial-microphone", this.spaceName);
        if (!hiFiJWT) {
            console.error(`Couldn't get HiFi JWT! Spatial microphone will not function.`)
            return;
        }

        // Connect to our High Fidelity Space.
        try {
            let connectResponse = await this.communicator.connectToHiFiAudioAPIServer(hiFiJWT);
            this.visitIDHash = connectResponse.audionetInitResponse.visit_id_hash;
        } catch (e) {
            console.error(`Call to \`connectToHiFiAudioAPIServer()\` failed! Error:\n${JSON.stringify(e)}`);
            return;
        }
        console.log(`Spatial microphone is connected to Space named \`${this.spaceName}\` at ${JSON.stringify(this.audioAPIData.position)}!`);
        this.outputAudioMediaStreamTrack = this.communicator.getOutputAudioMediaStream().getTracks()[0];
        this.initialized = true;
        
        spatialSpeakerSpaceSocket.emit("addParticipant", { visitIDHash: this.visitIDHash, displayName: "🎤 Mic", participantType: "spatialMicrophone", spaceName: this.spaceName, isRecording: this.isRecording });

        if (this.wantedToImmediatelyStartRecording) {
            this.startRecording();
            this.wantedToImmediatelyStartRecording = false;
        }
    }

    deinit() {
        console.log("De-initializing Spatial Microphone...");
        this.finishRecording(this.spaceName);
        spatialSpeakerSpaceSocket.emit("removeParticipant", { visitIDHash: this.visitIDHash, spaceName: this.spaceName });
        this.outputAudioMediaStreamTrack = null;
    }

    disconnect() {
        console.log("Disconnecting Spatial Microphone...");
        this.deinit();
        if (this.communicator) {
            this.communicator.disconnectFromHiFiAudioAPIServer();
        }
        this.communicator = null;
    }

    startRecording() {
        console.log(`Starting to record from spatial microphone in \`${this.spaceName}\`...`);

        this.isRecording = true;
        spatialSpeakerSpaceSocket.emit("editParticipant", { visitIDHash: this.visitIDHash, spaceName: this.spaceName, isRecording: this.isRecording });
        this.startRecordTime = Date.now();

        this.rtcAudioSink = new RTCAudioSink(this.outputAudioMediaStreamTrack);
        this.rtcAudioSink.ondata = (data) => {
            if (this.stereoSamples.length === 0) {
                console.log(`\`rtcAudioSink\` received initial audio data!`);
            }

            let newStereoSamples = data.samples;
            let temp = new Int16Array(this.stereoSamples.length + newStereoSamples.length);
            temp.set(this.stereoSamples, 0);
            temp.set(newStereoSamples, this.stereoSamples.length);
            this.stereoSamples = temp;
        };
    }

    async finishRecording(filetype) {
        if (!this.isRecording) {
            return;
        }
        
        console.log(`Stopping the recording from spatial microphone in \`${this.spaceName}\`...`);
        console.log(`Recording length: ${(Date.now() - this.startRecordTime) / 1000}s`);

        this.isRecording = false;
        spatialSpeakerSpaceSocket.emit("editParticipant", { visitIDHash: this.visitIDHash, spaceName: this.spaceName, isRecording: this.isRecording });

        if (this.rtcAudioSink) {
            this.rtcAudioSink.stop();
            this.rtcAudioSink.ondata = null;
        }
        this.rtcAudioSink = null;

        const finalBuffer = Buffer.from(this.stereoSamples.buffer);

        if (!filetype || filetype === "wav") {
            const filename = `./output/${Date.now()}.wav`;
            const writer = new wav.FileWriter(filename, {
                sampleRate: 48000,
                channels: 2,
                bitDepth: 16,
            });
            writer.write(finalBuffer);
            writer.end();
            console.log(`Successfully wrote recording to \`${filename}\`!`);
            return filename;
        } else if (filetype === "mp3") {
            const filename = `./output/${Date.now()}.mp3`;
            this.encoder = new Lame({
                "output": filename,
                "raw": true,
                "bitwidth": 16,
                "sfreq": 48,
                "mode": "s",
                "signed": true,
                "unsigned": false,
                "little-endian": true,
                "big-endian": false,
                "no-replaygain": true,
                "bitrate": 128, // Output bitrate
            }).setBuffer(finalBuffer);

            this.encoder.encode()
                .then(() => {
                    console.log(`Successfully wrote recording to \`${filename}\`!`);
                    this.stereoSamples = null;
                    return filename;
                })
                .catch((error) => {
                    console.error(`Couldn't encode samples from Spatial Microphone! Error:\n${error}`)
                    this.stereoSamples = null;
                    return null;
                });
        }
    }
}

const httpServer = require("http").createServer();

const io = require("socket.io")(httpServer, {
    path: '/spatial-microphone/socket.io',
    cors: {
        origin: `*`,
        methods: ["GET", "POST"]
    }
});

io.on("error", (e) => {
    console.error(e);
});

let spaceInformation = {};

function startRecording(socket, spaceName) {
    if (!spaceName || !spaceInformation[spaceName] || !spaceInformation[spaceName].spatialMicrophone) {
        return;
    }

    if (spaceInformation[spaceName].spatialMicrophone.initialized) {
        spaceInformation[spaceName].spatialMicrophone.startRecording();
        socket.to(spaceName).emit("recordingStarted");
    } else {
        spaceInformation[spaceName].spatialMicrophone.wantedToImmediatelyStartRecording = true;
    }
}

async function finishRecording(socket, spaceName) {
    if (!spaceName || !spaceInformation[spaceName] || !spaceInformation[spaceName].spatialMicrophone) {
        return;
    }
    
    const recordingFilename = await spaceInformation[spaceName].spatialMicrophone.finishRecording("wav");
    socket.to(spaceName).emit("recordingFinished", { recordingFilename });
}

async function toggleRecording(socket, spaceName) {
    if (!spaceName || !spaceInformation[spaceName] || !spaceInformation[spaceName].spatialMicrophone) {
        return;
    }

    if (spaceInformation[spaceName].spatialMicrophone.isRecording) {
        await finishRecording(socket, spaceName);
    } else {
        startRecording(socket, spaceName);
    }
}
io.on("connection", (socket) => {
    socket.on("userConnected", async ({ spaceName, visitIDHash, position } = {}) => {
        console.log(`In ${spaceName}, user connected:\nHashed Visit ID: \`${visitIDHash}\``);

        if (!spaceInformation[spaceName]) {
            console.log(`In \`${spaceName}\`, creating a new Spatial Microphone...`);
            let spatialMicrophone = new SpatialMicrophone({ spaceName, position: position || new Point3D({ x: 0, y: 0, z: 0 }) });
            spaceInformation[spaceName] = new ServerSpaceInfo({ spaceName, spatialMicrophone });
            await spatialMicrophone.init();
        }

        let me = new Participant({ visitIDHash });

        spaceInformation[spaceName].participants.push(me);

        socket.join(spaceName);

        socket.to(spaceName).emit("onParticipantAdded", [me]);
        socket.emit("onParticipantAdded", spaceInformation[spaceName].participants.filter((participant) => { return participant.visitIDHash !== visitIDHash; }));
    });

    socket.on("userDisconnected", async ({ spaceName, visitIDHash } = {}) => {
        if (!spaceInformation[spaceName]) {
            return;
        }

        spaceInformation[spaceName].participants = spaceInformation[spaceName].participants.filter((participant) => { return participant.visitIDHash !== visitIDHash; });

        if (spaceInformation[spaceName].participants.length === 0) {
            console.log(`In \`${spaceName}\`, all users disconnected. Stopping the Spatial Microphone...`);
            spaceInformation[spaceName].spatialMicrophone.disconnect();
            delete spaceInformation[spaceName];
        }
    });

    socket.on("startRecording", ({ spaceName } = {}) => {
        startRecording(socket, spaceName);
    });

    socket.on("finishRecording", async ({ spaceName } = {}) => {
        await finishRecording(socket, spaceName);
    });

    socket.on("toggleRecording", async ({ spaceName } = {}) => {
        await toggleRecording(socket, spaceName);
    });
});

const PORT = 8125;
httpServer.listen(PORT, async () => {
    console.log(`Spatial Microphone is ready and listening at http://localhost:${PORT}`)
});

const spatialSpeakerSpaceSocket = require("socket.io-client").connect('http://localhost:8123', { path: '/spatial-speaker-space/socket.io' });
spatialSpeakerSpaceSocket.on('connect', (socket) => {
    console.log('Connected to Spatial Speaker Space!');
});

process.on('SIGINT', () => {    
    let keys = Object.keys(spaceInformation);
    for (let i = 0; i < keys.length; i++) {
        let mic = spaceInformation[keys[i]].spatialMicrophone;
        if (mic) {
            mic.disconnect();
        }
    }

    process.exit();
});