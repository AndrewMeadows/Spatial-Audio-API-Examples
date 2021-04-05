import { Point3D } from "hifi-spatial-audio";
import { uiController, userDataController, userInputController } from "..";
import { AVATAR_RADIUS_M, MAX_PX_PER_M, MIN_PX_PER_M, PHYSICS_TICKRATE_MS, SMOOTH_ZOOM_DURATION_NORMAL_MS, SMOOTH_ZOOM_DURATION_SWITCH_ROOMS_MS } from "../constants/constants";
import { SpatialAudioRoom } from "../ui/RoomController";
import { Utilities } from "../utilities/Utilities";

export class PhysicsController {
    mainCanvas: HTMLCanvasElement;
    lastNow: number = 0;
    pxPerMStart: number;
    pxPerMCurrent: number;
    pxPerMTarget: number;
    smoothZoomDurationOverrideMS: number;
    smoothZoomStartTimestamp: number;

    constructor() {
        setInterval(this.physicsLoop.bind(this), PHYSICS_TICKRATE_MS);
        this.mainCanvas = document.querySelector('.mainCanvas');
    }

    physicsLoop() {
        let now = performance.now();
        let dt = now - this.lastNow;
        this.lastNow = now;

        this.computePXPerM(now);
    }

    autoComputePXPerMFromRoom(room: SpatialAudioRoom) {
        if (!room) {
            return;
        }

        this.pxPerMTarget = Math.min(this.mainCanvas.width, this.mainCanvas.height) / (2 * room.seatingRadiusM + 3 * AVATAR_RADIUS_M);
        this.smoothZoomDurationOverrideMS = SMOOTH_ZOOM_DURATION_SWITCH_ROOMS_MS;
    }

    computePXPerM(timestamp: number) {
        if (!this.pxPerMTarget) {
            return;
        }

        this.pxPerMTarget = Utilities.clamp(this.pxPerMTarget, MIN_PX_PER_M, MAX_PX_PER_M);

        if (!this.smoothZoomStartTimestamp) {
            this.smoothZoomStartTimestamp = timestamp;
            this.pxPerMStart = this.pxPerMCurrent;
        }
    
        const smoothZoomDuration = this.smoothZoomDurationOverrideMS || SMOOTH_ZOOM_DURATION_NORMAL_MS;
    
        if ((!userInputController.onWheelTimestampDeltaMS || userInputController.onWheelTimestampDeltaMS >= SMOOTH_ZOOM_DURATION_NORMAL_MS) &&
            this.pxPerMTarget && this.pxPerMStart && (this.pxPerMTarget !== this.pxPerMStart)) {
            let smoothingFunction = Utilities.easeOutExponential;
            this.pxPerMCurrent = Utilities.linearScale(smoothingFunction((timestamp - this.smoothZoomStartTimestamp) / smoothZoomDuration), 0, 1, this.pxPerMStart, this.pxPerMTarget);
        } else {
            this.pxPerMCurrent = this.pxPerMTarget;
            this.pxPerMTarget = undefined;
            this.pxPerMStart = undefined;
            this.smoothZoomStartTimestamp = undefined;
            this.smoothZoomDurationOverrideMS = undefined;
        }
    
        if (timestamp > (this.smoothZoomStartTimestamp + smoothZoomDuration)) {
            this.pxPerMCurrent = this.pxPerMTarget;
            this.pxPerMTarget = undefined;
            this.pxPerMStart = undefined;
            this.smoothZoomStartTimestamp = undefined;
            this.smoothZoomDurationOverrideMS = undefined;
        }

        uiController.canvasRenderer.updateCanvasParams();
    }
}
