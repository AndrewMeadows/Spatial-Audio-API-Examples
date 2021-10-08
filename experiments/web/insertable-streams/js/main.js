'use strict';

// check for support of insertable streams
if (typeof MediaStreamTrackProcessor === 'undefined' ||
    typeof MediaStreamTrackGenerator === 'undefined') {
    alert("insertable streams non supported");
}

try {
    new MediaStreamTrackGenerator('audio');
    console.log("Audio insertable streams supported");
} catch (e) {
    alert("Your browser does not support insertable audio streams");
}

if (typeof AudioData === 'undefined') {
    alert("Your browser does not support WebCodecs.");
}

// elements
let audioElement;
let connectButton;
let disconnectButton;

// insertable-stream cogs
let stream;
let processor;
let generator;
let transformer;
let abortController;
let processedStream;

// hifi stuff
let hifiCommunicator;

// initialize on page load
async function init() {
    audioElement = document.querySelector('.audioOutput');
    connectButton = document.querySelector('.connectButton');
    connectButton.onclick = connect;
    connectButton.disabled = false;
    connectButton.innterHTML = "Connect";

    disconnectButton = document.querySelector('.disconnectButton');
    disconnectButton.onclick = disconnect;
    disconnectButton.disabled = true;
    disconnectButton.innterHTML = "Disconnected";
}

// Returns a tonePulseAdd transform function for use with TransformStream.
function tonePulseAdderFactory() {
    const format = 'f32-planar';
    const frequencyA = 120.0;
    const frequencyB = 0.75;
    const omegaA = 2.0 * Math.PI * frequencyA;
    const omegaB = 2.0 * Math.PI * frequencyB;
    let phaseA = 0.0;
    let phaseB = 0.0;
    let two_pi = 2.0 * Math.PI;
    let buffer_size = 2 * 2048; // twice the expected necessary size
    const buffer = new Float32Array(buffer_size);

    return (data, controller) => {
        const dt = 1.0 / data.sampleRate;
        const nChannels = data.numberOfChannels;

        for (let c = 0; c < nChannels; c++) {
            const offset = data.numberOfFrames * c;
            // 'samples' is floating point PCM data in range [-1, 1]
            const samples = buffer.subarray(offset, offset + data.numberOfFrames);
            data.copyTo(samples, {planeIndex: c, format});

            // Add warbled tone
            for (let i = 0; i < samples.length; ++i) {
                let t = i * dt;
                let b = Math.sin(phaseB + omegaB * t);
                samples[i] = Math.min(Math.max(-1.0, samples[i] + 0.5 * Math.sin(phaseA + omegaA * t) * b*b), 1.0);
            }
        }
        phaseA += omegaA * data.numberOfFrames * dt;
        if (phaseA > two_pi) {
            phaseA -= two_pi;
        }
        phaseB += omegaB * data.numberOfFrames * dt;
        if (phaseB > two_pi) {
            phaseB -= two_pi;
        }
        controller.enqueue(new AudioData({
            format,
            sampleRate: data.sampleRate,
            numberOfFrames: data.numberOfFrames,
            numberOfChannels: nChannels,
            timestamp: data.timestamp,
            data: buffer
        }));
    };
}

