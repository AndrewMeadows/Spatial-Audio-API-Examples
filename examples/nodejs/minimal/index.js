// minimal nodejs bot for HiFi Spatial Audio
"use strict";

import { Point3D, HiFiAudioAPIData, HiFiCommunicator } from 'hifi-spatial-audio';

function logHiFiConnectionState(state) {
    console.log(`Communicator.ConnectionState=${state}`);
}

var connection = "pending";

function step() {
    if (connection == "failed") {
        fail;
    }
}

// create communicator
var position = new Point3D({x: 0, y: 0, z: 0});
var data = new HiFiAudioAPIData({position: position});
var communicator = new HiFiCommunicator({
        initialHiFiAudioAPIData: data,
        onConnectionStateChanged: logHiFiConnectionState
    });

// connect to service
var jwt = "get your own Java Web Token (JWT) from https://account.highfidelity.com/dev/account";
communicator.connectToHiFiAudioAPIServer(jwt)
    .then(() => { connection = "connected"; })
    .catch(() => { connection = "failed"; });

// twiddle thumbs
const STEP_PERIOD = 20.0; // msec
var stepId = setInterval(step, STEP_PERIOD);
