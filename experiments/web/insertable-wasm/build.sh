#!/usr/bin/bash

emcc cpp/processor.cpp -o js/processor.js \
    -s EXPORTED_RUNTIME_METHODS='["cwrap", "setValue", "getValue"]' \
    -s EXPORTED_FUNCTIONS='["_malloc", "_free"]'
