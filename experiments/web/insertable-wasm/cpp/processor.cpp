// processor.cpp
//

#include <cmath>
#include <cstdint>
#include <iostream>

#include <emscripten.h>

extern "C"{

const float TWO_PI = 6.283185307179586f;

int32_t EMSCRIPTEN_KEEPALIVE getOne() {
    return 1;
}

void EMSCRIPTEN_KEEPALIVE helloWorld() {
    std::cout << "helloWorld()" << std::endl;
}

void EMSCRIPTEN_KEEPALIVE addTonePulse(float* oscillatorA, float* oscillatorB, float* block) {
    // ocillator = [ omega, phase ]
    float omegaA = oscillatorA[0];
    float phaseA = oscillatorA[1];
    float omegaB = oscillatorB[0];
    float phaseB = oscillatorB[1];

    // block = [ num_channels, num_frames, sample_rate, data... ]
    int32_t num_channels = (int32_t)(block[0]);
    int32_t num_frames = (int32_t)(block[1]);
    float dt = 1.0f / block[2];

    float* data = block + 3;
    for (int32_t i = 0; i < num_channels; ++i) {
        int32_t offset = i * num_frames;
        for (int32_t j = 0; j < num_frames; ++j) {
            float t = (float)j * dt;
            float a = std::sin(phaseA + omegaA * t);
            float b = std::sin(phaseB + omegaB * t);
            int32_t k = offset + j;
            data[k] = std::fmin(std::fmax(-1.0f, data[k] + 0.5f * a * b * b), 1.0f);
        }
    }

    // update oscillator phases
    float t = (float)(num_frames) * dt;
    phaseA += omegaA * t;
    if (phaseA > TWO_PI) {
        phaseA -= TWO_PI;
    }
    oscillatorA[1] = phaseA;
    phaseB += omegaB * t;
    if (phaseB > TWO_PI) {
        phaseB -= TWO_PI;
    }
    oscillatorB[1] = phaseB;
}

} // extern