async function start() {
    let constraints = { audio: HighFidelityAudio.getBestAudioConstraints(), video: false };
    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        const errorMessage =
            'navigator.MediaDevices.getUserMedia error: ' + error.message + ' ' +
            error.name;
        document.getElementById('errorMsg').innerText = errorMessage;
        console.log(errorMessage);
    }
    const audioTracks = stream.getAudioTracks();
    console.log('Using audio device: ' + audioTracks[0].label);
    stream.oninactive = () => {   
        console.log('Stream ended');
    };

    // this is where the instertable-streams magic happens
    // we create the processor, generator, and transformer
    processor = new MediaStreamTrackProcessor(audioTracks[0]);
    generator = new MediaStreamTrackGenerator('audio');
    transformer = new TransformStream({transform: tonePulseAdderFactory()});

    // also create an abortController for cleanup
    abortController = new AbortController();
    const signal = abortController.signal;

    // this is where we connect the insertable-stream pipes
    const source = processor.readable;
    const sink = generator.writable;
    const promise = source.pipeThrough(transformer, {signal}).pipeTo(sink);

    // Note: a MediaStreamTrackGenerator consumes a stream of media frames
    // and exposes a MediaStreamTrack interface.  In other words: it is a
    // MediaStreamTrack for things that expect one.
    //
    // The 'generator' will be used later when we feed a 'track' to the WebRTC stuff

    // use the abortController in the promise catch
    promise.catch((e) => { 
        if (signal.aborted) {
            console.log('Shutting down streams after abort.');
        } else {
            console.error('Error from stream transform:', e);
        }
        source.cancel(e);
        sink.abort(e);
    });
}


async function connect() {
    // Disable the Connect button after the user clicks it so we don't double-connect.
    connectButton.innerHTML = "Connecting...";
    connectButton.disabled = true;

    if (hifiCommunicator == null) {
        await start();
        // create the communicator to HiFi service
        let userData = new HighFidelityAudio.HiFiAudioAPIData({
            position: new HighFidelityAudio.Point3D({x: 0, y: 0, z: 0}),
            orientation: new HighFidelityAudio.Quaternion()
        });
        let config = {
            autoRetryInitialConnection: false,
            autoRetryOnDisconnect: false
        };
        hifiCommunicator = new HighFidelityAudio.HiFiCommunicator({
            initialHiFiAudioAPIData: userData,
            connectionRetryAndTimeoutConfig: config
        });
    }

    // here is where we use the insertable-streams 'generator'
    // we feed it to a MediaStream which is then fed to HiFiCommunicator
    processedStream = new MediaStream();
    processedStream.addTrack(generator);
    await hifiCommunicator.setInputAudioMediaStream(processedStream);

    // Connect to the High Fidelity Audio Spatial API Server by supplying your
    // own JWT here. Follow this guide to get a JWT:
    //     https://www.highfidelity.com/api/guides/misc/getAJWT
    // If you don't need a guide, obtain JWT credentials after signing up for a
    // developer account at:
    //     https://account.highfidelity.com/dev/account
    let HiFiAudioJWT = "get a Java Web Token (JWT) from https://account.highfidelity.com/dev/account";
    try {
        let searchParams = new URLSearchParams(location.search);
        if (!HiFiAudioJWT && searchParams.get('jwt')) {
            HiFiAudioJWT = searchParams.get('jwt');
        }
        let stackURLOverride = searchParams.get('stack');
        await hifiCommunicator.connectToHiFiAudioAPIServer(HiFiAudioJWT, stackURLOverride);
    } catch (e) {
        console.error(`Error connecting to High Fidelity:\n${e}`);
        connectButton.disabled = false;
        connectButton.innerHTML = "Connection error. Retry?";
        disconnectButton.disabled = true;
        disconnectButton.innerHTML = "Disconnected";
        return;
    }

    // update button states for connected
    disconnectButton.disabled = false;
    disconnectButton.innerHTML = "Disconnect";
    connectButton.innerHTML = "Connected!";

    // connect communicator output to audio element
    audioElement.srcObject = hifiCommunicator.getOutputAudioMediaStream();
    // We explicitly call `play()` here because certain browsers won't play the newly-set stream automatically.
    audioElement.play();
}

function disconnect() {
    connectButton.innerHTML = "Disconnecting...";
    disconnectButton.disabled = true;
    hifiCommunicator.disconnectFromHiFiAudioAPIServer()
        .then(() => {
            connectButton.disabled = false;
            connectButton.innerHTML = "Connect";
            disconnectButton.innerHTML = "Disconnected";
        })
        .finally(() => {
            connectButton.disabled = false;
            connectButton.innerHTML = "Connect";
            disconnectButton.innerHTML = "Disconnected";
        });
}

init();
