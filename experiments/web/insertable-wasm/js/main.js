'use strict';

console.log("examples/web/insertable-wasm/");

var wasm_addTonePulse = Module.cwrap( "addTonePulse", null, ["number", "number", "number"]);

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
let transformFactory;
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

    Module.onRuntimeInitialized = () => {
        console.log("WASM Module initialized");
    };
}

const BYTES_PER_FLOAT = 4;

class Oscillator {
    // Oscillator is a struct for storing two floats in WASM memory
    // [ omega, phase ]
    constructor(frequency) {
        let num_bytes = 2 * BYTES_PER_FLOAT;
        let ptr = Module._malloc(num_bytes);
        this.memory = ptr;

        const TWO_PI = 2.0 * Math.PI;
        let omega = frequency * TWO_PI;
        let phase = 0.0;
        Module.setValue(ptr, omega, "float");
        Module.setValue(ptr + BYTES_PER_FLOAT, phase, "float");
    }

    destroy() {
        Module._free(this.memory);
        this.memory = -1;
    }
}

class AudioBlock {
    // AudioBlock is a struct for storing related floats in WASM memory
    // with some intelligence for moving audio data to/from WASM memory
    // [ num_channels, num_frames, sample_rate, data... ]
    constructor() {
        // Note: we expect stereo frames of 1024 samples
        // but we allocate twice that memory for safety
        const BLOCK_SIZE = 2 * 2048;

        let num_block_bytes = BLOCK_SIZE * BYTES_PER_FLOAT;
        let num_bytes = 3 * BYTES_PER_FLOAT + num_block_bytes;
        let ptr = Module._malloc(num_bytes);
        this.memory = ptr;

        let byte_offset = ptr + 3 * BYTES_PER_FLOAT;
        this.dataF32 = new Float32Array(Module.HEAP32.buffer, byte_offset, BLOCK_SIZE);
    }

    copyFrom(data) {
        // [ num_channels, num_frames, sample_rate, data... ]
        Module.setValue(this.memory, data.numberOfChannels, "float");
        Module.setValue(this.memory + BYTES_PER_FLOAT, data.numberOfFrames, "float");
        Module.setValue(this.memory + 2 * BYTES_PER_FLOAT, data.sampleRate, "float");

        const format = 'f32-planar';
        for (let i = 0; i < data.numberOfChannels; i++) {
            const offset = data.numberOfFrames * i;
            const samples = this.dataF32.subarray(offset, offset + data.numberOfFrames);
            data.copyTo(samples, {planeIndex: i, format});
        }
    }

    getData() {
        let num_channels = Module.getValue(this.memory, "float");
        let num_samples = Module.getValue(this.memory + BYTES_PER_FLOAT, "float");
        return this.dataF32.subarray(0, num_channels * num_samples);
    }

    destroy() {
        Module._free(this.memory);
        this.memory = -1;
    }
}

class WasmTonePulseAdderFactory {
    // WasmTonePulseAdderFactory is a class that tracks its own WASM memory
    // and supplies a "transform function" for insertable-streams
    constructor() {
        this.tone = new Oscillator(120.0); // 120Hz tone
        this.pulse = new Oscillator(0.75); // three pulses every four seconds
        this.block = new AudioBlock();
    }

    destroy() {
        this.tone.destroy();
        this.pulse.destroy();
        this.block.destroy();
    }
    
    // returns a transform function for use with TransformStream.
    getTransform() {
        let tone = this.tone;
        let pulse = this.pulse;
        let block = this.block;
        const format = 'f32-planar';
        return (data, controller) => {
            // copy data into WASM memory
            block.copyFrom(data);

            // this is where all the compute happens... in embedded WASM code
            wasm_addTonePulse(tone.memory, pulse.memory, block.memory);

            // pass the processed data to the controller
            controller.enqueue(new AudioData({
                format,
                sampleRate: data.sampleRate,
                numberOfFrames: data.numberOfFrames,
                numberOfChannels: data.numberOfChannels,
                timestamp: data.timestamp,
                data: block.getData()
            }));
        };
    }
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
    transformFactory = new WasmTonePulseAdderFactory();
    transformer = new TransformStream({transform: transformFactory.getTransform()});

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
        if (transformFactory != null) {
            // don't forget to release WASM memory
            transformFactory.destroy();
            transformFactory = null;
        }
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
        hifiCommunicator.onConnectionStateChanged = (state, message) => {
            console.log(`ConnectionStateChange state=${state} message=${message}`);
        };
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
    if (abortController != null) {
        abortController.abort();
    }
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
    if (transformFactory != null) {
        // don't forget to release WASM memory
        transformFactory.destroy();
        transformFactory = null;
    }
}

init();
